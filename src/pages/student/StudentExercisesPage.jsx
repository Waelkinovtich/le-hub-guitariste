import { ClipboardList } from 'lucide-react'
import { EmptyBlock } from '../../components/DataState'

export default function StudentExercisesPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mes exercices</h1>
        <p className="text-muted-foreground mt-1">Module à venir</p>
      </header>

      <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-4">
        <ClipboardList className="w-12 h-12 text-muted" />
        <EmptyBlock message="Les exercices assignés seront disponibles dans une prochaine version." />
      </div>
    </div>
  )
}
