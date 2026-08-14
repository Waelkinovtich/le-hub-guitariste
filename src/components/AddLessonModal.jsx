import { useState, useEffect } from 'react'
import { X, Loader2, UserPlus, ChevronLeft } from 'lucide-react'
import { createLesson, updateLesson, createRecurringLessons } from '../services/lessons'
import { fetchTeacherStudents, createStudent, fetchStudentContexts } from '../services/students'
import { fetchTeacherSchools } from '../services/schools'

// Libellés affichés pour les contextes de cours
const CTX_LABELS = { ecole: 'École de musique', cesu: 'Cours particulier (CESU)' }

export default function AddLessonModal({ teacherId, lesson, onClose, onCreated }) {
  const isEdit = Boolean(lesson?.id)
  const [students, setStudents] = useState([])
  const [schools, setSchools] = useState([])
  const [form, setForm] = useState({
    studentId:       lesson?.studentId ?? '',
    lessonDate:      lesson?.lessonDate ?? '',
    lessonTime:      lesson?.lessonTime?.slice(0, 5) ?? '10:00',
    durationMinutes: lesson?.durationMinutes ?? 45,
    topic:           lesson?.topic ?? '',
    notes:           lesson?.notes ?? '',
    contextType:     lesson?.contextType ?? null,
  })
  // Contextes disponibles pour l'élève sélectionné (chargés à la volée)
  const [studentContexts, setStudentContexts] = useState([])
  const [recurring, setRecurring] = useState(false)
  const [untilDate, setUntilDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Création élève inline
  const [showNewStudent, setShowNewStudent] = useState(false)
  const [newStudentForm, setNewStudentForm] = useState({ firstName: '', lastName: '', lessonType: 'particulier', schoolId: null, schoolName: '' })
  const [creatingStudent, setCreatingStudent] = useState(false)
  const [newStudentError, setNewStudentError] = useState('')

  useEffect(() => {
    fetchTeacherStudents(teacherId).then(setStudents).catch(() => {})
    fetchTeacherSchools(teacherId).then(setSchools).catch(() => {})
  }, [teacherId])

  // Quand l'élève change, charger ses contextes depuis student_contexts.
  // On utilise la forme fonctionnelle de setForm pour éviter de lire form.contextType
  // depuis la closure (valeur potentiellement périmée si un autre élève avait été sélectionné avant).
  useEffect(() => {
    if (!form.studentId) {
      setStudentContexts([])
      setForm((prev) => ({ ...prev, contextType: null }))
      return
    }
    fetchStudentContexts(form.studentId).then((ctxs) => {
      setStudentContexts(ctxs)
      if (ctxs.length === 1) {
        // Contexte unique → remplissage silencieux (en édition, écrase l'existant si incohérent)
        setForm((prev) => ({ ...prev, contextType: ctxs[0].context_type }))
      } else if (ctxs.length === 0) {
        // Aucun contexte enregistré → pas de sélecteur, contexte null
        setForm((prev) => ({ ...prev, contextType: null }))
      }
      // 2 contextes ou plus → le sélecteur s'affiche, pas de pré-remplissage automatique
    }).catch(() => {
      // En cas d'erreur réseau, on repart sur un état propre
      setStudentContexts([])
    })
  }, [form.studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  const updateNew = (field) => (e) => setNewStudentForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleCreateStudent = async () => {
    setNewStudentError('')
    if (!newStudentForm.firstName.trim() || !newStudentForm.lastName.trim()) {
      setNewStudentError('Le prénom et le nom sont obligatoires.')
      return
    }
    setCreatingStudent(true)
    try {
      const result = await createStudent(teacherId, newStudentForm)
      setStudents((prev) => [...prev, result].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      setForm((prev) => ({ ...prev, studentId: result.id }))
      setShowNewStudent(false)
      setNewStudentForm({ firstName: '', lastName: '', lessonType: 'particulier', schoolId: null, schoolName: '' })
    } catch (err) {
      setNewStudentError(err.message ?? "Impossible de créer l'élève.")
    } finally {
      setCreatingStudent(false)
    }
  }

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
      setSubmitting(false)
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

        {/* ── Sous-formulaire création élève ──────────────────────────────── */}
        {showNewStudent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => setShowNewStudent(false)} className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-semibold">Nouvel élève</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Prénom</label>
                <input
                  autoFocus
                  value={newStudentForm.firstName}
                  onChange={updateNew('firstName')}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input
                  value={newStudentForm.lastName}
                  onChange={updateNew('lastName')}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Type de cours</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'particulier', label: 'Cours particulier' },
                  { value: 'ecole', label: 'École de musique' },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setNewStudentForm((p) => ({ ...p, lessonType: t.value, schoolId: null, schoolName: '' }))}
                    className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${newStudentForm.lessonType === t.value ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {newStudentForm.lessonType === 'ecole' && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">École</label>
                <select
                  value={newStudentForm.schoolId ?? ''}
                  onChange={(e) => {
                    const school = schools.find((s) => s.id === e.target.value)
                    setNewStudentForm((p) => ({ ...p, schoolId: school?.id ?? null, schoolName: school?.name ?? '' }))
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
                >
                  <option value="">-- Choisir une école --</option>
                  {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {newStudentError && (
              <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">{newStudentError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowNewStudent(false); setNewStudentError('') }}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateStudent}
                disabled={creatingStudent}
                className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {creatingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer et sélectionner'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Formulaire principal ───────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Élève</label>
              <select
                value={form.studentId}
                onChange={(e) => {
                  if (e.target.value === '__new__') { setShowNewStudent(true); return }
                  update('studentId')(e)
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              >
                <option value="">Choisir un élève</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__new__">+ Créer un nouvel élève…</option>
              </select>
            </div>

            {/* Sélecteur de contexte — affiché uniquement si l'élève a plusieurs contextes */}
            {studentContexts.length >= 2 && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Contexte de revenu</label>
                <div className="grid grid-cols-2 gap-2">
                  {studentContexts.map((ctx) => (
                    <button
                      key={ctx.id}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, contextType: ctx.context_type }))}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${form.contextType === ctx.context_type ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay'}`}
                    >
                      {CTX_LABELS[ctx.context_type] ?? ctx.context_type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">{recurring ? 'Date du 1er cours' : 'Date'}</label>
                <input type="date" value={form.lessonDate} onChange={update('lessonDate')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Heure</label>
                <input type="time" value={form.lessonTime} onChange={update('lessonTime')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Durée</label>
              <select value={form.durationMinutes} onChange={update('durationMinutes')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 h</option>
                <option value={75}>1 h 15</option>
                <option value={90}>1 h 30</option>
                <option value={105}>1 h 45</option>
                <option value={120}>2 h</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Thème du cours</label>
              <input value={form.topic} onChange={update('topic')} placeholder="Ex : Gamme pentatonique, Blues…" className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
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
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Enregistrer' : 'Ajouter')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
