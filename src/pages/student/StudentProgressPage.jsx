import { studentProgress, studentProfile } from '../../data/mockData'

export default function StudentProgressPage() {
  const average = Math.round(
    studentProgress.reduce((sum, s) => sum + s.percent, 0) / studentProgress.length,
  )

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ma progression</h1>
        <p className="text-muted-foreground mt-1">Membre depuis {studentProfile.memberSince}</p>
      </header>

      <div className="glass-panel rounded-2xl p-8 mb-8 text-center">
        <p className="text-sm text-muted-foreground mb-2">Progression globale</p>
        <p className="text-6xl font-semibold text-gradient-guitar">{average}%</p>
        <p className="text-muted-foreground mt-2">Niveau {studentProfile.level}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {studentProgress.map((item) => (
          <div key={item.skill} className="glass-panel rounded-2xl p-6">
            <h3 className="font-semibold mb-4">{item.skill}</h3>
            <div className="relative w-32 h-32 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-surface-overlay" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  className="text-guitar-600"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${item.percent * 2.64} 264`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold">
                {item.percent}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
