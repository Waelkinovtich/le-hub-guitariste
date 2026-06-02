import { Search, Plus } from 'lucide-react'
import { students } from '../../data/mockData'

export default function StudentsPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Élèves</h1>
          <p className="text-muted-foreground mt-1">{students.length} élèves inscrits</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium opacity-90 cursor-not-allowed"
          title="Fonctionnalité à venir"
        >
          <Plus className="w-4 h-4" />
          Ajouter un élève
        </button>
      </header>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="search"
          placeholder="Rechercher un élève…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
          disabled
        />
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-muted-foreground">
              <th className="px-6 py-4 font-medium">Élève</th>
              <th className="px-6 py-4 font-medium hidden md:table-cell">Niveau</th>
              <th className="px-6 py-4 font-medium hidden lg:table-cell">Instrument</th>
              <th className="px-6 py-4 font-medium hidden sm:table-cell">Prochain cours</th>
              <th className="px-6 py-4 font-medium">Progression</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-guitar-600/20 flex items-center justify-center text-xs font-medium text-guitar-400">
                      {student.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <span className="font-medium">{student.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-muted-foreground">{student.level}</td>
                <td className="px-6 py-4 hidden lg:table-cell text-muted-foreground">{student.instrument}</td>
                <td className="px-6 py-4 hidden sm:table-cell text-muted-foreground">{student.nextLesson}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 max-w-24 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                      <div
                        className="h-full rounded-full bg-guitar-600"
                        style={{ width: `${student.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted w-8">{student.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
