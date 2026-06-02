export const DEMO_ACCOUNTS = {
  teacher: {
    email: 'marie.dubois@guitare.fr',
    password: 'prof2024',
    name: 'Marie Dubois',
    role: 'teacher',
  },
  student: {
    email: 'lucas.martin@guitare.fr',
    password: 'eleve2024',
    name: 'Lucas Martin',
    role: 'student',
  },
}

export const teacherStats = [
  { label: 'Élèves actifs', value: '12', change: '+2 ce mois' },
  { label: 'Cours cette semaine', value: '18', change: '6 aujourd\'hui' },
  { label: 'Exercices assignés', value: '34', change: '8 en attente' },
  { label: 'Taux de présence', value: '94%', change: '+3% vs mois dernier' },
]

export const students = [
  { id: 1, name: 'Lucas Martin', level: 'Intermédiaire', instrument: 'Guitare électrique', nextLesson: 'Aujourd\'hui 17h00', progress: 72 },
  { id: 2, name: 'Emma Leroy', level: 'Débutant', instrument: 'Guitare folk', nextLesson: 'Demain 14h30', progress: 38 },
  { id: 3, name: 'Théo Bernard', level: 'Avancé', instrument: 'Guitare classique', nextLesson: 'Mer. 10h00', progress: 89 },
  { id: 4, name: 'Léa Petit', level: 'Intermédiaire', instrument: 'Guitare électrique', nextLesson: 'Jeu. 18h00', progress: 61 },
  { id: 5, name: 'Hugo Moreau', level: 'Débutant', instrument: 'Guitare folk', nextLesson: 'Ven. 16h00', progress: 24 },
]

export const upcomingLessons = [
  { id: 1, student: 'Lucas Martin', time: '17:00', date: 'Aujourd\'hui', topic: 'Improvisation blues — gamme pentatonique' },
  { id: 2, student: 'Emma Leroy', time: '14:30', date: 'Demain', topic: 'Accords barrés — introduction' },
  { id: 3, student: 'Théo Bernard', time: '10:00', date: 'Mercredi', topic: 'Pièce : Recuerdos de la Alhambra' },
  { id: 4, student: 'Léa Petit', time: '18:00', date: 'Jeudi', topic: 'Techniques de bend et vibrato' },
]

export const exercisesLibrary = [
  { id: 1, title: 'Chromatique — montée/descente', category: 'Technique', difficulty: 'Débutant', duration: '10 min' },
  { id: 2, title: 'Métronome 80 BPM — alternate picking', category: 'Rythmique', difficulty: 'Intermédiaire', duration: '15 min' },
  { id: 3, title: 'Gammes majeures — 5 positions', category: 'Théorie', difficulty: 'Intermédiaire', duration: '20 min' },
  { id: 4, title: 'Arpèges maj7 — enchaînements', category: 'Harmonie', difficulty: 'Avancé', duration: '25 min' },
]

export const studentProfile = {
  name: 'Lucas Martin',
  level: 'Intermédiaire',
  teacher: 'Marie Dubois',
  memberSince: 'Septembre 2024',
  streak: 12,
  totalHours: 48,
}

export const studentProgress = [
  { skill: 'Technique', percent: 75 },
  { skill: 'Rythmique', percent: 68 },
  { skill: 'Théorie', percent: 55 },
  { skill: 'Repertoire', percent: 82 },
]

export const assignedExercises = [
  { id: 1, title: 'Pentatonique mineure — position 1', due: 'Vendredi', status: 'en_cours', completed: false },
  { id: 2, title: 'Backing track blues — 12 mesures', due: 'Lundi prochain', status: 'a_faire', completed: false },
  { id: 3, title: 'Lecture rythmique — noires et croches', due: 'Terminé', status: 'termine', completed: true },
]

export const studentLessons = [
  { id: 1, date: '28 mai 2026', topic: 'Blues shuffle — rythmique main droite', notes: 'Bon progrès sur le shuffle. Continuer à 90 BPM.' },
  { id: 2, date: '21 mai 2026', topic: 'Accords de 7ème dominante', notes: 'Travailler les transitions Am7 → D7 → G7.' },
  { id: 3, date: '14 mai 2026', topic: 'Introduction au bending', notes: 'Viser la justesse — utiliser le tuner.' },
]
