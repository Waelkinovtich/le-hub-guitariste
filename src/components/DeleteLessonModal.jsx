import { useState, useEffect } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { deleteLesson, deleteRecurrenceGroup, countRecurrenceGroup } from '../services/lessons'

export default function DeleteLessonModal({ lesson, onClose, onDeleted }) {
  const [futureCount, setFutureCount] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const isRecurring = Boolean(lesson.recurrenceGroup)

  useEffect(() => {
    if (isRecurring) {
      countRecurrenceGroup(lesson.recurrenceGroup, lesson.lessonDate).then(setFutureCount).catch(() => {})
    }
  }, [lesson, isRecurring])

  const doDelete = async (mode) => {
    setSubmitting(true)
    try {
      if (mode === 'single') {
        await deleteLesson(lesson.id)
      } else if (mode === 'future') {
        await deleteRecurrenceGroup(lesson.recurrenceGroup, lesson.lessonDate)
      } else if (mode === 'all') {
        await deleteRecurrenceGroup(lesson.recurrenceGroup, null)
      }
      onDeleted()
      onClose()
    } catch (err) {
      alert('Erreur : ' + err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Supprimer le cours</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{lesson.studentName} — {lesson.dateLabel} {lesson.timeLabel}</p>

        {submitting ? (
          <div className="flex items-center jtify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-guitar-400" /></div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => doDelete('single')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border-subtle hover:bg-surface-overlay transition-colors text-left">
              <Trash2 className="w-4 h-4 text-guitar-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Supprimer uniquement ce cours</p>
                <p className="text-xs text-muted-foreground">Les autres cours de la série sont conservés</p>
              </div>
            </button>

            {isRecurring && (
              <>
                <button onClick={() => doDelete('future')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border-subtle hover:bg-surface-overlay transition-colors text-left">
                  <Trash2 className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                  <p className="text-sm font-medium">Supprimer celui-ci et les suivants</p>
                    <p className="text-xs text-muted-foreground">{futureCount !== null ? futureCount + ' cours à partir de cette date' : '...'}</p>
                  </div>
                </button>
                <button onClick={() => doDelete('all')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-guitar-600/40 hover:bg-guitar-600/10 transition-colors text-left">
                  <Trash2 className="w-4 h-4 text-guitar-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-guitar-400">Supprimer toute la série</p>
                    <p className="text-xs text-muted-foreground">Tous les cours récurrents, passés et futurs</p>
                  </div>
                </button>
              </>
            )}

            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surfoverlay transition-colors mt-2">
              Annulér
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
