import { Star } from 'lucide-react'

/**
 * Badge de score de créneau — affiché sur RattrapagePage et SchedulingAssistantPage.
 * Score >= 4 : vert (excellent), >= 2 : orange, >= 0 : gris, < 0 : ambre (pénalité).
 */
export default function ScoreBadge({ score }) {
  const color = score >= 4
    ? 'text-green-400 border-green-500/30 bg-green-500/10'
    : score >= 2
      ? 'text-guitar-400 border-guitar-600/30 bg-guitar-600/10'
      : score >= 0
        ? 'text-muted-foreground border-border-subtle bg-surface-raised'
        : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium ${color}`}>
      <Star className="w-3 h-3" fill="currentColor" />
      {score >= 0 ? '+' : ''}{score}
    </span>
  )
}
