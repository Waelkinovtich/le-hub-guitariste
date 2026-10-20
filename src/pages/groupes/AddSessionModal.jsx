import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { X, Repeat2 } from 'lucide-react'
import { createRecurringGroupSessions } from '../../services/lessons'
import { isVacances } from '../../utils/vacances'

const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
  { value: 150, label: '2h30' },
  { value: 180, label: '3h' },
]

const INTERVALS = [
  { value: 1, label: 'Toutes les semaines' },
  { value: 2, label: 'Une semaine sur deux' },
  { value: 3, label: 'Toutes les 3 semaines' },
  { value: 4, label: 'Toutes les 4 semaines' },
]

function defaultEndDate() {
  const now = new Date()
  const y = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `${y}-06-29`
}

function countOccurrences(first, last, interval, suspendHolidays, zone) {
  if (!first || !last || first > last) return 0
  const safe = Math.max(1, Math.round(interval))
  const pad = (n) => String(n).padStart(2, '0')
  let count = 0
  let cur = new Date(first + 'T00:00:00')
  const end = new Date(last + 'T00:00:00')
  while (cur <= end) {
    const iso = cur.getFullYear() + '-' + pad(cur.getMonth() + 1) + '-' + pad(cur.getDate())
    if (!(suspendHolidays && zone && isVacances(iso, zone) != null)) count++
    cur.setDate(cur.getDate() + 7 * safe)
  }
  return count
}

export default function AddSessionModal({ groupId, defaultDuration, schoolName, schoolZone, onClose, onAdded }) {
  const [form, setForm] = useState({
    session_date: new Date().toISOString().split('T')[0],
    session_time: '',
    duration_minutes: defaultDuration || 60,
    notes: '',
  })
  const [recurring, setRecurring] = useState(false)
  const [untilDate, setUntilDate] = useState(defaultEndDate())
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [suspendHolidays, setSuspendHolidays] = useState(Boolean(schoolName && schoolZone))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handle(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  const previewCount = useMemo(
    () => recurring ? countOccurrences(form.session_date, untilDate, intervalWeeks, suspendHolidays, schoolZone) : 1,
    [recurring, form.session_date, untilDate, intervalWeeks, suspendHolidays, schoolZone]
  )

  async function save() {
    if (!form.session_date) { setError('Date obligatoire.'); return }
    setSaving(true)
    setError('')
    try {
      if (recurring) {
        if (!untilDate) { setError('Date de fin obligatoire.'); setSaving(false); return }
        await createRecurringGroupSessions({
          groupId,
          firstDate: form.session_date,
          sessionTime: form.session_time || null,
          durationMinutes: parseInt(form.duration_minutes),
          endDate: untilDate,
          intervalWeeks,
          suspendDuringHolidays: suspendHolidays,
          zone: schoolZone ?? null,
        })
      } else {
        const { error: insErr } = await supabase.from('group_sessions').insert({
          group_id: groupId,
          session_date: form.session_date,
          session_time: form.session_time || null,
          duration_minutes: parseInt(form.duration_minutes),
          notes: form.notes || null,
        })
        if (insErr) throw new Error(insErr.message)
      }
      onAdded()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display">Nouvelle séance</h2>
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
            <label className="text-xs text-muted mb-1 block">Durée</label>
            <select name="duration_minutes" value={form.duration_minutes} onChange={handle} className={inputClass}>
              {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {!recurring && (
            <div>
              <label className="text-xs text-muted mb-1 block">Notes</label>
              <textarea name="notes" value={form.notes} onChange={handle} rows={2}
                className={inputClass + " resize-none"} placeholder="Notes sur cette séance..." />
            </div>
          )}

          {/* Récurrence */}
          <div className="border-t border-border-subtle pt-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)}
                className="w-4 h-4 accent-guitar-600" />
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Repeat2 className="w-3.5 h-3.5" />
                Répéter
              </span>
            </label>

            {recurring && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Répétition</label>
                  <div className="grid grid-cols-2 gap-2">
                    {INTERVALS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setIntervalWeeks(opt.value)}
                        className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${intervalWeeks === opt.value ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted mb-1 block">Jusqu'au</label>
                  <input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} className={inputClass} />
                </div>

                {schoolZone && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={suspendHolidays} onChange={(e) => setSuspendHolidays(e.target.checked)}
                      className="w-4 h-4 accent-guitar-600" />
                    <span className="text-sm">Pas de séance pendant les vacances scolaires (zone {schoolZone})</span>
                  </label>
                )}

                {form.session_date && untilDate && form.session_date <= untilDate && (
                  <p className="text-xs text-muted-foreground">
                    → <strong>{previewCount}</strong> séance{previewCount > 1 ? 's' : ''} seront créées.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-border-subtle text-sm text-muted hover:text-foreground transition-all">
            Annuler
          </button>
          <button onClick={save} disabled={saving || !form.session_date}
            className="flex-1 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 disabled:opacity-50 transition-all">
            {saving ? 'Enregistrement...' : recurring ? `Créer ${previewCount} séance${previewCount > 1 ? 's' : ''}` : 'Créer la séance'}
          </button>
        </div>
      </div>
    </div>
  )
}
