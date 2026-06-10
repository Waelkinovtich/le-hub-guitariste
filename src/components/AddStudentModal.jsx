import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createStudent, updateStudent, fetchSchoolNames } from '../services/students'
import { getSchoolColor } from '../utils/schoolColors'

const LEVELS = ['Debutant', 'Intermediaire', 'Avance']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - i)

export default function AddStudentModal({ teacherId, student, onClose, onCreated }) {
  const isEdit = Boolean(student)
  const [form, setForm] = useState({ firstName: student?.firstName ?? '', lastName: student?.lastName ?? '', email: student?.email ?? '', phone: student?.phone ?? '', studentPhone: student?.studentPhone ?? '', level: student?.level ?? '', instrument: student?.instrument ?? '', progress: student?.progress ?? 0, lessonType: student?.lessonType ?? 'particulier', schoolName: student?.schoolName ?? '', birthYear: student?.birthYear ?? '', notes: student?.notes ?? '', parent1Name: student?.parent1Name ?? '', parent1Phone: student?.parent1Phone ?? '', parent1Email: student?.parent1Email ?? '', parent2Name: student?.parent2Name ?? '', parent2Phone: student?.parent2Phone ?? '', parent2Email: student?.parent2Email ?? '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [knownSchools, setKnownSchools] = useState([])

  useEffect(() => {
    fetchSchoolNames(teacherId).then(setKnownSchools).catch(() => {})
  }, [teacherId])

  const update = (field) => (e) => {
    const value = field === 'progress' ? Number(e.target.value) : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('Le prenom et le nom sont obligatoires.'); return }
    if (form.lessonType === 'ecole' && !form.schoolName.trim()) { setError('Precisez le nom de l école.'); return }
    setSubmitting(true)
    try {
      const result = isEdit ? await updateStudent(student.id, form) : await createStudent(teacherId, form)
      onCreated(result)
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
          <h2 className="text-xl font-semibold">{isEdit ? 'Modifier' : 'Ajouter'} un élève</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Identite</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Prenom</label>
                <input value={form.firstName} onChange={update('firstName')} required className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.lastName} onChange={update('lastName')} required className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1.5">Année de naissance</label>
              <select value={form.birthYear} onChange={update('birthYear')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
                <option value="">--</option>
                {YEARS.map((y) => <option key={y} value={y}>{y} ({currentYear - y} ans)</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Contact élève</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Tel personnel</label>
                <input type="tel" value={form.studentPhone} onChange={update('studentPhone')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={update('email')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Parent / Tuteur 1</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.parent1Name} onChange={update('parent1Name')} placeholder="Ex: Mme Dupont (mere)" className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Telephone</label>
                  <input type="tel" value={form.parent1Phone} onChange={update('parent1Phone')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                  <input type="email" value={form.parent1Email} onChange={update('parent1Email')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Parent / Tuteur 2</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.parent2Name} onChange={update('parent2Name')} placeholder="Ex: M. Dupont (pere)" className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Telephone</label>
                  <input type="tel" value={form.parent2Phone} onChange={update('parent2Phone')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                  <input type="email" value={form.parent2Email} onChange={update('parent2Email')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Cours</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={() => setForm((p) => ({ ...p, lessonType: 'particulier' }))} className={'px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ' + (form.lessonType === 'particulier' ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay')}>
                Cours particulier (CESU)
              </button>
              <button type="button" onClick={() => setForm((p) => ({ ...p, lessonType: 'ecole' }))} className={'px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ' + (form.lessonType === 'ecole' ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay')}>
                École de musique
              </button>
            </div>
            {form.lessonType === 'ecole' && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom de l école</label>
                <input value={form.schoolName} onChange={update('schoolName')} placeholder="Ex: École de musique de Lyon..." list="schools-list" className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
                <datalist id="schools-list">{knownSchools.map((s) => <option key={s} value={s} />)}</datalist>
                {knownSchools.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {knownSchools.map((s) => (
                      <button key={s} type="button" onClick={() => setForm((p) => ({ ...p, schoolName: s }))}
                        style={{ backgroundColor: getSchoolColor(s, knownSchools) + '25', borderColor: getSchoolColor(s, knownSchools) + '60', color: getSchoolColor(s, knownSchools) }}
                        className="px-2 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80">{s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Niveau</label>
                <select value={form.level} onChange={update('level')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
                  <option value="">--</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Instrument</label>
                <input value={form.instrument} onChange={update('instrument')} placeholder="Guitare folk, electrique..." className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1.5">Progression ({form.progress}%)</label>
              <input type="range" min={0} max={100} value={form.progress} onChange={update('progress')} className="w-full accent-guitar-600" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Remarques</p>
            <textarea value={form.notes} onChange={update('notes')} rows={3} placeholder="Notes privees sur l élève..." className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 resize-none" />
          </div>

          {error && <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">Annulér</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Enregistrer' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
