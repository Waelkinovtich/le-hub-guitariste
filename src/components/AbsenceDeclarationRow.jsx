import { useState } from 'react'
import { AlertCircle, CheckCircle2, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

function formatDatetime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Ligne de déclaration d'absence réutilisable (AbsencesPage + StudentDetailPage).
 *
 * Props :
 *   decl              — { id, lesson_date, lesson_time, lesson_school,
 *                         declared_at, excused, excused_manual, cancelled_at,
 *                         student_name? }
 *   onExcusedChange   — (id, newExcused, newExcusedManual) => void
 *                        appelé après un UPDATE réussi pour mise à jour locale
 *   showStudentName   — true (défaut) : affiche decl.student_name en 1ère colonne
 *
 * Robustesse : utilise exclusivement les champs dénormalisés (lesson_date,
 * lesson_time, lesson_school) — fonctionne même si lesson_id est NULL
 * (cours supprimé, ON DELETE SET NULL).
 *
 * Toggle : UPDATE absence_declarations.excused + excused_manual via la policy
 * RLS `absence_declarations_prof_own` (authenticated, pas besoin de RPC).
 */
export default function AbsenceDeclarationRow({ decl, onExcusedChange, showStudentName = true }) {
  const [toggling,     setToggling]     = useState(false)
  const [toggleError,  setToggleError]  = useState(null)

  const annulee   = !!decl.cancelled_at
  // excused_manual IS NOT NULL → statut modifié manuellement par le professeur
  const estManuel = decl.excused_manual !== null && decl.excused_manual !== undefined

  async function handleToggle() {
    setToggling(true)
    setToggleError(null)
    const newExcused = !decl.excused
    const { error } = await supabase
      .from('absence_declarations')
      .update({ excused: newExcused, excused_manual: newExcused })
      .eq('id', decl.id)
    setToggling(false)
    if (error) {
      setToggleError('Impossible de modifier le statut.')
    } else {
      // Mise à jour optimiste : l'appelant synchronise son state local
      onExcusedChange?.(decl.id, newExcused, newExcused)
    }
  }

  return (
    <tr className={`border-b border-border-subtle ${annulee ? 'opacity-50' : ''}`}>

      {/* Nom de l'élève (optionnel) */}
      {showStudentName && (
        <td className="py-2.5 pr-4 pl-4 text-sm font-medium">{decl.student_name ?? '—'}</td>
      )}

      {/* Cours : champs dénormalisés — robuste si lesson_id NULL */}
      <td className={`py-2.5 pr-4 text-sm ${showStudentName ? '' : 'pl-4'}`}>
        <span className="capitalize text-foreground">{formatDate(decl.lesson_date)}</span>
        {' '}
        <span className="text-muted-foreground">{formatTime(decl.lesson_time)}</span>
        {decl.lesson_school && (
          <span className="block text-[10px] text-muted-foreground mt-0.5">{decl.lesson_school}</span>
        )}
      </td>

      {/* Date/heure exacte de la déclaration par l'élève */}
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatDatetime(decl.declared_at)}
      </td>

      {/* Badge statut + indicateur auto/manuel */}
      <td className="py-2.5 pr-4">
        {annulee ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-overlay text-muted-foreground border border-border-subtle">
            <X className="w-2.5 h-2.5" /> Annulée
          </span>
        ) : decl.excused ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> Excusée
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <AlertCircle className="w-2.5 h-2.5" /> Non excusée
          </span>
        )}
        {/* Distingue statut automatique (règle 48h) vs modification manuelle */}
        {!annulee && (
          <span className="block text-[10px] text-muted-foreground mt-0.5">
            {estManuel ? '✎ Manuel' : '⏱ Auto 48h'}
          </span>
        )}
      </td>

      {/* Bouton toggle — désactivé si déclaration annulée */}
      <td className="py-2.5 pr-4">
        {!annulee && (
          <div>
            <button
              type="button"
              disabled={toggling}
              onClick={handleToggle}
              title={decl.excused ? 'Marquer comme non excusée' : 'Marquer comme excusée'}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border-subtle rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
            >
              {toggling ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : decl.excused ? (
                <><X className="w-3 h-3" /> Non excusée</>
              ) : (
                <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Excusée</>
              )}
            </button>
            {toggleError && (
              <p className="text-[10px] text-red-400 mt-0.5">{toggleError}</p>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
