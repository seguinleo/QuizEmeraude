import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import crypto from 'crypto'
import { shuffleArray, questions } from './data/questions.js'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

const MAX_PLAYERS = 50
const MAX_QUESTIONS = 10
const MAX_TIME = 15
const RESULT_TIME = 2000

const difficulties = {
  1: 1,
  2: 2,
  3: 3,
  4: 5
}

const allowedOrigins = [
  'https://leoseguin.fr',
  'http://localhost:5173'
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-csrf-token']
}))

app.use(express.json({ limit: '10kb' }))

const PORT = 3006
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 16 * 1024
})

const connectionAttempts = new Map()
const rooms = new Map()

setInterval(() => {
  const now = Date.now()

  for (const [ip, entry] of connectionAttempts) {
    if (now - entry.time > 60_000) {
      connectionAttempts.delete(ip)
    }
  }
}, 60_000).unref()

io.use((socket, next) => {
  const ip = socket.handshake.address
  const now = Date.now()
  const entry = connectionAttempts.get(ip)

  if (!entry || now - entry.time > 60_000) {
    connectionAttempts.set(ip, {
      time: now,
      count: 1
    })

    return next()
  }

  entry.count++

  if (entry.count > 50) {
    return next(new Error('Too many connections'))
  }

  next()
})

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'
  let code

  do {
    code = ''

    for (let i = 0; i < 5; i++) {
      code += chars[crypto.randomInt(chars.length)]
    }
  } while (rooms.has(code))

  return code
}

function getEmeralds(question) {
  return difficulties[question.difficulty] || 0
}

function isSolo(room) {
  return room.code.startsWith('SOLO-')
}

function getTarget(room) {
  return isSolo(room) ? room.host : room.code
}

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer)
    room.timer = null
  }
}

function clearNextQuestionTimeout(room) {
  if (room.nextQuestionTimeout) {
    clearTimeout(room.nextQuestionTimeout)
    room.nextQuestionTimeout = null
  }
}

function scheduleNextQuestion(room) {
  clearNextQuestionTimeout(room)

  room.nextQuestionTimeout = setTimeout(() => {
    room.nextQuestionTimeout = null

    if (room.status !== 'playing') return

    nextQuestion(room)
  }, RESULT_TIME)
}

function sendAnswerResult(room, player) {
  const question = room.currentQuestion
  if (!question) return

  const hasAnswered = room.answers.has(player.id)
  const answer = room.answers.get(player.id)

  const correct = hasAnswered && answer === question.good
  const emeralds = correct ? getEmeralds(question) : 0

  io.to(player.id).emit('answer-result', {
    correct,
    good: question.good,
    emeralds,
    score: player.score,
    answered: hasAnswered
  })
}

function sendResultsToAll(room) {
  for (const player of room.players) {
    sendAnswerResult(room, player)
  }
}

function startTimer(room) {
  stopTimer(room)

  room.timeLeft = MAX_TIME

  const target = getTarget(room)

  io.to(target).emit('timer', {
    time: room.timeLeft
  })

  room.timer = setInterval(() => {
    if (room.status !== 'playing') {
      stopTimer(room)
      return
    }

    if (room.questionChanging) {
      stopTimer(room)
      return
    }

    room.timeLeft--

    io.to(target).emit('timer', {
      time: room.timeLeft
    })

    if (room.timeLeft > 0) return

    stopTimer(room)
    room.questionChanging = true

    sendResultsToAll(room)

    scheduleNextQuestion(room)
  }, 1000)
}

function sendNextQuestion(room) {
  if (room.status !== 'playing') return
  if (
    room.questionIndex >= MAX_QUESTIONS ||
    room.questionIndex >= room.questions.length
  ) {
    finishGame(room)
    return
  }

  clearNextQuestionTimeout(room)

  const question = room.questions[room.questionIndex]

  room.currentQuestion = question
  room.answers = new Map()
  room.questionChanging = false
  room.questionDeadline = Date.now() + MAX_TIME * 1000

  const answers = shuffleArray([
    question.good,
    ...question.wrong
  ])

  const questionData = {
    title: question.title,
    answers,
    difficulty: question.difficulty,
    theme: question.theme,
    number: room.questionIndex + 1,
    total: Math.min(MAX_QUESTIONS, room.questions.length),
    time: MAX_TIME
  }

  io.to(getTarget(room)).emit('new-question', questionData)

  startTimer(room)
}

function nextQuestion(room) {
  if (room.status !== 'playing') return

  stopTimer(room)
  clearNextQuestionTimeout(room)

  room.questionIndex++

  sendNextQuestion(room)
}

function finishGame(room) {
  stopTimer(room)
  clearNextQuestionTimeout(room)

  if (room.status === 'end') return

  room.status = 'end'

  const sortedPlayers = [...room.players].sort(
    (a, b) => b.score - a.score
  )

  let ranking = []
  let currentPosition = 1

  sortedPlayers.forEach((player, index) => {
    if (
      index > 0 &&
      player.score !== sortedPlayers[index - 1].score
    ) {
      currentPosition = index + 1
    }

    ranking.push({
      id: player.id,
      name: player.name,
      score: player.score,
      rank: currentPosition
    })
  })

  room.ranking = ranking

  setTimeout(() => {
    rooms.delete(room.code)
  }, 60_000)

  if (isSolo(room)) {
    io.to(room.host).emit('solo-end', {
      score: room.players[0].score
    })
    return
  }

  io.to(room.code).emit('game-end', {
    ranking
  })
}

function validateName(name) {
  if (typeof name !== 'string') return null

  const normalized = name.trim()

  if (!/^[\p{L}\p{N}-]{1,16}$/u.test(normalized)) {
    return null
  }

  return normalized
}

function createRoomState({
  code,
  host,
  name,
  status
}) {
  return {
    code,
    host,
    players: [
      {
        id: host,
        name,
        host: true,
        score: 0
      }
    ],
    status,
    questions: shuffleArray(questions),
    questionIndex: 0,
    currentQuestion: null,
    answers: new Map(),
    timer: null,
    nextQuestionTimeout: null,
    timeLeft: MAX_TIME,
    questionDeadline: 0,
    questionChanging: false
  }
}

io.on('connection', socket => {
  socket.on('start-solo', () => {
    if (socket.data.soloRoom?.status === 'playing') return

    const soloRoom = createRoomState({
      code: `SOLO-${socket.id}`,
      host: socket.id,
      name: 'Solo',
      status: 'playing',
      solo: true
    })

    socket.data.soloRoom = soloRoom

    sendNextQuestion(soloRoom)
  })

  socket.on('solo-answer', payload => {
    if (!payload || typeof payload !== 'object') return

    const { answer } = payload
    const room = socket.data.soloRoom

    if (!room) return
    if (room.status !== 'playing') return
    if (!room.currentQuestion) return
    if (room.questionChanging) return
    if (room.answers.has(socket.id)) return
    if (Date.now() >= room.questionDeadline) return

    const question = room.currentQuestion

    const possibleAnswers = [
      question.good,
      ...question.wrong
    ]

    if (
      typeof answer !== 'string' ||
      !possibleAnswers.includes(answer)
    ) {
      socket.emit('room-error', 'Réponse invalide')
      return
    }

    const player = room.players[0]
    const correct = answer === question.good
    const emeralds = correct ? getEmeralds(question) : 0

    room.answers.set(socket.id, answer)

    if (correct) {
      player.score += emeralds
    }

    room.questionChanging = true
    stopTimer(room)

    sendAnswerResult(room, player)

    scheduleNextQuestion(room)
  })

  socket.on('create-room', payload => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      socket.emit('room-error', 'Données invalides')
      return
    }

    const normalizedName = validateName(payload.name)

    if (!normalizedName) {
      socket.emit('room-error', 'Pseudo invalide')
      return
    }

    const code = generateCode()
    const room = createRoomState({
      code,
      host: socket.id,
      name: normalizedName,
      status: 'lobby'
    })

    rooms.set(code, room)

    socket.join(code)
    socket.emit('room-created', {
      code,
      players: room.players
    })
  })

  socket.on('join-room', payload => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return
    }

    const normalizedCode = String(payload.code || '')
      .trim()
      .toUpperCase()

    if (!/^[A-Z1-9]{5}$/.test(normalizedCode)) {
      socket.emit('room-error', 'Code invalide')
      return
    }

    const normalizedName = validateName(payload.name)

    if (!normalizedName) {
      socket.emit('room-error', 'Pseudo invalide')
      return
    }

    const room = rooms.get(normalizedCode)

    if (!room) {
      socket.emit('room-error', 'Partie introuvable')
      return
    }

    if (room.status !== 'lobby') {
      socket.emit('room-error', 'La partie a déjà commencé')
      return
    }

    const pseudoAlreadyUsed = room.players.some(
      player =>
        player.name.toLowerCase() === normalizedName.toLowerCase()
    )

    if (pseudoAlreadyUsed) {
      socket.emit('room-error', 'Le pseudo est déjà utilisé')
      return
    }

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('room-error', 'La partie est complète')
      return
    }

    const player = {
      id: socket.id,
      name: normalizedName,
      host: false,
      score: 0
    }

    room.players.push(player)

    socket.join(room.code)
    socket.emit('room-joined', {
      code: room.code,
      players: room.players
    })

    io.to(room.code).emit('players', room.players)
  })

  socket.on('start-game', payload => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof payload.code !== 'string'
    ) {
      return
    }

    const room = rooms.get(payload.code)

    if (!room) return
    if (room.host !== socket.id) return
    if (room.status !== 'lobby') return
    if (room.players.length < 2) return

    room.players.forEach(player => {
      player.score = 0
    })

    room.status = 'playing'
    room.questionIndex = 0

    io.to(room.code).emit('game-started')

    sendNextQuestion(room)
  })

  socket.on('answer', payload => {
    if (!payload || typeof payload !== 'object') return

    const { code, answer } = payload
    const room = rooms.get(code)

    if (!room) return
    if (!socket.rooms.has(code)) return
    if (room.status !== 'playing') return
    if (!room.currentQuestion) return
    if (room.questionChanging) return
    if (Date.now() >= room.questionDeadline) return

    const player = room.players.find(
      player => player.id === socket.id
    )

    if (!player) return
    if (room.answers.has(socket.id)) return

    const question = room.currentQuestion

    const possibleAnswers = [
      question.good,
      ...question.wrong
    ]

    if (
      typeof answer !== 'string' ||
      !possibleAnswers.includes(answer)
    ) {
      socket.emit('room-error', 'Réponse invalide')
      return
    }

    const correct = answer === question.good
    const emeralds = correct ? getEmeralds(question) : 0

    room.answers.set(socket.id, answer)

    if (correct) {
      player.score += emeralds
    }

    socket.emit('answer-standby', {
      answered: true
    })
  })

  socket.on('close-room', payload => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof payload.code !== 'string'
    ) {
      return
    }

    const room = rooms.get(payload.code)

    if (!room) return
    if (room.host !== socket.id) return

    stopTimer(room)
    clearNextQuestionTimeout(room)

    room.status = 'closed'

    io.to(room.code).emit('room-closed')

    rooms.delete(room.code)
  })

  socket.on('disconnect', () => {
    if (socket.data.soloRoom) {
      const soloRoom = socket.data.soloRoom

      stopTimer(soloRoom)
      clearNextQuestionTimeout(soloRoom)

      soloRoom.status = 'end'
      socket.data.soloRoom = null
    }

    for (const [code, room] of rooms) {
      const player = room.players.find(
        player => player.id === socket.id
      )

      if (!player) continue

      if (player.host || room.host === socket.id) {
        stopTimer(room)
        clearNextQuestionTimeout(room)

        room.status = 'closed'

        io.to(code).emit('room-closed')

        rooms.delete(code)
        break
      }

      room.players = room.players.filter(
        player => player.id !== socket.id
      )

      room.answers.delete(socket.id)

      io.to(code).emit('players', room.players)

      break
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on port ${PORT}`)
})
