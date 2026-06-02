import { studentLessons, upcomingLessons, studentProfile } from '../../data/mockData'

export default function StudentLessonsPage() {
  const next = upcomingLessons.find((l) => l.student === studentProfile.name) ?? upcomingLessons[0]

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mes cours</h1>
        <p className="text-muted-foreground mt-1">Historique et prochain rendez-vous</p>
      </header>

      {next && (
        <article className="glass-panel rounded-2xl p-6 mb-8 border border-guitar-600/30 bg-guitar-600/5">
          <p className="text-xs font-medium text-guitar-400 uppercase tracking-wider mb-2">Prochain cours</p>
          <h2 className="text-xl font-semibold">{next.topic}</h2>
          <p className="text-muted-foreground mt-2">
            {next.date} à {next.time} · avec {studentProfile.teacher}
          </p>
        </article>
      )}

      <h2 className="text-lg font-semibold mb-4">Historique</h2>
      <div className="space-y-4">
        {studentLessons.map((lesson) => (
          <article key={lesson.id} className="glass-panel rounded-2xl p-5">
            <p className="text-sm text-guitar-400">{lesson.date}</p>
            <h3 className="font-semibold text-lg mt-1">{lesson.topic}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{lesson.notes}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
