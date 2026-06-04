import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createStudent, updateStudent } from '../services/students'

const LEVELS = ['Debutant', 'Intermediaire', 'Avance']

export default function AddStudentModal({ teacherId, student, onClose, onCreated }) {
  const isEdit = Boolean(student)
  const [form, setForm] = useState({
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    email: student?.email ?? '',
    phone: student?.phone ?? '',
    level: student?.level ?? '',
    instrument: student?.instrument ?? '',
    progress: student?.progress ?? 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => {
    const value = field === 'progress' ? Number(e.target.value) : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Le prenom et le nom sont obligatoires.')
      return
    }
    setSubmitting(true)
    try {
      let result
      if (isEdit) {
        result = await updateStudent(student.id, form)
      } else {
        result = await createStudent(teacherId, form)
      }
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
      <div className="relative w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-border">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{isEdit ? 'Modifier' : 'Ajouter'} un eleve</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={update('email')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Telephone</label>
            <input type="tel" value={form.phone} onChange={update('phone')} className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
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

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Progression ({form.progress}%)</label>
            <input type="range" min={0} max={100} value={form.progress} onChange={update('progress')} className="w-full accent-guitar-600" />
          </div>

          {error && (
            <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Enregistrer' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
