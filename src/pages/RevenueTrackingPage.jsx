import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Loader2, Trash2, Pencil, Check, X, AlertCircle,
  Euro, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchTeacherSchools, currentSchoolYear } from '../services/schools'
import {
  fetchIncomeEntries, createIncomeEntry, updateIncomeEntry, deleteIncomeEntry,
} from '../services/revenue'

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fmtAmount(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtHours(v) {
  if (v == null || v === '') return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' h'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

function defaultRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startYear = month >= 8 ? year : year - 1
  return {
    from: `${startYear}-08-01`,
    to:   `${startYear + 1}-07-31`,
  }
}

// ─── Formulaire d'ajout / modification ────────────────────────────────────────

function EntryForm({ schools, teacherId, initialData, onSaved, onCancel }) {
  const curYear = currentSchoolYear()
  const [form, setForm] = useState({
    school_id:   initialData?.school_id   ?? '',
    label:       initialData?.label       ?? '',
    amount:      initialData?.amount      ?? '',
    hours:       initialData?.hours       ?? '',
    entry_date:  initialData?.entry_date  ?? new Date().toISOString().slice(0, 10),
    school_year: initialData?.school_year ?? curYear,
    notes:       initialData?.notes       ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const f = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || !form.entry_date) { setError('Le montant et la date sont obligatoires.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        school_id:   form.school_id || null,
        label:       form.label || null,
        amount:      Number(form.amount),
        hours:       form.hours !== '' ? Number(form.hours) : null,
        entry_date:  form.entry_date,
        school_year: form.school_year,
        notes:       form.notes || null,
      }
      const saved = initialData?.id
        ? await updateIncomeEntry(initialData.id, payload)
        : await createIncomeEntry(teacherId, payload)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-raised rounded-xl border border-border-subtle p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">École / Employeur</label>
          <select value={form.school_id} onChange={f('school_id')} className={inputCls}>
            <option value="">— Autre / Particulier CESU —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!form.school_id && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Libellé (si hors école)</label>
            <input type="text" value={form.label} onChange={f('label')} placeholder="Ex : cours CESU M. Dupont" className={inputCls} />
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Montant <span className="text-guitar-400">*</span></label>
          <div className="relative">
            <input type="number" min="0" step="0.01" value={form.amount} onChange={f('amount')} placeholder="0,00" className={inputCls + ' pr-6'} required />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Heures effectuées</label>
          <div className="relative">
            <input type="number" min="0" step="0.25" value={form.hours} onChange={f('hours')} placeholder="0" className={inputCls + ' pr-6'} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">h</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Date de réception <span className="text-guitar-400">*</span></label>
          <input type="date" value={form.entry_date} onChange={f('entry_date')} className={inputCls} required />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Année scolaire</label>
          <input type="text" value={form.school_year} onChange={f('school_year')} placeholder="2024-2025" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Notes</label>
          <input type="text" value={form.notes} onChange={f('notes')} placeholder="Remarques éventuelles…" className={inputCls} />
        </div>
      </div>

      {error && <p className="text-xs text-guitar-400">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initialData?.id ? 'Mettre à jour' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />Annuler
        </button>
      </div>
    </form>
  )
}

// ─── Tableau de répartition par école ─────────────────────────────────────────

function BreakdownTable({ entries }) {
  const bySchool = useMemo(() => {
    const map = {}
    entries.forEach((e) => {
      const key = e.school_id ?? '__hors_ecole__'
      const label = e.school_name ?? e.label ?? 'Hors école / Particulier'
      if (!map[key]) map[key] = { label, amount: 0, hours: 0 }
      map[key].amount += Number(e.amount) || 0
      map[key].hours  += Number(e.hours)  || 0
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  }, [entries])

  if (bySchool.length === 0) return null

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">École / Source</th>
            <th className="px-4 py-3 font-medium text-right">Montant</th>
            <th className="px-4 py-3 font-medium text-right">Heures</th>
            <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Taux moyen</th>
          </tr>
        </thead>
        <tbody>
          {bySchool.map((row, i) => {
            const avgRate = row.hours > 0 ? row.amount / row.hours : null
            return (
              <tr key={i} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right text-guitar-400 font-medium">{fmtAmount(row.amount)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{row.hours > 0 ? fmtHours(row.hours) : '—'}</td>
                <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                  {avgRate != null ? `${avgRate.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RevenueTrackingPage() {
  const [teacherId, setTeacherId]   = useState(null)
  const [schools, setSchools]       = useState([])
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [range, setRange]           = useState(defaultRange())
  const [showForm, setShowForm]     = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [sortCol, setSortCol]       = useState('entry_date')
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Non authentifié'); setLoading(false); return }
      setTeacherId(user.id)
      try {
        const [schoolList, entryList] = await Promise.all([
          fetchTeacherSchools(user.id),
          fetchIncomeEntries(user.id, { from: range.from, to: range.to }),
        ])
        setSchools(schoolList)
        setEntries(entryList)
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    init()
  }, [])

  const reload = async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const entryList = await fetchIncomeEntries(teacherId, { from: range.from, to: range.to })
      setEntries(entryList)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const applyRange = async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const entryList = await fetchIncomeEntries(teacherId, { from: range.from, to: range.to })
      setEntries(entryList)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleDelete = async (entry) => {
    if (!window.confirm(`Supprimer cette entrée (${fmtAmount(entry.amount)} du ${fmtDate(entry.entry_date)}) ?`)) return
    setDeletingId(entry.id)
    try {
      await deleteIncomeEntry(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (err) {
      alert('Erreur : ' + err.message)
    }
    setDeletingId(null)
  }

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const av = a[sortCol] ?? ''
      const bv = b[sortCol] ?? ''
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
    })
  }, [entries, sortCol, sortDir])

  const totalAmount = useMemo(() => entries.reduce((s, e) => s + (Number(e.amount) || 0), 0), [entries])
  const totalHours  = useMemo(() => entries.reduce((s, e) => s + (Number(e.hours) || 0), 0), [entries])

  const SortBtn = ({ col, label }) => (
    <button type="button" onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      {sortCol === col
        ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        : <ChevronDown className="w-3 h-3 opacity-30" />
      }
    </button>
  )

  return (
    <div className="p-6 sm:p-8 max-w-5xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Suivi des revenus</h1>
          <p className="text-muted-foreground mt-1">Revenus et heures par école ou employeur, sans facturation (CESU+)</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingEntry(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />Ajouter une entrée
          </button>
        )}
      </header>

      {/* Formulaire */}
      {showForm && (
        <EntryForm
          schools={schools}
          teacherId={teacherId}
          initialData={editingEntry}
          onSaved={(saved) => {
            setEntries((prev) => {
              const without = prev.filter((e) => e.id !== saved.id)
              return [saved, ...without].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
            })
            setShowForm(false)
            setEditingEntry(null)
          }}
          onCancel={() => { setShowForm(false); setEditingEntry(null) }}
        />
      )}

      {/* Filtre de dates */}
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Plage de dates</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Du</label>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={inputCls + ' w-auto'} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Au</label>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={inputCls + ' w-auto'} />
          </div>
          <button onClick={applyRange} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors disabled:opacity-40">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Appliquer'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </p>
      )}

      {/* Totaux */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Euro className="w-3.5 h-3.5" />Total revenus
            </div>
            <p className="text-xl font-semibold text-guitar-400">{fmtAmount(totalAmount)}</p>
            <p className="text-xs text-muted-foreground mt-1">{entries.length} entrée{entries.length > 1 ? 's' : ''}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />Total heures
            </div>
            <p className="text-xl font-semibold">{totalHours > 0 ? fmtHours(totalHours) : '—'}</p>
            {totalHours > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Soit {(totalAmount / totalHours).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h en moyenne
              </p>
            )}
          </div>
        </div>
      )}

      {/* Répartition par école */}
      {entries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Répartition par école / source</p>
          <BreakdownTable entries={entries} />
        </div>
      )}

      {/* Historique */}
      <div>
        <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Historique détaillé</p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />Chargement…
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <Euro className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Aucune entrée sur cette période.</p>
            <p className="text-xs text-muted mt-1">Cliquez sur « Ajouter une entrée » pour commencer.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border-subtle text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium"><SortBtn col="entry_date" label="Date" /></th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium text-right"><SortBtn col="amount" label="Montant" /></th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell"><SortBtn col="hours" label="Heures" /></th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Notes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr key={entry.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(entry.entry_date)}</td>
                    <td className="px-4 py-3 font-medium">
                      {entry.school_name ?? entry.label ?? <span className="text-muted-foreground">Particulier CESU</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-guitar-400">{fmtAmount(entry.amount)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{fmtHours(entry.hours)}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs max-w-[180px] truncate">{entry.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setEditingEntry(entry); setShowForm(true) }}
                          className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-overlay transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
                          disabled={deletingId === entry.id}
                          className="p-1.5 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors disabled:opacity-40"
                          title="Supprimer"
                        >
                          {deletingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
