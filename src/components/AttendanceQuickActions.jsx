// Deux zones d'émargement rapide, visibles en permanence (pas hover-only).
// variant="tile" → absolu en bas de la tuile Planning, compact pour 15 min.
// variant="row"  → inline dans EmargementPage, min 44 px conformément aux exigences tactiles.
//
// Règle UX : ✓ Présent = un seul geste, pas de fenêtre.
//            ✗ / badge = ouvre toujours LessonStatusModal (inclut « Planifié » = remettre à zéro).

import { Check, X } from 'lucide-react'

// Couleurs et labels courts des statuts émargés (hors planifie)
const BADGE_INFO = {
  present:     { color: '#22c55e', label: '✓', title: 'Présent' },
  absent:      { color: '#ef4444', label: 'A', title: 'Absent' },
  excuse:      { color: '#3b82f6', label: 'E', title: 'Excusé' },
  annule_prof: { color: '#f97316', label: '!', title: 'Annulé' },
  rattrape:    { color: '#a855f7', label: 'R', title: 'Rattrapé' },
}

export default function AttendanceQuickActions({
  effectiveStatus,     // statut courant (avec overrides optimistes)
  onPresent,           // () → écrit « present » sans modale
  onOpenModal,         // () → ouvre LessonStatusModal
  variant = 'row',     // 'tile' | 'row'
}) {
  const isPresent   = effectiveStatus === 'present'
  const isEmarged   = effectiveStatus !== 'planifie'
  const badge       = BADGE_INFO[effectiveStatus] ?? null

  // ── Variant tuile ─────────────────────────────────────────────────────────
  if (variant === 'tile') {
    // Deux icônes côte à côte, absolues en bas à gauche de la tuile.
    // p-2 → zone tactile ~26px ; acceptable sur des tuiles courtes.
    return (
      <div
        style={{ position: 'absolute', bottom: 0, left: 0, zIndex: 20, display: 'flex' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* ✓ Présent */}
        <button
          type="button"
          title={isPresent ? 'Présent — toucher pour modifier' : '✓ Présent'}
          onClick={(e) => { e.stopPropagation(); isPresent ? onOpenModal() : onPresent() }}
          style={{
            padding: '4px 5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '0 4px 0 0',
            background: isPresent ? '#22c55e33' : '#22c55e18',
            color: isPresent ? '#22c55e' : '#22c55e80',
          }}
          aria-label={isPresent ? 'Présent — modifier' : 'Marquer présent'}
        >
          <Check style={{ width: 10, height: 10 }} strokeWidth={2.5} />
        </button>

        {/* ✗ Absent / badge statut non-présent */}
        <button
          type="button"
          title={isEmarged && !isPresent ? (badge?.title ?? effectiveStatus) + ' — modifier' : '✗ Absent / Annuler'}
          onClick={(e) => { e.stopPropagation(); onOpenModal() }}
          style={{
            padding: '4px 5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isEmarged && !isPresent ? (badge?.color ?? '#ef4444') + '33' : '#ef444418',
            color: isEmarged && !isPresent ? (badge?.color ?? '#ef4444') : '#ef444480',
            fontWeight: 700,
            fontSize: 9,
          }}
          aria-label={isEmarged && !isPresent ? 'Modifier le statut' : 'Absent ou annulé'}
        >
          {isEmarged && !isPresent
            ? <span>{badge?.label ?? '?'}</span>
            : <X style={{ width: 10, height: 10 }} strokeWidth={2.5} />
          }
        </button>
      </div>
    )
  }

  // ── Variant ligne (EmargementPage) ────────────────────────────────────────
  return (
    <div className="flex items-center gap-2">
      {/* ✓ Présent — toujours visible, actif si déjà présent */}
      <button
        type="button"
        onClick={isPresent ? onOpenModal : onPresent}
        title={isPresent ? 'Présent — toucher pour modifier' : '✓ Marquer présent'}
        className={[
          'inline-flex items-center justify-center rounded-full border transition-colors',
          isPresent
            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25',
        ].join(' ')}
        style={{ minWidth: 44, minHeight: 44 }}
        aria-pressed={isPresent}
      >
        <Check className="w-5 h-5" />
      </button>

      {/* ✗ / badge : toujours visible */}
      <button
        type="button"
        onClick={onOpenModal}
        title={isEmarged && !isPresent ? (badge?.title ?? effectiveStatus) + ' — modifier' : '✗ Absent, excusé ou annulé'}
        className="inline-flex items-center justify-center rounded-full border transition-colors"
        style={{
          minWidth: 44, minHeight: 44,
          background:   isEmarged && !isPresent ? (badge?.color ?? '#ef4444') + '22' : 'rgba(239,68,68,0.07)',
          borderColor:  isEmarged && !isPresent ? (badge?.color ?? '#ef4444') + '60' : 'rgba(239,68,68,0.25)',
          color:        isEmarged && !isPresent ? (badge?.color ?? '#ef4444') : 'rgba(239,68,68,0.6)',
        }}
      >
        {isEmarged && !isPresent
          ? <span className="text-sm font-bold">{badge?.label ?? '?'}</span>
          : <X className="w-5 h-5" />
        }
      </button>
    </div>
  )
}
