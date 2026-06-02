import { assignedExercises } from '../../data/mockData'

export default function StudentExercisesPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mes exercices</h1>
        <p className="text-muted-foreground mt-1">Travaillez à votre rythme entre les cours</p>
      </header>

      <div className="space-y-4">
        {assignedExercises.map((ex) => (
          <article
            key={ex.id}
            className={`glass-panel rounded-2xl p-6 ${
              ex.completed ? 'opacity-70' : 'border-guitar-600/20'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 ${
                    ex.completed
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-guitar-600/15 text-guitar-400'
                  }`}
                >
                  {ex.completed ? 'Terminé' : ex.status === 'en_cours' ? 'En cours' : 'À faire'}
                </span>
                <h3 className={`text-lg font-semibold ${ex.completed ? 'line-through text-muted' : ''}`}>
                  {ex.title}
                </h3>
                {!ex.completed && (
                  <p className="text-sm text-muted-foreground mt-1">À rendre avant le {ex.due}</p>
                )}
              </div>
              {!ex.completed && (
                <button
                  type="button"
                  className="shrink-0 px-4 py-2 rounded-xl border border-guitar-600/40 text-guitar-400 text-sm font-medium hover:bg-guitar-600/10 transition-colors cursor-not-allowed opacity-70"
                  disabled
                >
                  Marquer comme fait
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
