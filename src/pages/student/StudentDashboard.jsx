import { Flame, Clock, Target } from 'lucide-react'
import StatCard from '../../components/StatCard'
import {
  studentProfile,
  assignedExercises,
  studentLessons,
  studentProgress,
} from '../../data/mockData'

export default function StudentDashboard() {
  const pending = assignedExercises.filter((e) => !e.completed)

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Bonjour, {studentProfile.name.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Professeur : {studentProfile.teacher} · Niveau {studentProfile.level}
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Série d'entraînement" value={`${studentProfile.streak} jours`} change="Continuez !" icon={Flame} />
        <StatCard label="Heures de pratique" value={String(studentProfile.totalHours)} change="Depuis septembre" icon={Clock} />
        <StatCard label="Exercices à faire" value={String(pending.length)} change={`${assignedExercises.filter((e) => e.completed).length} terminés`} icon={Target} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Exercices en cours</h2>
          <ul className="space-y-3">
            {assignedExercises.map((ex) => (
              <li
                key={ex.id}
                className={`p-4 rounded-xl border ${
                  ex.completed
                    ? 'border-border-subtle bg-surface/30 opacity-60'
                    : 'border-guitar-600/20 bg-guitar-600/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-medium ${ex.completed ? 'line-through text-muted' : ''}`}>
                    {ex.title}
                  </p>
                  {ex.completed ? (
                    <span className="text-xs text-emerald-400 shrink-0">✓ Terminé</span>
                  ) : (
                    <span className="text-xs text-guitar-400 shrink-0">Échéance : {ex.due}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Mes compétences</h2>
          <ul className="space-y-4">
            {studentProgress.map((item) => (
              <li key={item.skill}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{item.skill}</span>
                  <span className="text-muted">{item.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-guitar-700 to-guitar-500"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass-panel rounded-2xl p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Derniers cours</h2>
        <ul className="space-y-4">
          {studentLessons.map((lesson) => (
            <li key={lesson.id} className="border-b border-border-subtle last:border-0 pb-4 last:pb-0">
              <p className="text-xs text-guitar-400 mb-1">{lesson.date}</p>
              <p className="font-medium">{lesson.topic}</p>
              <p className="text-sm text-muted-foreground mt-1">{lesson.notes}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
