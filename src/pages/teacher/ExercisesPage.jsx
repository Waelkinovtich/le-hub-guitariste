import { BookOpen } from 'lucide-react'
import { EmptyBlock } from '../../components/DataState'

export default function ExercisesPage() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Bibliothèque d&apos;exercices</h1>
        <p className="text-muted-foreground mt-1">Module à venir — non lié à Supabase pour l&apos;instant</p>
      </header>

      <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-4">
        <BookOpen className="w-12 h-12 text-muted" />
        <EmptyBlock message="Les exercices seront stockés dans une table dédiée lors d'une prochaine version." />
      </div>
    </div>
  )
}
