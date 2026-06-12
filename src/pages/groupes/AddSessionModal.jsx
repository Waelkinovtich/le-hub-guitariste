import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
  { value: 150, label: '2h30' },
  { value: 180, label: '3h' },
]

export default function AddSessionModal({ groupId, defaultDuration, onClose, onAdded }) {
  const [form, setForm] = useState({
    session_date: new Date().toISOString().split('T')[0],
    session_time: '',
    duration_minutes: defaultDuration || 60,
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  function handle(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function save() {
    if (!form.session_date) return
    setSaving(true)
    const { error } = await supabase.from('group_sessions').insert({
      group_id: groupId,
      session_date: form.session_date,
      session_time: form.session_time || null,
      duration_minutes: parseInt(form.duration_minutes),
      notes: form.notes || null,
    })
    setSaving(false)
    if (!error) { onAdded(); onClose() }
  }

  const inputClass = "w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display">Nouvelle seance</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Date *</label>
              <input name="session_date" type="date" value={form.session_date} onChange={handle} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Heure</label>
              <input name="session_time" type="time" value={form.session_time} onChange={handle} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Duree</label>
            <select name="duration_minutes" value={form.duration_minutes} onChange={handle} className={inputClass}>
              {DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handle} rows={2}
              className={inputClass + " resize-none"}
              placeholder="Notes sur cette seance..." />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-border-subtle text-sm text-muted hover:text-foreground transition-all">
            Annuler
          </button>
          <button onClick={save} disabled={saving || !form.session_date}
            className="flex-1 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 disabled:opacity-50 transition-all">
            {saving ? 'Enregistrement...' : 'Creer la seance'}
          </button>
        </div>
      </div>
    </div>
  )
}
