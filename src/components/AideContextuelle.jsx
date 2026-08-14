import { HelpCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * Affiche un encadré d'aide contextuelle uniquement quand le Mode Assistance
 * est actif dans Réglages. Sans impact DOM ni visuel quand désactivé.
 */
export default function AideContextuelle({ texte }) {
  const { user } = useAuth()
  if (!user?.assistanceMode) return null
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-xl bg-guitar-600/5 border border-guitar-600/20 text-xs text-muted-foreground italic">
      <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-guitar-400/70" />
      <span>{texte}</span>
    </div>
  )
}
