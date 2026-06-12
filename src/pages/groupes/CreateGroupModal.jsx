import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
  { value: 150, label: '2h30' },
  { value: 180, label: '3h' },
]

function getRecurringDates(dayOfWeek, startDate, endDate) {
  const dates = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  const current = new Date(start)
  while (current.getDay() !== parseInt(dayOfWeek)) {
    current.setDate(current.getDate() + 1)
  }
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 7)
  }
  return dates
}

export default function CreateGroupModal({ onClose, onCreated, userId }) {
  const [form, setForm] = useState({
    name: '',
    type: 'cours_collectif',
    description: '',
    recurrence_day: '',
    recurrence_time: '',
    duration_minutes: 60,
    start_date: '',
    end_date: '',
    school_name: '',
  })
  const [saving, setSaving] = useState(false)
  const [schools, setSchools] = useState([])

  useEffect(() => { loadSchools() }, [])

  async function loadSchools() {
    const { data } = await supabase.from('students').select('school_name')
    const unique = [...new Set((data || []).map(s => s.school_name).filter(Boolean))].sort()
    setSchools(unique)
  }

  function handle(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)

    const { data: group, error } = await supabase.from('music_groups').insert({
      name: form.name,
      type: form.type,
      description: form.description,
      teacher_id: userId,
      recurrence_day: form.recurrence_day !== '' ? parseInt(form.recurrence_day) : null,
      recurrence_time: form.recurrence_time || null,
      duration_minutes: parseInt(form.duration_minutes),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      school_name: form.school_name || null,
    }).select().single()

    if (!error && group && form.recurrence_day !== '' && form.start_date && form.end_date) {
      const dates = getRecurringDates(form.recurrence_day, form.start_date, form.end_date)
      const sessions = dates.map(date => ({
        group_id: group.id,
        session_date: date,
        session_time: form.recurrence_time || null,
        duration_minutes: parseInt(form.duration_minutes),
      }))
      if (sessions.length > 0) {
        await supabase.from('group_sessions').insert(sessions)
      }
    }

    setSaving(false)
    if (!error) { onCreated(); onClose() }
  }

  const inputClass = "w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display">Nouveau groupe</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Nom du groupe *</label>
            <input name="name" value={form.name} onChange={handle} className={inputClass}
              placeholder="Ex: Ensemble jazz, Cours collectif..." />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Type</label>
            <select name="type" value={form.type} onChange={handle} className={inputClass}>
              <option value="cours_collectif">Cours collectif</option>
              <option value="repetition">Repetition</option>
              <option value="ensemble">Ensemble</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Ecole</label>
            <select name="school_name" value={form.school_name} onChange={handle} className={inputClass}>
              <option value="">Aucune</option>
              {schools.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Duree</label>
            <select name="duration_minutes" value={form.duration_minutes} onChange={handle} className={inputClass}>
              {DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Jour récurrent</label>
              <select name="recurrence_day" value={form.recurrence_day} onChange={handle} className={inputClass}>
                <option value="">Ponctuel</option>
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Heure</label>
              <input name="recurrence_time" type="time" value={form.recurrence_time} onChange={handle} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Date de debut</label>
              <input name="start_date" type="date" value={form.start_date} onChange={handle} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Fin de recurrence</label>
              <input name="end_date" type="date" value={form.end_date} onChange={handle} className={inputClass} />
            </div>
          </div>

          {form.recurrence_day !== '' && form.start_date && form.end_date && (
            <p className="text-xs text-guitar-400">
              Seances generees : {getRecurringDates(form.recurrence_day, form.start_date, form.end_date).length} seances
            </p>
          )}

          <div>
            <label className="text-xs text-muted mb-1 block">Description</label>
            <textarea name="description" value={form.description} onChange={handle} rows={2}
              className={inputClass + " resize-none"}
              placeholder="Notes sur ce groupe..." />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-border-subtle text-sm text-muted hover:text-foreground transition-all">
            Annuler
          </button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 disabled:opacity-50 transition-all">
            {saving ? 'Enregistrement...' : 'Creer le groupe'}
          </button>
        </div>
      </div>
    </div>
  )
}
