import crypto from 'crypto'

function shuffleArray(array) {
  const result = [...array]

  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)

    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

const questions = [
  {
    id: 1,
    theme: [8, 7],
    difficulty: 2,
    title: 'Quelle ville actuelle s’est successivement appelée Byzance puis Constantinople ?',
    good: 'Istanbul',
    wrong: ['Athènes', 'Rome', 'Sofia']
  },
  {
    id: 2,
    theme: [1],
    difficulty: 2,
    title: 'Qui a écrit le roman Gargantua vers 1535 ?',
    good: 'François Rabelais',
    wrong: ['Pierre de Ronsard', 'Molière', 'William Shakespeare']
  },
  {
    id: 3,
    theme: [1],
    difficulty: 2,
    title: 'Quel groupe de poètes français du XVIe siècle était composé notamment de Pierre de Ronsard et Joachim du Bellay ?',
    good: 'La Pléiade',
    wrong: ['Les Artistes Anonymes Associés', 'Le Forum', 'Les Francs-maçons']
  },
  {
    id: 4,
    theme: [1],
    difficulty: 2,
    title: 'Quel philosophe est notamment connu pour avoir employé la formule « Je pense, donc je suis » ?',
    good: 'René Descartes',
    wrong: ['Platon', 'Socrate', 'Pierre Corneille']
  },
  {
    id: 5,
    theme: [1],
    difficulty: 2,
    title: 'Dans quelle œuvre peut-on lire « À vaincre sans péril, on triomphe sans gloire » ?',
    good: 'Le Cid',
    wrong: ['Le Corbeau et le Renard', 'Dom Juan', 'Hamlet']
  },
  {
    id: 6,
    theme: [1],
    difficulty: 4,
    title: 'Laquelle de ces fables de La Fontaine n’existe pas ?',
    good: 'Le Paon et le Coq',
    wrong: ['La Goutte et l’Araignée', 'Le Lion et le Moucheron', 'Le Renard et le Bouc']
  },
  {
    id: 7,
    theme: [1],
    difficulty: 2,
    title: 'Quel était le vrai nom de Molière ?',
    good: 'Jean-Baptiste Poquelin',
    wrong: ['Jean-François Poquelin', 'Jean-Pierre Poquelin', 'Jean-Philippe Poquelin']
  },
  {
    id: 8,
    theme: [1],
    difficulty: 1,
    title: 'Laquelle de ces propositions désigne un célèbre dramaturge français du XVIIe siècle ?',
    good: 'Jean Racine',
    wrong: ['Jean Terre', 'Jean Cule', 'Jean Neymar']
  },
  {
    id: 9,
    theme: [1],
    difficulty: 3,
    title: 'Quel auteur avait pour vrai nom Charles Louis de Secondat ?',
    good: 'Montesquieu',
    wrong: ['Marivaux', 'Voltaire', 'Stendhal']
  },
  {
    id: 10,
    theme: [1],
    difficulty: 2,
    title: 'Quelle œuvre est attribuée à Beaumarchais ?',
    good: 'Le Barbier de Séville',
    wrong: ['Le Coiffeur de Séville', 'Le Vendeur de Séville', 'Le Touriste de Séville']
  }
  // etc.
]

export { shuffleArray, questions }
