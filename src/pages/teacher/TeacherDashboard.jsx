import { Users, Calendar, BookOpen, TrendingUp } from 'lucide-react'
import StatCard from '../../components/StatCard'
import { teacherStats, upcomingLessons, students } from '../../data/mockData'

const statIcons = [Users, Calendar, BookOpen, TrendingUp]

export default function TeacherDashboard() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">Vue d&apos;ensemble de votre activité pédagogique</p>
      </header>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {teacherStats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} icon={statIcons[i]} />
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Prochains cours</h2>
          <ul className="space-y-3">
            {upcomingLessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl bg-surface/50 border border-border-subtle hover:border-guitar-600/20 transition-colors"
              >
                <div className="sm:w-28 shrink-0">
                  <p className="text-sm font-medium text-guitar-400">{lesson.date}</p>
                  <p className="text-xs text-muted">{lesson.time}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{lesson.student}</p>
                  <p className="text-sm text-muted-foreground truncate">{lesson.topic}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Élèves récents</h2>
          <ul className="space-y-4">
            {students.slice(0, 4).map((student) => (
              <li key={student.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-guitar-600/20 flex items-center justify-center text-sm font-medium text-guitar-400">
                  {student.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{student.name}</p>
                  <p className="text-xs text-muted">{student.level}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{student.progress}%</p>
                  <div className="w-16 h-1.5 rounded-full bg-surface-overlay mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-guitar-600"
                      style={{ width: `${student.progress}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
