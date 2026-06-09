import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createLesson, updateLesson, createRecurringLessons } from '../services/lessons'
import { fetchTeacherStudents } from '../services/students'

export default function AddLessonModal({ teacherId, lesson, onClose, onCreated }) {
  const isEdit = Boolean(lesson)
  const [students, setStudents] = useState([])
  const [form, setForm] = useState({
    studentId: lesson?.studentId ?? '',
    lessonDate: lesson?.lessonDate ?? '',
    lessonTime: lesson?.lessonTime?.slice(0,5) ?? '10:00',
    durationMinutes: lesson?.durationMinutes ?? 45,
    topic: lesson?.topic ?? '',
    notes: lesson?.notes ?? '',
  })
  const [recurring, setRecurring] = useState(false)
  const [untilDate, setUntilDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTeacherStudents(teacherId).then(setStudents).catch(() => {})
  }, [teacherId])

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.studentId) { setError('Choisissez un élève.'); return }
    if (!form.lessonDate) { setError('Choisissez une date.'); return }
    if (!form.topic.trim()) { setError('Le thème est obligatoire.'); return }
    if (recurring && !untilDate) { setError('Choisissez une date de fin pour la récurrence.'); return }
    setSubmitting(true)
    try {
      if (recurring && !isEdit) {
        const count = await createRecurringLessons(teacherId, form, untilDate)
        alert(count + ' cours créés !')
        onCreated()
      } else {
        const result = isEdit ? await updateLesson(lesson.id, form) : await createLesson(teacherId, form)
        onCreated(result)
      }
      onClose()
    } catch (err) {
      setError(err.message ?? 'Impossible de sauvegarder.')
    } finally {
      setting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{isEdit ? 'Modifier' : 'Ajouter'} un cours</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Élève</label>
            <select value={form.studentId} onChange={update('studentId')} className="w-full px-3 py-5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
              <option value="">Choisir un élève</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">{recurring ? 'Date du 1er cours' : 'Date'}</label>
              <input type="date" value={form.lessonDate} onChange={update('lessonDate')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Heure</label>
              <input type="time" value={form.lessonTime} onChange={update('lessonTime')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle textm outline-none focus:border-guitar-600" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Durée</label>
            <select value={form.durationMinutes} onChange={update('durationMinutes')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Thème du cours</label>
            <input value={form.topic} onChange={update('topic')} placeholder="Ex: Gamme pentatonique, Blues..." className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>
        <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Notes (optionnel)</label>
            <textarea value={form.notes} onChange={update('notes')} rows={2} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 resize-none" />
          </div>

          {!isEdit && (
            <div className="border-t border-border-subtle pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="w-4 h-4 accent-guitar-600" />
                <span className="text-sm font-medium">Cours hebdomadaire (toutes les semaines)</span>
              </label>
              {recurring && (
                <div className="mt-3">
                  <label className="block text-sm text-muted-foreground mb-1.5">Jusqu'au</label>
                  <input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                  <p className="text-xs text-muted-foreground mt-1">Un cours sera créé chaque semaine à la même heure jusqu'à cette date.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">Annuler</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 nimate-spin" /> : (isEdit ? 'Enregistrer' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
