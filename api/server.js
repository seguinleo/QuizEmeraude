import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import crypto from 'crypto'
import { shuffleArray, questions } from './data/questions.js'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on port ${PORT}`)
})

const rooms = new Map()

const MAX_PLAYERS = 50
const MAX_QUESTIONS = 10
const MAX_TIME = 12

const difficulties = {
  1: 1,
  2: 2,
  3: 3,
  4: 5
}

function generateCode() {
  const char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'

  let code

  do {
    code = ''
    for (let i = 0; i < 5; i++) {
      code += char[
        crypto.randomInt(char.length)
      ]
    }
  } while (rooms.has(code))
  return code
}

function getEmeralds(question) {
  return difficulties[question.difficulty] || 0
}

function startTimer(room) {
  clearInterval(room.timer)

  room.timeLeft = MAX_TIME

  const target = room.code.startsWith('SOLO-')
    ? room.host
    : room.code

  io.to(target).emit('timer', {
    time: room.timeLeft
  })

  room.timer = setInterval(() => {
    if (room.status !== 'playing') {
      clearInterval(room.timer)
      room.timer = null
      return
    }

    room.timeLeft--

    io.to(target).emit('timer', {
      time: room.timeLeft
    })

    if (room.timeLeft <= 0) {
      clearInterval(room.timer)
      room.timer = null

      if (!room.questionChanging) {
        room.questionChanging = true

        setTimeout(() => {
          room.questionChanging = false

          if (room.status === 'playing') {
            nextQuestion(room)
          }
        }, 100)
      }
    }
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

  const question = room.questions[room.questionIndex]

  room.currentQuestion = question
  room.answers = new Map()
  room.questionChanging = false

  const answers = [
    question.good,
    ...question.wrong
  ].sort(() => Math.random() - 0.5)

  const questionData = {
    title: question.title,
    answers,
    difficulty: question.difficulty,
    theme: question.theme,
    number: room.questionIndex + 1,
    total: Math.min(
      MAX_QUESTIONS,
      room.questions.length
    ),
    time: MAX_TIME
  }

  const target = room.code.startsWith('SOLO-')
    ? room.host
    : room.code

  io.to(target).emit('new-question', questionData)
  startTimer(room)
}

function nextQuestion(room) {
  if (room.status !== 'playing') return
  clearInterval(room.timer)
  room.questionIndex++
  sendNextQuestion(room)
}

function finishGame(room) {
  clearInterval(room.timer)

  if (room.status === 'end') return

  room.status = 'end'

  const ranking = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      position: index + 1
    }))

  room.ranking = ranking

  if (room.code.startsWith('SOLO-')) {
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

  if (!/^[\p{L}\p{N}-]{1,16}$/u.test(normalized)) return null

  return normalized
}

io.on('connection', socket => {
  socket.on('start-solo', () => {
    const soloRoom = {
      code: `SOLO-${socket.id}`,
      host: socket.id,
      players: [
        {
          id: socket.id,
          name: 'Solo',
          host: true,
          score: 0
        }
      ],
      status: 'playing',
      questions: shuffleArray(questions),
      questionIndex: 0,
      currentQuestion: null,
      answers: new Map(),
      timer: null,
      timeLeft: MAX_TIME,
      questionChanging: false
    }
    socket.data.soloRoom = soloRoom
    sendNextQuestion(soloRoom)
  })

  socket.on('solo-answer', ({ answer }) => {
    const room = socket.data.soloRoom

    if (!room) return
    if (room.status !== 'playing') return
    if (!room.currentQuestion) return
    if (room.questionChanging) return
    if (room.answers.has(socket.id)) return

    const question = room.currentQuestion
    const player = room.players[0]

    const correct = answer === question.good
    const emeralds = correct
      ? getEmeralds(question)
      : 0

    room.answers.set(socket.id, answer)

    if (correct) {
      player.score += emeralds
    }

    socket.emit('answer-result', {
      correct,
      good: question.good,
      emeralds,
      score: player.score
    })

    clearInterval(room.timer)

    if (!room.questionChanging) {
      room.questionChanging = true

      setTimeout(() => {
        room.questionChanging = false

        if (room.status !== 'playing') return

        nextQuestion(room)
      }, 1000)
    }
  })

  socket.on('create-room', async ({ name }) => {
    const normalizedName = validateName(name)

    if (!normalizedName) {
      socket.emit('room-error', 'Pseudo invalide.')
      return
    }

    const code = generateCode()

    const room = {
      code,
      host: socket.id,
      players: [
        {
          id: socket.id,
          name: normalizedName,
          host: true,
          score: 0
        }
      ],
      status: 'lobby',
      questions: shuffleArray(questions),
      questionIndex: 0,
      currentQuestion: null,
      answers: new Map(),
      timer: null,
      timeLeft: MAX_TIME,
      questionChanging: false
    }

    rooms.set(code, room)

    socket.join(code)
    socket.emit('room-created', {
      code,
      players: room.players
    })
  })

  socket.on('join-room', async ({ code, name }) => {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase()

    if (!/^[A-Z2-9]{5}$/.test(normalizedCode)) {
      socket.emit('room-error', 'Code invalide.')
      return
    }

    const normalizedName = validateName(name)

    if (!normalizedName) {
      socket.emit('room-error', 'Pseudo invalide.')
      return
    }

    const room = rooms.get(normalizedCode)

    if (!room) {
      socket.emit(
        'room-error',
        'Cette partie n’existe pas.'
      )
      return
    }

    if (room.status !== 'lobby') {
      socket.emit(
        'room-error',
        'Cette partie a déjà commencé.'
      )
      return
    }

    const pseudoAlreadyUsed = room.players.some(
      player => player.name === normalizedName
    )

    if (pseudoAlreadyUsed) {
      socket.emit('room-error', 'Le pseudo est déjà utilisé.')
      return
    }

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('room-error', 'La partie est complète.')
      return
    }

    const alreadyInRoom = room.players.some(
      player => player.id === socket.id
    )

    if (alreadyInRoom) {
      socket.emit('room-joined', {
        code: room.code,
        players: room.players
      })
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

    io.to(room.code).emit(
      'players',
      room.players
    )
  })

  socket.on('start-game', ({ code }) => {
    const room = rooms.get(code)

    if (!room) return
    if (room.host !== socket.id) return
    if (room.status !== 'lobby') return
    if (room.players.length < 2) return

    room.status = 'playing'
    room.questionIndex = 0

    room.players.forEach(player => {
      player.score = 0
    })

    io.to(code).emit('game-started')
    sendNextQuestion(room)
  })

  socket.on('close-room', ({ code }) => {
    const room = rooms.get(code)

    if (!room) return
    if (room.host !== socket.id) return

    clearInterval(room.timer)
    room.timer = null
    room.status = 'closed'

    io.to(code).emit('room-closed')

    rooms.delete(code)
  })

  socket.on('answer', ({ code, answer }) => {
    const room = rooms.get(code)

    if (!room) return
    if (!socket.rooms.has(code)) return
    if (room.status !== 'playing') return
    if (!room.currentQuestion) return
    if (room.questionChanging) return

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

    if (!possibleAnswers.includes(answer)) {
      socket.emit('room-error', 'Réponse invalide.')
      return
    }

    const correct = answer === question.good
    const emeralds = correct
      ? getEmeralds(question)
      : 0

    room.answers.set(socket.id, answer)

    if (correct) {
      player.score += emeralds
    }

    socket.emit('answer-result', {
      correct,
      good: question.good,
      emeralds,
      score: player.score
    })

    if (
      room.answers.size >= room.players.length &&
      !room.questionChanging
    ) {
      room.questionChanging = true

      clearInterval(room.timer)
      setTimeout(() => {
        room.questionChanging = false
        if (room.status !== 'playing') return
        nextQuestion(room)
      }, 1000)
    }
  })

  socket.on('disconnect', () => {
    if (socket.data.soloRoom) {
      clearInterval(socket.data.soloRoom.timer)
      socket.data.soloRoom.status = 'end'
      socket.data.soloRoom = null
    }

    for (const [code, room] of rooms) {
      const player = room.players.find(
        player => player.id === socket.id
      )

      if (!player) continue

      if (room.host === socket.id) {
        clearInterval(room.timer)
        room.timer = null
        room.status = 'closed'

        io.to(code).emit('room-closed')

        rooms.delete(code)
        continue
      }

      room.players = room.players.filter(
        player => player.id !== socket.id
      )

      io.to(code).emit(
        'players',
        room.players
      )
    }
  })
})
