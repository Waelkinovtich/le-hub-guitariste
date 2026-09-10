import { useState, useEffect } from 'react'
import { Plus, Copy, Check, Link2, Loader2, Trash2, AlertCircle, School, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Même année scolaire que EnsembleSondagePage pour la lecture de school_schedules
const CURRENT_YEAR = '2026-2027'

// Ordre canonique des jours pour trier les lignes d'emploi du temps
const ORDER_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(token) {
  return `${window.location.origin}/sondage-ensemble/${token}`
}

// Trie les lignes d'emploi du temps par ordre de jour canonique
function trierLignesSchedule(rows) {
  return [...rows].sort((a, b) => ORDER_JOURS.indexOf(a.day) - ORDER_JOURS.indexOf(b.day))
}

// Compte le total de créneaux dans un objet { jour: [slots] }
function totalCreneauxProposes(cp) {
  if (!cp) return 0
  return Object.values(cp).reduce((s, arr) => s + arr.length, 0)
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'
const selectCls = inputCls + ' cursor-pointer'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Composant copie-lien ─────────────────────────────────────────────────────

function CopyButton({ url }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs text-muted-foreground hover:text-guitar-400 hover:border-guitar-600/40 transition-colors"
      title="Copier le lien"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-guitar-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copié !' : 'Copier'}
    </button>
  )
}

// ─── Sélecteur de créneaux à proposer ────────────────────────────────────────

/**
 * Permet au professeur de restreindre les créneaux proposés dans ce sondage.
 * scheduleJours : [{day, slots}] — emploi du temps complet de l'école
 * value        : { jour: [slots...] } — sélection courante (vide = tous)
 * onChange     : setter du state
 */
function SelecteurCreneaux({ scheduleJours, value, onChange }) {
  if (scheduleJours.length === 0) return null

  const nbTotal = totalCreneauxProposes(value)

  // Bascule un créneau individuel dans la sélection
  function toggleSlot(jour, slot) {
    const current = value[jour] ?? []
    const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot]
    if (next.length === 0) {
      const { [jour]: _ignored, ...rest } = value
      onChange(rest)
    } else {
      onChange({ ...value, [jour]: next })
    }
  }

  // Bascule tous les créneaux d'un jour (sélectionner / tout désélectionner)
  function toggleJour(jour, slots) {
    const current = value[jour] ?? []
    const tousCoches = current.length === slots.length
    if (tousCoches) {
      const { [jour]: _ignored, ...rest } = value
      onChange(rest)
    } else {
      onChange({ ...value, [jour]: [...slots] })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">Créneaux proposés dans ce sondage</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {nbTotal === 0
              ? 'Aucun sélectionné — tous les créneaux de l\'école seront proposés'
              : `${nbTotal} créneau${nbTotal > 1 ? 'x' : ''} sélectionné${nbTotal > 1 ? 's' : ''} — seuls ceux-ci seront proposés`}
          </p>
        </div>
        {nbTotal > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Tout effacer
          </button>
        )}
      </div>

      {scheduleJours.map(({ day, slots }) => {
        if (!slots || slots.length === 0) return null
        const selected = value[day] ?? []
        const tousCoches = selected.length === slots.length
        const hasSelected = selected.length > 0

        return (
          <div
            key={day}
            className={`rounded-xl border transition-all ${
              hasSelected ? 'border-guitar-600/40 bg-guitar-600/5' : 'border-border-subtle bg-surface-raised'
            }`}
          >
            {/* En-tête du jour avec bouton tout sélectionner */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className={`text-xs font-medium ${hasSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {day}
                {hasSelected && <span className="ml-1.5 text-guitar-400">({selected.length}/{slots.length})</span>}
              </span>
              <button
                type="button"
                onClick={() => toggleJour(day, slots)}
                className="text-xs text-muted-foreground hover:text-guitar-400 transition-colors"
              >
                {tousCoches ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>

            {/* Grille de créneaux */}
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {slots.map((slot) => {
                const active = selected.includes(slot)
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(day, slot)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all ${
                      active
                        ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                        : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 flex-shrink-0" />}
                    {slot}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleLinksPage() {
  const { user } = useAuth()
  const [tokens,  setTokens]  = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur,  setErreur]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  // Formulaire de création
  const [formType,          setFormType]          = useState('generique')
  const [formLabel,         setFormLabel]         = useState('')
  const [formSchoolId,      setFormSchoolId]      = useState('')
  const [formCreneaux,      setFormCreneaux]      = useState({}) // créneaux restreints sélectionnés
  const [formSchoolSchedule, setFormSchoolSchedule] = useState([]) // créneaux complets de l'école choisie
  const [loadingSchedule,   setLoadingSchedule]   = useState(false)
  const [formErr,           setFormErr]           = useState('')

  // ── Chargement initial ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)

      // Phase 1 — colonnes de base garanties (pas de migration requise)
      // school_id, school_name, creneaux_proposes exclus : absents avant migration-enrichissement-sondage-ensemble.sql
      const [tokensRes, schoolsRes] = await Promise.all([
        supabase
          .from('ensemble_tokens')
          .select('id, token, token_type, label, used_at, created_at')
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('schools')
          .select('id, name')
          .order('name'),
      ])
      if (cancelled) return

      if (tokensRes.error) { setErreur(tokensRes.error.message); setLoading(false); return }
      const baseTokens = tokensRes.data ?? []
      setSchools(schoolsRes.data ?? [])

      // Phase 2 — colonnes enrichies (disponibles après migration) : erreur silencieuse
      // Permet d'afficher school_name + badge creneaux_proposes dans la liste
      supabase
        .from('ensemble_tokens')
        .select('id, school_id, school_name, creneaux_proposes')
        .eq('teacher_id', user.id)
        .then(({ data: enrichi }) => {
          if (cancelled || !enrichi) return
          const enrichiById = Object.fromEntries(enrichi.map((r) => [r.id, r]))
          setTokens(baseTokens.map((t) => ({ ...t, ...enrichiById[t.id] })))
        })
        .catch(() => { /* colonnes absentes pre-migration — liste sans school_name ni badge */ })

      setTokens(baseTokens)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // ── Chargement de l'emploi du temps quand l'école sélectionnée change ────────

  useEffect(() => {
    if (!formSchoolId) {
      setFormSchoolSchedule([])
      setFormCreneaux({})
      return
    }
    const ecole = schools.find((s) => s.id === formSchoolId)
    if (!ecole) return
    let cancelled = false
    setLoadingSchedule(true)
    setFormCreneaux({}) // réinitialise la sélection quand l'école change
    supabase
      .from('school_schedules')
      .select('day, slots')
      .eq('school_name', ecole.name)
      .eq('school_year', CURRENT_YEAR)
      .then(({ data }) => {
        if (!cancelled) {
          setFormSchoolSchedule(trierLignesSchedule(data ?? []))
          setLoadingSchedule(false)
        }
      })
    return () => { cancelled = true }
  }, [formSchoolId, schools])

  // ── Création d'un token ─────────────────────────────────────────────────────

  async function handleCreer(e) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    const ecole = schools.find((s) => s.id === formSchoolId)
    // Null si aucun créneau sélectionné → tous proposés (comportement par défaut)
    const creneauxProposes = Object.keys(formCreneaux).length > 0 ? formCreneaux : null
    // Tentative 1 : INSERT avec toutes les colonnes (disponibles après migration)
    const insertEnrichi = {
      teacher_id:        user.id,
      token_type:        formType,
      label:             formLabel.trim() || null,
      school_id:         formSchoolId || null,
      school_name:       ecole?.name ?? null,
      creneaux_proposes: creneauxProposes,
    }
    let { data, error } = await supabase
      .from('ensemble_tokens')
      .insert(insertEnrichi)
      .select('id, token, token_type, label, used_at, created_at')
      .single()

    // Tentative 2 : si colonnes migration manquantes (42703) → INSERT avec colonnes de base uniquement
    if (error?.code === '42703') {
      const r2 = await supabase
        .from('ensemble_tokens')
        .insert({ teacher_id: user.id, token_type: formType, label: formLabel.trim() || null })
        .select('id, token, token_type, label, used_at, created_at')
        .single()
      data  = r2.data
      error = r2.error
    }

    setSaving(false)
    if (error) { setFormErr(error.message); return }
    // Attache les valeurs localement (évite un re-fetch)
    const newToken = {
      ...data,
      school_id:         formSchoolId || null,
      school_name:       ecole?.name ?? null,
      creneaux_proposes: creneauxProposes,
    }
    setTokens((prev) => [newToken, ...prev])
    setFormLabel('')
    setFormType('generique')
    setFormSchoolId('')
    setFormCreneaux({})
  }

  // ── Suppression ─────────────────────────────────────────────────────────────

  async function handleSupprimer(id) {
    if (!window.confirm('Supprimer ce lien ? Les réponses déjà reçues ne seront pas supprimées.')) return
    const { error } = await supabase.from('ensemble_tokens').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

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
        <Link2 className="w-5 h-5 text-guitar-400" />
        <div>
          <h1 className="text-lg font-semibold">Liens d'inscription — Répétitions d'ensemble</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Créez des liens à envoyer aux participants pour recueillir leurs disponibilités.
          </p>
        </div>
      </div>

      {erreur && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />{erreur}
        </div>
      )}

      {/* ── Formulaire de création ──────────────────────────────────────── */}
      <form onSubmit={handleCreer} className="glass-panel rounded-xl p-5 space-y-4 border border-border">
        <p className="text-sm font-medium">Créer un lien</p>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Type de lien</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'generique',  label: 'Générique',  desc: 'Partageable à tous (lien réutilisable)' },
              { value: 'individuel', label: 'Individuel', desc: 'Usage unique — pour une personne précise' },
            ].map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormType(value)}
                className={`px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                  formType === value
                    ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                }`}
              >
                <p className="font-medium">{label}</p>
                <p className="text-xs mt-0.5 opacity-70">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Libellé */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Libellé <span className="opacity-60">(optionnel)</span></label>
          <input
            type="text"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="ex : Répét jazz automne 2026"
            maxLength={120}
            className={inputCls}
          />
        </div>

        {/* École */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <School className="w-3.5 h-3.5" />
            École associée <span className="opacity-60">(optionnel — affiche le vrai calendrier dans le formulaire)</span>
          </label>
          <select
            value={formSchoolId}
            onChange={(e) => setFormSchoolId(e.target.value)}
            className={selectCls}
          >
            <option value="">Aucune école (créneaux libres)</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Sélecteur de créneaux — n'apparaît que si une école est choisie */}
        {formSchoolId && (
          <div className="border-t border-border-subtle pt-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Filtrer les créneaux proposés</p>
              {loadingSchedule && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <SelecteurCreneaux
              scheduleJours={formSchoolSchedule}
              value={formCreneaux}
              onChange={setFormCreneaux}
            />
          </div>
        )}

        {formErr && <p className="text-xs text-red-400">{formErr}</p>}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Créer le lien
        </button>
      </form>

      {/* ── Liste des tokens ────────────────────────────────────────────── */}
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Aucun lien créé pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{tokens.length} lien{tokens.length > 1 ? 's' : ''}</p>
          {tokens.map((t) => {
            const url = buildUrl(t.token)
            const isUsed = t.used_at && t.token_type === 'individuel'
            const nbCreneaux = totalCreneauxProposes(t.creneaux_proposes)
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-raised hover:border-border transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      t.token_type === 'generique'
                        ? 'bg-guitar-600/15 text-guitar-400 border-guitar-600/25'
                        : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                    }`}>
                      {t.token_type === 'generique' ? 'Générique' : 'Individuel'}
                    </span>
                    {t.label && <span className="text-sm font-medium">{t.label}</span>}
                    {t.school_name && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <School className="w-3 h-3" />{t.school_name}
                      </span>
                    )}
                    {/* Badge créneaux restreints */}
                    {nbCreneaux > 0 && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                        <Filter className="w-3 h-3" />
                        {nbCreneaux} créneau{nbCreneaux > 1 ? 'x' : ''}
                      </span>
                    )}
                    {isUsed && (
                      <span className="text-xs px-1.5 py-0.5 rounded border bg-surface-overlay text-muted-foreground border-border-subtle">
                        Utilisé le {fmtDate(t.used_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{url}</p>
                  <p className="text-xs text-muted-foreground">Créé le {fmtDate(t.created_at)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isUsed && <CopyButton url={url} />}
                  <button
                    type="button"
                    onClick={() => handleSupprimer(t.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Supprimer ce lien"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
