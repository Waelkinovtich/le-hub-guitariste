import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { updateLessonStatus } from '../services/lessons'
import { LESSON_STATUSES, RAISONS_ANNULATION_PROF } from '../utils/lessonStatus'

export default function LessonStatusModal({ lesson, onClose, onUpdated }) {
  const [status, setStatus] = useState(lesson.status ?? 'planifié')
  const [absenceReason, setAbsenceReason] = useState(lesson.absenceReason ?? '')
  const [cancelReason, setCancelReason] = useState(lesson.cancelReason ?? '')
  const [submitting, setSubmitting] = useState(false)

  const needsAbsenceReason = ['absent', 'excuse'].includes(status)
  const needsCancelReason = status === 'annulé_prof'

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await updateLessonStatus(
        lesson.id,
        status,
        needsAbsenceReason ? absenceReason : null,
        needsCancelReason ? cancelReason : null
      )
      onUpdated()
      onClose()
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Émargement</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{lesson.studentName} — {lesson.dateLabel} {lesson.timeLabel}</p>

        <div className="space-y-2 mb-4">
          {LESSON_STATUSES.map((s) => (
            <button key={s.value} type="button" onClick={() => setStatus(s.value)}
              className={'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ' + (status === s.value ? 'border-transparent text-white' : 'border-border-subtle hover:bg-surface-overlay')}
              style={status === s.value ? { backgroundColor: s.color } : {}}>
              <span>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {needsAbsenceReason && (
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-1.5">Motif (optionnel)</label>
            <input value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)}
              placeholder="Ex : Maladie, voyage..."
              className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>
        )}

        {needsCancelReason && (
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">Raison de l annulation</label>
            <div className="space-y-2">
              {RAISONS_ANNULATION_PROF.map((r) => (
                <button key={r.value} type="button" onClick={() => setCancelReason(r.value)}
                  className={'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-colors text-left ' + (cancelReason === r.value ? 'border-guitar-600/60 bg-guitar-600/15 text-foreground font-medium' : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}>
                  <span>{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">Annulér</button>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
