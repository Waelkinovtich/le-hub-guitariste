import { exercisesLibrary } from '../../data/mockData'

const difficultyColors = {
  Débutant: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  Intermédiaire: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Avancé: 'bg-guitar-600/15 text-guitar-400 border-guitar-600/25',
}

export default function ExercisesPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Bibliothèque d&apos;exercices</h1>
        <p className="text-muted-foreground mt-1">Ressources pédagogiques à assigner à vos élèves</p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {exercisesLibrary.map((exercise) => (
          <article
            key={exercise.id}
            className="glass-panel rounded-2xl p-5 hover:border-guitar-600/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                {exercise.category}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${difficultyColors[exercise.difficulty]}`}
              >
                {exercise.difficulty}
              </span>
            </div>
            <h3 className="font-semibold text-lg mb-2">{exercise.title}</h3>
            <p className="text-sm text-muted">Durée recommandée : {exercise.duration}</p>
            <button
              type="button"
              className="mt-4 text-sm text-guitar-400 hover:text-guitar-300 font-medium transition-colors cursor-not-allowed opacity-70"
              disabled
            >
              Assigner à un élève →
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
