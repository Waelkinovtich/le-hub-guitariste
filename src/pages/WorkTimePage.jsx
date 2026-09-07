import { useState, useEffect, useMemo } from 'react'
import { Timer, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  usePeriod,
  schoolYearFromDate,
  schoolYearRange,
} from '../context/PeriodContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Catégories de temps de travail non rémunéré, ordonnées par fréquence d'usage supposée
const CATEGORIES = [
  { value: 'preparation',      label: 'Préparation des cours' },
  { value: 'administratif',    label: 'Administratif' },
  { value: 'deplacement_admin',label: 'Déplacement administratif' },
  { value: 'autre',            label: 'Autre' },
]

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]))

// Couleurs par catégorie pour les badges du récapitulatif
const CAT_COLOR = {
  preparation:       'bg-guitar-600/15 text-guitar-400 border-guitar-600/25',
  administratif:     'bg-blue-500/15 text-blue-400 border-blue-500/25',
  deplacement_admin: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  autre:             'bg-surface-raised text-muted-foreground border-border-subtle',
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Formate une durée en minutes en "Xh Ymin" (ex : 90 → "1h 30min") */
function fmtDuree(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/**
 * Filtre les entrées selon le contexte de période.
 * Adapté pour le champ `date` (ISO YYYY-MM-DD) de work_time_entries.
 */
function filtrerParPeriode(entries, period) {
  const { mode, value } = period
  if (mode === 'toutes' || !mode) return entries
  return entries.filter((e) => {
    const dateStr = e.date
    if (!dateStr) return true
    if (mode === 'annee_scolaire') {
      if (value && !Array.isArray(value) && value.from && value.to) {
        const sy = schoolYearFromDate(dateStr)
        return sy >= value.from && sy <= value.to
      }
      const selected = Array.isArray(value) ? value : (value ? [value] : [])
      return !selected.length || selected.includes(schoolYearFromDate(dateStr))
    }
    if (mode === 'annee_civile') {
      if (value && !Array.isArray(value) && value.from && value.to) {
        const cy = String(new Date(dateStr).getFullYear())
        return cy >= value.from && cy <= value.to
      }
      const selected = (Array.isArray(value) ? value : (value ? [value] : [])).map(Number)
      return !selected.length || selected.includes(new Date(dateStr).getFullYear())
    }
    if (mode === 'plage_personnalisee' && value?.from && value?.to) {
      return dateStr >= value.from && dateStr <= value.to
    }
    return true
  })
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'
const selectCls = inputCls + ' cursor-pointer'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function WorkTimePage() {
  const { user } = useAuth()
  const { period } = usePeriod()

  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [erreur,  setErreur]    = useState(null)
  const [saving,  setSaving]    = useState(false)

  // Formulaire d'ajout
  const [formDate,  setFormDate]  = useState(todayISO())
  const [formCat,   setFormCat]   = useState('preparation')
  const [formDuree, setFormDuree] = useState('')
  const [formDesc,  setFormDesc]  = useState('')
  const [formErr,   setFormErr]   = useState('')

  // ─── Chargement ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('work_time_entries')
        .select('*')
        .eq('teacher_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (!cancelled) {
        if (error) setErreur(error.message)
        else setEntries(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // ─── Filtrage par période ────────────────────────────────────────────────────

  const entriesFiltrees = useMemo(() => filtrerParPeriode(entries, period), [entries, period])

  // ─── Récapitulatif par catégorie ─────────────────────────────────────────────

  const recap = useMemo(() => {
    const totaux = {}
    for (const e of entriesFiltrees) {
      if (!totaux[e.categorie]) totaux[e.categorie] = 0
      totaux[e.categorie] += e.duree_minutes
    }
    return totaux
  }, [entriesFiltrees])

  const totalMinutes = useMemo(
    () => Object.values(recap).reduce((s, v) => s + v, 0),
    [recap],
  )

  // ─── Ajout ──────────────────────────────────────────────────────────────────

  async function handleAjouter(e) {
    e.preventDefault()
    setFormErr('')
    const duree = parseInt(formDuree, 10)
    if (!formDate) { setFormErr('La date est requise.'); return }
    if (isNaN(duree) || duree <= 0) { setFormErr('La durée doit être un nombre entier positif (en minutes).'); return }

    setSaving(true)
    const { data, error } = await supabase.from('work_time_entries').insert({
      teacher_id:    user.id,
      date:          formDate,
      categorie:     formCat,
      duree_minutes: duree,
      description:   formDesc.trim() || null,
    }).select().single()

    setSaving(false)
    if (error) { setFormErr(error.message); return }

    setEntries((prev) => [data, ...prev])
    setFormDuree('')
    setFormDesc('')
    // Garde la date et la catégorie pour faciliter la saisie en série
  }

  // ─── Suppression ─────────────────────────────────────────────────────────────

  async function handleSupprimer(id) {
    if (!window.confirm('Supprimer cette entrée ?')) return
    const { error } = await supabase.from('work_time_entries').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // ─── Libellé de période ──────────────────────────────────────────────────────

  function labelPeriode() {
    const { mode, value } = period
    if (mode === 'toutes' || !mode) return 'toutes périodes'
    if (mode === 'annee_scolaire') {
      if (value && !Array.isArray(value) && value.from) return `${value.from} → ${value.to}`
      return Array.isArray(value) ? value.join(', ') : value
    }
    if (mode === 'annee_civile') {
      if (value && !Array.isArray(value) && value.from) return `${value.from} → ${value.to}`
      return Array.isArray(value) ? value.join(', ') : value
    }
    if (mode === 'plage_personnalisee') return `${value?.from} → ${value?.to}`
    return '—'
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Chargement…</span>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Timer className="w-5 h-5 text-guitar-400" />
        <div>
          <h1 className="text-lg font-semibold">Temps de travail non rémunéré</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Préparation, administratif, déplacements — hors cours facturés.
          </p>
        </div>
      </div>

      {erreur && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {erreur}
        </div>
      )}

      {/* ── Formulaire d'ajout rapide ─────────────────────────────────────── */}
      <form onSubmit={handleAjouter} className="glass-panel rounded-xl p-5 space-y-4 border border-border">
        <p className="text-sm font-medium">Ajouter une entrée</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Date</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Durée (minutes)</label>
            <input
              type="number"
              min="1"
              step="5"
              placeholder="ex : 30"
              value={formDuree}
              onChange={(e) => setFormDuree(e.target.value)}
              className={inputCls}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Catégorie</label>
          <select
            value={formCat}
            onChange={(e) => setFormCat(e.target.value)}
            className={selectCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Description <span className="text-muted-foreground/60">(optionnel)</span></label>
          <input
            type="text"
            placeholder="ex : Préparation séquence cycle 1…"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            maxLength={300}
            className={inputCls}
          />
        </div>

        {formErr && (
          <p className="text-xs text-red-400">{formErr}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Ajouter
        </button>
      </form>

      {/* ── Récapitulatif par catégorie ───────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-medium">
          Récapitulatif — <span className="text-muted-foreground font-normal">{labelPeriode()}</span>
        </p>

        {entriesFiltrees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune entrée pour cette période.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(({ value, label }) => {
                const min = recap[value] ?? 0
                if (min === 0) return null
                return (
                  <div
                    key={value}
                    className={`rounded-xl border px-4 py-3 ${CAT_COLOR[value]}`}
                  >
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-lg font-semibold mt-0.5">{fmtDuree(min)}</p>
                  </div>
                )
              })}
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-sm font-semibold">{fmtDuree(totalMinutes)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Liste des entrées ─────────────────────────────────────────────── */}
      {entriesFiltrees.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {entriesFiltrees.length} entrée{entriesFiltrees.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-1.5">
            {entriesFiltrees.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-raised hover:border-border transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{fmtDuree(e.duree_minutes)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${CAT_COLOR[e.categorie]}`}>
                      {CAT_LABEL[e.categorie] ?? e.categorie}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                  </div>
                  {e.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSupprimer(e.id)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Supprimer cette entrée"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
