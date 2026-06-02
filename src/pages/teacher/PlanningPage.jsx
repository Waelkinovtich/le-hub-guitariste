import { upcomingLessons } from '../../data/mockData'

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function PlanningPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning</h1>
        <p className="text-muted-foreground mt-1">Semaine du 2 au 8 juin 2026</p>
      </header>

      <div className="grid grid-cols-7 gap-2 mb-8">
        {days.map((day, i) => (
          <div
            key={day}
            className={`text-center py-3 rounded-xl text-sm font-medium ${
              i === 1 ? 'guitar-gradient text-white' : 'glass-panel text-muted-foreground'
            }`}
          >
            {day}
            <span className="block text-lg mt-0.5 font-semibold">{i + 2}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {upcomingLessons.map((lesson) => (
          <article
            key={lesson.id}
            className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-l-4 border-l-guitar-600"
          >
            <div className="sm:w-32 shrink-0">
              <p className="font-medium text-guitar-400">{lesson.date}</p>
              <p className="text-2xl font-semibold">{lesson.time}</p>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{lesson.student}</h3>
              <p className="text-muted-foreground mt-1">{lesson.topic}</p>
            </div>
            <span className="inline-flex self-start sm:self-center px-3 py-1 rounded-full text-xs font-medium bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
              Cours individuel · 45 min
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
