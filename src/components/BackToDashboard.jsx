import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function BackToDashboard() {
  return (
    <Link
      to="/professeur"
      className="sm:hidden inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 -mt-1"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Tableau de bord
    </Link>
  )
}
