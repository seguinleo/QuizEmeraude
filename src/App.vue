<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'

const socket = io('https://leoseguin.fr', {
  path: '/socket.io/'
})

const themes = [
  { id: 1, title: 'Culture classique', class: 'classique' },
  { id: 2, title: 'Culture moderne', class: 'moderne' },
  { id: 3, title: 'Histoire', class: 'histoire' },
  { id: 4, title: 'Géographie', class: 'geo' },
  { id: 5, title: 'Sciences et nature', class: 'science' },
  { id: 6, title: 'Sports', class: 'sport' },
  { id: 7, title: 'Culture générale', class: 'cultureg' }
]

const gameMode = ref(null)
const multiState = ref('home')
const roomCode = ref('')
const playerName = ref(localStorage.getItem('name') || '')
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
const fastestPlayer = ref(null)
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
  if (!currentQuestion.value) return
  if (answerResult.value !== null) return
  if (timeLeft.value <= 0) return

  selectedAnswer.value = answer

  if (gameMode.value === 'solo') {
    socket.emit('solo-answer', { answer })
  } else {
    socket.emit('answer', {
      code: roomCode.value,
      answer
    })
  }
}

const currentTheme = computed(() => {
  const themeId = currentQuestion.value?.theme
  return themes.find(theme => theme.id === themeId) ?? null
})

function createRoom() {
  const name = playerName.value.trim()

  if (!name) {
    showError('Pseudo invalide')
    return
  }

  localStorage.setItem('name', name)

  socket.emit('create-room', {
    name
  })
}

function joinRoom() {
  const name = playerName.value.trim()
  const code = roomCode.value.trim().toUpperCase()

  if (!name) {
    showError('Pseudo invalide')
    return
  }

  if (!code || code.length !== 5) {
    showError('Code invalide')
    return
  }

  localStorage.setItem('name', name)

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
  fastestPlayer.value = null
  quizEnd.value = false
  questionNumber.value = question.number
  totalQuestions.value = question.total
  timeLeft.value = question.time ?? 15
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
  showError('L’hôte a quitté la partie')
}

function onRoomError(message) {
  showError(
    typeof message === 'string'
      ? message
      : 'Une erreur est survenue'
  )
}

function onFastestAnswer(data) {
  fastestPlayer.value = data?.player ?? null
}

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
  socket.on('fastest-answer', onFastestAnswer)
  socket.on('game-end', onGameEnd)
  socket.on('solo-end', onSoloEnd)
  socket.on('room-closed', onRoomClosed)
  socket.on('room-error', onRoomError)
})

onUnmounted(() => {
  socket.off('room-created', onRoomCreated)
  socket.off('players', onPlayersUpdated)
  socket.off('game-started', onGameStarted)
  socket.off('new-question', onNewQuestion)
  socket.off('timer', onTimer)
  socket.off('answer-result', onAnswerResult)
  socket.off('fastest-answer', onFastestAnswer)
  socket.off('game-end', onGameEnd)
  socket.off('solo-end', onSoloEnd)
  socket.off('room-closed', onRoomClosed)
  socket.off('room-error', onRoomError)
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
    <section v-if="!gameMode" class="home">
      <h1>QuizÉmeraude</h1>
      <p class="welcome">
        Teste ta culture générale avec QuizÉmeraude ! Réponds à ce quiz en ligne pour gagner des émeraudes et défie tes amis dans des parties privées. Découvre aussi mon autre quiz sur les <a href="../paintings">tableaux célèbres</a> et sur les <a href="../flags">drapeaux du monde</a>. <a href="https://notida.fr/?link=a0a94f894dacb4f63961baaa9be35198">Fiche et ressources</a>.
      </p>
      <div class="gameMode">
        <button class="gameModeBtn greenBtn" @click="startSoloGame">
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
        <h2>Multijoueur</h2>
        <fieldset>
          <legend>Pseudo</legend>
          <input v-model="playerName" placeholder="Pseudo" aria-label="Pseudo" spellcheck="false" autocorrect="off"
            autocapitalize="none" autocomplete="off" maxlength="20">
        </fieldset>
      </div>
      <div class="multiGame">
        <fieldset>
          <legend>Rejoindre une partie privée</legend>
          <input v-model="roomCode" placeholder="Code de la partie" aria-label="Code de la partie" spellcheck="false"
            autocorrect="off" autocapitalize="none" autocomplete="off" maxlength="5">
          <button class="gameModeBtn blueBtn" @click="joinRoom">
            Rejoindre
          </button>
        </fieldset>
      </div>
      <div class="multiGame">
        <fieldset>
          <legend>Créer une partie privée</legend>
          <button class="gameModeBtn blueBtn" @click="createRoom">
            Créer
          </button>
        </fieldset>
      </div>
      <div class="gameMode">
        <button class="gameModeBtn redBtn" @click="gameMode = null">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" viewBox="0 0 640 640">
            <path fill="currentColor"
              d="M73.4 297.4C60.9 309.9 60.9 330.2 73.4 342.7L233.4 502.7C245.9 515.2 266.2 515.2 278.7 502.7C291.2 490.2 291.2 469.9 278.7 457.4L173.3 352L544 352C561.7 352 576 337.7 576 320C576 302.3 561.7 288 544 288L173.3 288L278.7 182.6C291.2 170.1 291.2 149.8 278.7 137.3C266.2 124.8 245.9 124.8 233.4 137.3L73.4 297.3z" />
          </svg>
          Accueil
        </button>
      </div>
    </section>
    <section v-else-if="
      gameMode === 'multi' &&
      multiState === 'lobby'
    ">
      <h2>
        <span>Partie #{{ roomCode }}</span>
        <button type="button" class="copyBtn" @click="copyRoomCode">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="24px">
            <path fill="currentColor"
              d="M448 96L439.4 96C428.4 76.9 407.7 64 384 64L256 64C232.3 64 211.6 76.9 200.6 96L192 96C156.7 96 128 124.7 128 160L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 160C512 124.7 483.3 96 448 96zM264 176C250.7 176 240 165.3 240 152C240 138.7 250.7 128 264 128L376 128C389.3 128 400 138.7 400 152C400 165.3 389.3 176 376 176L264 176z" />
          </svg>
        </button>
      </h2>
      <div v-if="isHost" class="gameMode">
        <button class="gameModeBtn redBtn" @click="closeMultiplayerGame">
          Fermer
        </button>
        <button class="gameModeBtn blueBtn" @click="startMultiplayerGame" :disabled="players.length < 2">
          Démarrer
        </button>
      </div>
      <p v-else>
        En attente de l'hôte...
      </p>
      <div class="playerList">
        <p>
          Joueurs
          ({{ players.length }})
        </p>
        <span v-for="player in players" :key="player.id" class="player">
          <span class="pseudo">{{ player.name }}</span>
          <span v-if="player.host" class="tagHost">
            Hôte
          </span>
        </span>
      </div>
    </section>
    <section v-else-if="isPlaying">
      <div id="top-text" v-if="currentQuestion">
        <div class="themes">
          <span v-if="currentTheme" class="theme" :class="currentTheme.class">
            {{ currentTheme.title }}
          </span>
        </div>
        <p class="questionTitle">
          {{ currentQuestion.title }}
        </p>
        <div class="gameMode">
          <div v-if="fastestPlayer && answerResult" class="fasterPlayer">
            ⚡{{ fastestPlayer.name }}
            {{ (fastestPlayer.responseTime / 1000).toFixed(1) }}s
          </div>
        </div>
      </div>
      <div class="answers" v-if="currentQuestion">
        <button v-for="answer in answers" :key="answer" @click="selectAnswer(answer)" :class="{
          standby: !answerResult && answer === selectedAnswer,
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
      <h2>Partie terminée !</h2>
      <div class="gameMode">
        <button class="gameModeBtn redBtn" @click="
          gameMode = null;
        multiState = 'home'
          ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" viewBox="0 0 640 640">
            <path fill="currentColor"
              d="M73.4 297.4C60.9 309.9 60.9 330.2 73.4 342.7L233.4 502.7C245.9 515.2 266.2 515.2 278.7 502.7C291.2 490.2 291.2 469.9 278.7 457.4L173.3 352L544 352C561.7 352 576 337.7 576 320C576 302.3 561.7 288 544 288L173.3 288L278.7 182.6C291.2 170.1 291.2 149.8 278.7 137.3C266.2 124.8 245.9 124.8 233.4 137.3L73.4 297.3z" />
          </svg>
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
      <h2>Classement final</h2>
      <div class="gameMode">
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
      </div>
      <div class="playerList">
        <span v-for="player in finalRanking" :key="player.id" class="player">
          <strong>
            {{ player.rank }}.
            {{ player.name }}
          </strong>
          <span>
            <img src="./assets/emeraude.png" width="14px">
            {{ player.score }}
          </span>
        </span>
      </div>
    </section>
  </main>
</template>
