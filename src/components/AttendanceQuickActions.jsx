// Deux zones d'émargement rapide, visibles en permanence (pas hover-only).
// variant="tile" → absolu en coin de la tuile Planning, icônes discrètes sans fond coloré.
// variant="row"  → inline dans EmargementPage, min 44 px conformément aux exigences tactiles.
//
// Règle UX : ✓ Présent = un seul geste, pas de fenêtre.
//            ✗ / badge = ouvre toujours LessonStatusModal (inclut « Planifié » = remettre à zéro).
//
// Style : icônes neutres sans overlay coloré, cohérent avec ClipboardCheck des tuiles groupe.

import { Check, X } from 'lucide-react'

// Labels courts et couleurs des statuts émargés (hors planifie)
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
  const isPresent = effectiveStatus === 'present'
  const isEmarged = effectiveStatus !== 'planifie'
  const badge     = BADGE_INFO[effectiveStatus] ?? null

  // ── Variant tuile ─────────────────────────────────────────────────────────
  // Deux icônes discrètes en bas à gauche, sans fond coloré — comme ClipboardCheck
  // (bg-xxx/20, texte coloré, arrondi partiel, padding minimal).
  if (variant === 'tile') {
    return (
      <div
        style={{ position: 'absolute', bottom: 0, left: 0, zIndex: 20, display: 'flex' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* ✓ Présent — fond émeraude discret si actif */}
        <button
          type="button"
          title={isPresent ? 'Présent — toucher pour modifier' : '✓ Présent'}
          onClick={(e) => { e.stopPropagation(); isPresent ? onOpenModal() : onPresent() }}
          className={`rounded-tr-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${
            isPresent
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-white/40 hover:text-emerald-400/80'
          }`}
          style={{ padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label={isPresent ? 'Présent — modifier' : 'Marquer présent'}
        >
          <Check style={{ width: 9, height: 9 }} strokeWidth={3} />
        </button>

        {/* ✗ / badge — fond coloré discret si statut non-présent */}
        <button
          type="button"
          title={isEmarged && !isPresent ? (badge?.title ?? effectiveStatus) + ' — modifier' : '✗ Absent / Annuler'}
          onClick={(e) => { e.stopPropagation(); onOpenModal() }}
          className="rounded-tr-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
          style={{
            padding: '3px 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Fond discret uniquement si statut émargé non-présent (cohérent avec ClipboardCheck)
            background:  isEmarged && !isPresent ? (badge?.color ?? '#ef4444') + '25' : 'transparent',
            color:       isEmarged && !isPresent ? (badge?.color ?? '#ef4444') : 'rgba(255,255,255,0.35)',
            fontWeight:  700,
            fontSize:    9,
          }}
          aria-label={isEmarged && !isPresent ? 'Modifier le statut' : 'Absent ou annulé'}
        >
          {isEmarged && !isPresent
            ? <span style={{ lineHeight: 1 }}>{badge?.label ?? '?'}</span>
            : <X style={{ width: 9, height: 9 }} strokeWidth={3} />
          }
        </button>
      </div>
    )
  }

  // ── Variant ligne (EmargementPage) ────────────────────────────────────────
  // Zone tactile ≥ 44 px maintenue. Pas de fond coloré plein — juste une bordure discrète.
  return (
    <div className="flex items-center gap-2">
      {/* ✓ Présent */}
      <button
        type="button"
        onClick={isPresent ? onOpenModal : onPresent}
        title={isPresent ? 'Présent — toucher pour modifier' : '✓ Marquer présent'}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${
          isPresent
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'text-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10'
        }`}
        style={{ minWidth: 44, minHeight: 44 }}
        aria-pressed={isPresent}
      >
        <Check className="w-5 h-5" />
      </button>

      {/* ✗ / badge */}
      <button
        type="button"
        onClick={onOpenModal}
        title={isEmarged && !isPresent ? (badge?.title ?? effectiveStatus) + ' — modifier' : '✗ Absent, excusé ou annulé'}
        className="inline-flex items-center justify-center rounded-full transition-colors"
        style={{
          minWidth: 44, minHeight: 44,
          background: isEmarged && !isPresent ? (badge?.color ?? '#ef4444') + '18' : 'transparent',
          color:      isEmarged && !isPresent ? (badge?.color ?? '#ef4444') : 'rgba(239,68,68,0.4)',
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
