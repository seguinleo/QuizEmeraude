<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'

const socket = io({
  withCredentials: true
})

const themes = [
  { id: 1, title: '📖 Littérature et théâtre' },
  { id: 2, title: '🎨 Peinture' },
  { id: 3, title: '🗿 Sculpture et architecture' },
  { id: 4, title: '🎻 Musique et danse' },
  { id: 5, title: '🎥 Cinéma et TV' },
  { id: 6, title: '🏺 Mythologies et religions' },
  { id: 7, title: '📜 Histoire' },
  { id: 8, title: '🌍 Géographie' },
  { id: 9, title: '🧪 Sciences et nature' },
  { id: 10, title: '🎮 Jeu vidéo et Internet' },
  { id: 11, title: '🎾 Sports' },
  { id: 12, title: '🥐 Gastronomie' },
  { id: 13, title: '🧠 Culture générale' }
]

const gameMode = ref(null)
const multiState = ref('home')
const roomCode = ref('')
const playerName = ref('')
const players = ref([])
const isHost = ref(false)
const currentQuestion = ref(null)
const answerResult = ref(null)
const quizEnd = ref(false)
const answers = ref([])
const selectedAnswer = ref(null)
const score = ref(0)
const questionNumber = ref(0)
const timeLeft = ref(15)
const totalQuestions = ref(10)
const finalRanking = ref([])
const codeCopied = ref(false)
const isPlaying = computed(() => {
  return (
    (gameMode.value === 'solo' && !quizEnd.value) ||
    (gameMode.value === 'multi' && multiState.value === 'playing')
  )
})

async function copyRoomCode() {
  if (!roomCode.value) return

  try {
    await navigator.clipboard.writeText(roomCode.value)

    codeCopied.value = true

    setTimeout(() => {
      codeCopied.value = false
    }, 1500)
  } catch (error) {
    console.error('Impossible de copier le code :', error)
  }
}

function startSoloGame() {
  gameMode.value = 'solo'
  score.value = 0
  questionNumber.value = 0
  quizEnd.value = false
  selectedAnswer.value = null
  currentQuestion.value = null
  answers.value = []
  timeLeft.value = 12
  socket.emit('start-solo')
}

function selectAnswer(answer) {
  if (selectedAnswer.value !== null) return
  if (!currentQuestion.value) return
  if (answerResult.value !== null) return

  selectedAnswer.value = answer

  if (gameMode.value === 'solo') {
    socket.emit('solo-answer', {
      answer
    })
  } else {
    socket.emit('answer', {
      code: roomCode.value,
      answer
    })
  }
}

const currentThemes = computed(() => {
  const themeIds = currentQuestion.value?.theme ?? []

  return themes
    .filter(theme => themeIds.includes(theme.id))
    .map(theme => theme.title)
})

function createRoom() {
  if (!playerName.value.trim()) return

  socket.emit('create-room', {
    name: playerName.value.trim()
  })
}

function joinRoom() {
  const name = playerName.value.trim()
  const code = roomCode.value.trim().toUpperCase()

  if (!name) {
    showError('Entre ton pseudo.')
    return
  }

  if (!code) {
    showError('Entre le code de la partie.')
    return
  }

  if (code.length !== 5) {
    showError('Le code doit contenir 5 caractères.')
    return
  }

  socket.emit('join-room', {
    code,
    name
  })
}

function startMultiplayerGame() {
  socket.emit('start-game', {
    code: roomCode.value
  })
}

function closeMultiplayerGame() {
  socket.emit('close-room', {
    code: roomCode.value
  })
}

function setQuestion(question) {
  currentQuestion.value = question
  answers.value = [...question.answers]
  selectedAnswer.value = null
  answerResult.value = null
  quizEnd.value = false
  questionNumber.value = question.number
  totalQuestions.value = question.total
  timeLeft.value = question.time ?? 12
}

function finishSoloGame() {
  quizEnd.value = true
  currentQuestion.value = null
  answers.value = []
}

function finishMultiplayerGame(ranking) {
  finalRanking.value = ranking || []
  multiState.value = 'results'
  quizEnd.value = true
  currentQuestion.value = null
  answers.value = []
}

function onRoomCreated(data) {
  roomCode.value = data.code
  players.value = data.players || []
  isHost.value = true
  gameMode.value = 'multi'
  multiState.value = 'lobby'
}

function onPlayersUpdated(newPlayers) {
  players.value = newPlayers
}

function onGameStarted() {
  gameMode.value = 'multi'
  multiState.value = 'playing'
  score.value = 0
  questionNumber.value = 0
  quizEnd.value = false
  finalRanking.value = []
}

function onNewQuestion(question) {
  setQuestion(question)
}

function onTimer(data) {
  timeLeft.value = data.time
}

function onRoomJoined(data) {
  roomCode.value = data.code
  players.value = data.players
  isHost.value = false
  gameMode.value = 'multi'
  multiState.value = 'lobby'
}

function onAnswerResult(data) {
  if (!data) return
  answerResult.value = data
  score.value = data.score
}

function onRoomClosed() {
  gameMode.value = 'multi'
  multiState.value = 'home'
  roomCode.value = ''
  players.value = []
  isHost.value = false
  currentQuestion.value = null
  answers.value = []
  finalRanking.value = []
  quizEnd.value = false
  selectedAnswer.value = null
  score.value = 0
  showError('L’hôte a quitté la partie.')
}

socket.on('room-error', message => {
  showError(message)
})

function onGameEnd(data) {
  finishMultiplayerGame(data.ranking)
}

function onSoloEnd(data) {
  score.value = data.score
  finishSoloGame()
}

let errorTimeout = null

function showError(message) {
  const notification = document.querySelector('#error-notification')

  if (!notification) return

  if (errorTimeout) {
    clearTimeout(errorTimeout)
  }

  notification.textContent = message
  notification.classList.remove('d-none')

  errorTimeout = setTimeout(() => {
    notification.classList.add('d-none')
  }, 4000)
}

onMounted(() => {
  socket.on('room-created', onRoomCreated)
  socket.on('room-joined', onRoomJoined)
  socket.on('players', onPlayersUpdated)
  socket.on('game-started', onGameStarted)
  socket.on('new-question', onNewQuestion)
  socket.on('timer', onTimer)
  socket.on('answer-result', onAnswerResult)
  socket.on('game-end', onGameEnd)
  socket.on('solo-end', onSoloEnd)
  socket.on('room-closed', onRoomClosed)
})

onUnmounted(() => {
  socket.off('room-created', onRoomCreated)
  socket.off('players', onPlayersUpdated)
  socket.off('game-started', onGameStarted)
  socket.off('new-question', onNewQuestion)
  socket.off('timer', onTimer)
  socket.off('answer-result', onAnswerResult)
  socket.off('game-end', onGameEnd)
  socket.off('solo-end', onSoloEnd)
  socket.off('room-closed', onRoomClosed)
})
</script>

<template>
  <div id="error-notification" aria-live="polite" class="d-none"></div>
  <main>
    <header id="score" v-if="gameMode === 'solo' || multiState === 'playing'">
      <div>
        <span>
          <img src="./assets/emeraude.png" width="14px">
          {{ score }}
        </span>
      </div>
      <div>
        <span>Question</span>
        <span>
          {{ questionNumber }} / {{ totalQuestions }}
        </span>
      </div>
      <div v-if="!quizEnd">
        <span>Temps</span>
        <span :class="{ danger: timeLeft <= 5 }">
          {{ timeLeft }}s
        </span>
      </div>
    </header>
    <section v-if="!gameMode">
      <h1>
        <span>QuizÉmeraude</span>
      </h1>
      <p class="welcome">
        Bienvenue sur QuizÉmeraude ! Réponds à des questions de culture générale sous forme de QCM pour collecter des
        émeraudes. Défie aussi tes amis dans des parties privées accessibles via un code.
      </p>
      <div class="gameMode">
        <button class="gameModeBtn" @click="startSoloGame">
          Solo
        </button>
        <button class="gameModeBtn blueBtn" @click="gameMode = 'multi'">
          Multijoueur
        </button>
      </div>
    </section>
    <section v-else-if="
      gameMode === 'multi' &&
      multiState === 'home'
    ">
      <div class="multiGame">
        <h1>Multijoueur</h1>
        <fieldset>
          <legend>Créer une partie privée</legend>
          <input v-model="playerName" placeholder="Ton pseudo" maxlength="16">
          <button class="gameModeBtn blueBtn" @click="createRoom">
            Créer
          </button>
        </fieldset>
      </div>
      <div class="multiGame">
        <fieldset>
          <legend>Rejoindre une partie privée</legend>
          <input v-model="roomCode" placeholder="Code de la partie" maxlength="5">
          <button class="gameModeBtn blueBtn" @click="joinRoom">
            Rejoindre
          </button>
        </fieldset>
      </div>
      <button class="gameModeBtn" @click="gameMode = null">
        Accueil
      </button>
    </section>
    <section v-else-if="
      gameMode === 'multi' &&
      multiState === 'lobby'
    ">
      <h1>Partie #{{ roomCode }}</h1>
      <div class="roomCodeContainer">
        <div class="roomCode">
          {{ roomCode }}
        </div>
        <button type="button" @click="copyRoomCode">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="24px">
            <path fill="currentColor"
              d="M448 96L439.4 96C428.4 76.9 407.7 64 384 64L256 64C232.3 64 211.6 76.9 200.6 96L192 96C156.7 96 128 124.7 128 160L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 160C512 124.7 483.3 96 448 96zM264 176C250.7 176 240 165.3 240 152C240 138.7 250.7 128 264 128L376 128C389.3 128 400 138.7 400 152C400 165.3 389.3 176 376 176L264 176z" />
          </svg>
        </button>
      </div>
      <h2>Joueurs</h2>
      <div class="playerList">
        <span v-for="player in players" :key="player.id" class="player">
          {{ player.name }}
          <span v-if="player.host" class="tagHost">
            Hôte
          </span>
        </span>
      </div>
      <div v-if="isHost" class="gameMode">
        <button class="redBtn" @click="closeMultiplayerGame">
          Fermer
        </button>
        <button class="blueBtn" @click="startMultiplayerGame" :disabled="players.length < 2">
          Démarrer
        </button>
      </div>
      <p v-else>
        En attente de l'hôte...
      </p>
    </section>
    <section v-else-if="isPlaying">
      <div id="top-text" v-if="currentQuestion">
        <div class="themes">
          <span v-for="(theme, i) in currentThemes" :key="i" class="theme">
            {{ theme }}
          </span>
        </div>
        <p>
          {{ currentQuestion.title }}
        </p>
      </div>
      <div class="answers" v-if="currentQuestion">
        <button v-for="answer in answers" :key="answer" @click="selectAnswer(answer)" :class="{
          correct: answerResult && answer === answerResult.good,
          wrong:
            answerResult &&
            answer === selectedAnswer &&
            answer !== answerResult.good
        }">
          {{ answer }}
        </button>
      </div>
    </section>
    <section v-else-if="
      gameMode === 'solo' &&
      quizEnd
    ">
      <h1>Partie terminée !</h1>
      <div class="gameMode">
        <button class="gameModeBtn" @click="
          gameMode = null;
        multiState = 'home'
          ">
          Accueil
        </button>
        <button class="gameModeBtn blueBtn" @click="startSoloGame">
          Rejouer
        </button>
      </div>
    </section>
    <section v-else-if="
      gameMode === 'multi' &&
      multiState === 'results'
    ">
      <h1>Classement final</h1>
      <div class="playerList">
        <span v-for="(player, index) in finalRanking" :key="player.id" class="player">
          <strong>
            {{ index + 1 }}.
            {{ player.name }}
          </strong>
          <span>
            <img src="./assets/emeraude.png" width="14px">
            {{ player.score }}
          </span>
        </span>
      </div>
      <button class="blueBtn" @click="
        gameMode = 'multi';
      multiState = 'home';
      finalRanking = [];
      roomCode = '';
      players = [];
      isHost = false;
      ">
        Nouvelle partie
      </button>
    </section>
  </main>
  <footer>
    màj 02/10/26, <a href="https://github.com/seguinleo/QuizEmeraude/discussions" rel="noopener noreferrer">proposer des
      questions</a>
  </footer>
</template>
