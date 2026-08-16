import { useState, useEffect, useMemo } from 'react'
import { Car, Plus, Trash2, Loader2, AlertCircle, Check, Pencil, ChevronDown, Info, X, FileDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fetchMileageRates } from '../services/mileageRates'
import { fetchTeacherSchools } from '../services/schools'
import { usePeriod, filterLessonsByPeriod } from '../context/PeriodContext'
import { exportTravelPDF } from '../utils/exportPDF'
import HelpTooltip from '../components/HelpTooltip'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'trajet_recurrent',  label: 'Trajet récurrent (école)',           icon: '🏫' },
  { value: 'reunion_direction', label: 'Réunion / rendez-vous direction',    icon: '🤝' },
  { value: 'autre',             label: 'Autre déplacement professionnel',    icon: '📍' },
]

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'

// Encode les lignes en CSV RFC 4180 (séparateur ';', BOM UTF-8 pour Excel FR)
function téléchargerCSV(lignes, nomFichier) {
  const csv = lignes
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

function fmt(v, suffix = '') {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (suffix ? ' ' + suffix : '')
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

function EntryForm({ schools, rates, teacherId, initial, onSaved, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date:       initial?.date       ?? today,
    motif:      initial?.motif      ?? '',
    kilometres: initial?.kilometres ?? '',
    school_id:  initial?.school_id  ?? '',
    category:   initial?.category   ?? 'trajet_recurrent',
    rate_id:    initial?.rate_id    ?? (rates[0]?.id ?? ''),
    notes:      initial?.notes      ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const selectedRate = rates.find(r => r.id === form.rate_id) ?? null
  const coutCalc = selectedRate && form.kilometres
    ? Math.round(parseFloat(form.kilometres) * selectedRate.rate_per_km * 100) / 100
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.motif.trim() || !form.kilometres || !form.date) { setError('Date, motif et kilomètres sont obligatoires.'); return }
    setSaving(true)
    setError('')
    const payload = {
      teacher_id:  teacherId,
      date:        form.date,
      motif:       form.motif.trim(),
      kilometres:  parseFloat(form.kilometres),
      school_id:   form.school_id || null,
      category:    form.category,
      rate_id:     form.rate_id || null,
      rate_per_km: selectedRate?.rate_per_km ?? null,
      cout_calcule: coutCalc,
      notes:       form.notes.trim() || null,
    }
    let res
    if (initial?.id) {
      res = await supabase.from('travel_entries').update(payload).eq('id', initial.id).select('*').single()
    } else {
      res = await supabase.from('travel_entries').insert(payload).select('*').single()
    }
    if (res.error) { setError(res.error.message); setSaving(false); return }
    onSaved(res.data)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
          <input type="date" value={form.date} onChange={f('date')} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Kilomètres</label>
          <input type="number" min="0.1" step="0.1" value={form.kilometres} onChange={f('kilometres')}
            placeholder="ex : 24.5" required className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Motif du déplacement</label>
        <input type="text" value={form.motif} onChange={f('motif')}
          placeholder="ex : Cours mardi soir — École Saint-Martin" required className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Catégorie</label>
          <div className="relative">
            <select value={form.category} onChange={f('category')} className={inputCls + ' appearance-none pr-8 cursor-pointer'}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">École liée <span className="text-muted/60">(optionnel)</span></label>
          <div className="relative">
            <select value={form.school_id} onChange={f('school_id')} className={inputCls + ' appearance-none pr-8 cursor-pointer'}>
              <option value="">— Aucune —</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Barème kilométrique</label>
        {rates.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Aucun barème enregistré.
            <a href="/professeur/reglages" className="text-guitar-400 underline">Configurer →</a>
          </p>
        ) : (
          <div className="relative">
            <select value={form.rate_id} onChange={f('rate_id')} className={inputCls + ' appearance-none pr-8 cursor-pointer'}>
              <option value="">— Sans barème —</option>
              {rates.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label} — {r.rate_per_km} €/km
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        )}
        {coutCalc != null && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Coût estimé : <span className="font-medium text-foreground">{fmt(coutCalc, '€')}</span>
            <span className="ml-1 text-muted/60">({form.kilometres} km × {selectedRate.rate_per_km} €)</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes <span className="text-muted/60">(facultatif)</span></label>
        <textarea rows={2} value={form.notes} onChange={f('notes')}
          placeholder="Détails supplémentaires, trajet aller-retour, etc."
          className={inputCls + ' resize-none'} />
      </div>

      {error && (
        <p className="text-xs text-guitar-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement…</> : <><Check className="w-4 h-4" />{initial ? 'Modifier' : 'Ajouter le déplacement'}</>}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors">
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function TravelPage() {
  const { user } = useAuth()
  const { period } = usePeriod()

  const [entries,  setEntries]  = useState([])
  const [rates,    setRates]    = useState([])
  const [schools,  setSchools]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm,       setShowForm]       = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [deleting,       setDeleting]       = useState(null)
  // null = toutes catégories, sinon valeur de CATEGORIES.value
  const [activeCategory, setActiveCategory] = useState(null)

  const schoolMap = useMemo(() => Object.fromEntries(schools.map(s => [s.id, s.name])), [schools])

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    Promise.all([
      supabase.from('travel_entries').select('*').eq('teacher_id', user.id).order('date', { ascending: false }),
      fetchMileageRates(user.id),
      fetchTeacherSchools(user.id),
    ]).then(([{ data, error: err }, ratesData, schoolsData]) => {
      if (err) setError(err.message)
      else setEntries(data ?? [])
      setRates(ratesData)
      setSchools(schoolsData)
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [user?.id])

  // Filtre par période (réutilise filterLessonsByPeriod sur lesson_date → date)
  const filteredEntries = useMemo(() => {
    if (period.mode === 'toutes' || !period.mode) return entries
    return entries.filter(e => {
      const pseudo = { lesson_date: e.date }
      return filterLessonsByPeriod([pseudo], period).length > 0
    })
  }, [entries, period])

  // Deuxième passe de filtrage : par catégorie (pour l'affichage et l'export fiscal)
  const displayedEntries = useMemo(() => {
    if (!activeCategory) return filteredEntries
    return filteredEntries.filter(e => e.category === activeCategory)
  }, [filteredEntries, activeCategory])

  const totaux = useMemo(() => ({
    km:   displayedEntries.reduce((acc, e) => acc + parseFloat(e.kilometres ?? 0), 0),
    cout: displayedEntries.filter(e => e.cout_calcule).reduce((acc, e) => acc + parseFloat(e.cout_calcule ?? 0), 0),
  }), [displayedEntries])

  const handleSaved = (entry) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next }
      return [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    })
    setShowForm(false)
    setEditing(null)
  }

  const handleDelete = async (entry) => {
    if (!window.confirm(`Supprimer ce déplacement du ${fmtDate(entry.date)} (${entry.kilometres} km) ?`)) return
    setDeleting(entry.id)
    const { error: err } = await supabase.from('travel_entries').delete().eq('id', entry.id)
    if (err) alert('Erreur : ' + err.message)
    else setEntries(prev => prev.filter(e => e.id !== entry.id))
    setDeleting(null)
  }

  const catLabel = (cat) => CATEGORIES.find(c => c.value === cat)?.label ?? cat
  const catIcon  = (cat) => CATEGORIES.find(c => c.value === cat)?.icon ?? '📍'

  const handleExportPDF = () => {
    // Libellé humain de la période à partir de mode + value (period.label n'existe pas)
    let periodLabel = 'Toutes périodes'
    if (period.mode === 'annee_scolaire' && period.value) periodLabel = `Année scolaire ${period.value}`
    else if (period.mode === 'annee_civile' && period.value) periodLabel = `Année ${period.value}`
    else if (period.mode === 'plage_personnalisee' && period.value?.from) {
      periodLabel = `Du ${period.value.from} au ${period.value.to ?? '…'}`
    }
    exportTravelPDF({
      entries:         displayedEntries,
      category:        activeCategory,
      periodLabel,
      teacherName:     user?.name    ?? user?.email ?? '',
      teacherAddress:  user?.address ?? null,
      teacherPhone:    user?.phone   ?? null,
      teacherEmail:    user?.email   ?? null,
    })
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-display text-3xl text-foreground">Déplacements professionnels</h1>
          <HelpTooltip texte="Consignez chaque trajet professionnel — école, réunion, déplacement exceptionnel. En fin d'année, exportez en PDF pour votre déclaration de frais réels." />
        </div>
        <p className="text-sm text-muted-foreground">
          Traçabilité fiscale de vos déplacements. Coût calculé selon le barème kilométrique URSSAF sélectionné.
        </p>
      </div>

      {/* ── Filtres catégorie ── */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
            !activeCategory
              ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
              : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
          }`}
        >
          Tous
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            type="button"
            onClick={() => setActiveCategory(prev => prev === c.value ? null : c.value)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              activeCategory === c.value
                ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* ── Bandeau totaux + export ── */}
      <div className="glass-panel rounded-2xl p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">Kilométrage</p>
          <p className="text-xl font-semibold">
            {totaux.km.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km
          </p>
        </div>
        <div className="w-px h-10 bg-border-subtle hidden sm:block" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">Coût estimé</p>
          <p className="text-xl font-semibold">
            {totaux.cout > 0 ? fmt(totaux.cout, '€') : '—'}
          </p>
        </div>
        <div className="w-px h-10 bg-border-subtle hidden sm:block" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">Entrées</p>
          <p className="text-xl font-semibold">{displayedEntries.length}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const entête = ['Date', 'Motif', 'Catégorie', 'École', 'Kilomètres', 'Coût (€)', 'Notes']
              const lignes = displayedEntries.map(e => [
                e.date,
                e.motif,
                catLabel(e.category),
                e.school_id && schoolMap[e.school_id] ? schoolMap[e.school_id] : '',
                e.kilometres != null ? Number(e.kilometres).toFixed(1) : '',
                e.cout_calcule != null ? Number(e.cout_calcule).toFixed(2) : '',
                e.notes ?? '',
              ])
              téléchargerCSV([entête, ...lignes], `déplacements-${new Date().toISOString().slice(0, 10)}.csv`)
            }}
            disabled={displayedEntries.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-all disabled:opacity-40"
            title="Exporter en CSV (compatible Excel)"
          >
            <FileDown className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={displayedEntries.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-all disabled:opacity-40"
            title="Exporter en PDF (usage fiscal)"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* ── Formulaire d'ajout ── */}
      {showForm && !editing && (
        <div className="glass-panel rounded-2xl p-5 mb-6">
          <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            Nouveau déplacement
            <HelpTooltip texte="Le coût est calculé automatiquement depuis le barème kilométrique configuré dans Réglages → Taux kilométriques." position="right" />
          </p>
          <EntryForm
            schools={schools} rates={rates} teacherId={user.id}
            onSaved={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {!showForm && !editing && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 mb-6"
        >
          <Plus className="w-4 h-4" />
          Ajouter un déplacement
        </button>
      )}

      {/* ── Liste ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      ) : error ? (
        <div className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      ) : displayedEntries.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <Car className="w-10 h-10 text-muted mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">
            {activeCategory ? 'Aucun déplacement dans cette catégorie sur cette période.' : 'Aucun déplacement enregistré sur cette période.'}
          </p>
          <p className="text-xs text-muted mt-1">Utilisez le bouton ci-dessus pour saisir votre premier trajet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedEntries.map(entry => (
            editing?.id === entry.id ? (
              <div key={entry.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider">Modifier le déplacement</p>
                  <button onClick={() => setEditing(null)} className="p-1 rounded text-muted hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <EntryForm
                  schools={schools} rates={rates} teacherId={user.id}
                  initial={editing}
                  onSaved={handleSaved}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <div key={entry.id} className="glass-panel rounded-2xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base" role="img" aria-label={entry.category}>{catIcon(entry.category)}</span>
                    <p className="text-sm font-medium text-foreground truncate">{entry.motif}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{fmtDate(entry.date)}</span>
                    <span className="text-border">·</span>
                    <span className="font-medium text-foreground">
                      {parseFloat(entry.kilometres).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km
                    </span>
                    {entry.cout_calcule && (
                      <>
                        <span className="text-border">·</span>
                        <span className="font-medium text-guitar-400">{fmt(entry.cout_calcule, '€')}</span>
                      </>
                    )}
                    {entry.school_id && schoolMap[entry.school_id] && (
                      <>
                        <span className="text-border">·</span>
                        <span>{schoolMap[entry.school_id]}</span>
                      </>
                    )}
                  </div>
                  {entry.notes && <p className="text-xs text-muted-foreground mt-1 italic">{entry.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditing(entry); setShowForm(false) }}
                    className="p-2 rounded-lg border border-border-subtle text-muted hover:text-foreground hover:bg-surface-overlay transition-colors"
                    title="Modifier"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={deleting === entry.id}
                    className="p-2 rounded-lg border border-guitar-600/30 text-guitar-400 hover:bg-guitar-600/10 transition-colors disabled:opacity-40"
                    title="Supprimer"
                  >
                    {deleting === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
