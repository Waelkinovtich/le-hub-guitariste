import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createStudent } from '../services/students'

const LEVELS = ['Débutant', 'Intermédiaire', 'Avancé']

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  level: '',
  instrument: '',
  progress: 0,
}

export default function AddStudentModal({ teacherId, onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm)
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
      setError('Le prénom et le nom sont obligatoires.')
      return
    }

    setSubmitting(true)
    try {
      const student = await createStudent(teacherId, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        level: form.level,
        instrument: form.instrument,
        progress: Math.min(100, Math.max(0, form.progress || 0)),
      })
      onCreated(student)
      onClose()
    } catch (err) {
      setError(err.message ?? 'Impossible d’enregistrer l’élève.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="add-student-title"
        className="relative w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-border"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="add-student-title" className="text-xl font-semibold">
            Ajouter un élève
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm text-muted-foreground mb-1.5">
                Prénom *
              </label>
              <input
                id="firstName"
                value={form.firstName}
                onChange={update('firstName')}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm text-muted-foreground mb-1.5">
                Nom *
              </label>
              <input
                id="lastName"
                value={form.lastName}
                onChange={update('lastName')}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-muted-foreground mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={update('email')}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm text-muted-foreground mb-1.5">
              Téléphone
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={update('phone')}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="level" className="block text-sm text-muted-foreground mb-1.5">
                Niveau
              </label>
              <select
                id="level"
                value={form.level}
                onChange={update('level')}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              >
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="instrument" className="block text-sm text-muted-foreground mb-1.5">
                Instrument
              </label>
              <input
                id="instrument"
                value={form.instrument}
                onChange={update('instrument')}
                placeholder="Guitare folk, électrique…"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="progress" className="block text-sm text-muted-foreground mb-1.5">
              Progression ({form.progress}%)
            </label>
            <input
              id="progress"
              type="range"
              min={0}
              max={100}
              value={form.progress}
              onChange={update('progress')}
              className="w-full accent-guitar-600"
            />
          </div>

          {error && (
            <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
