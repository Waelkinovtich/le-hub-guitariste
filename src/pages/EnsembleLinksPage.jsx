import { useState, useEffect, useRef } from 'react'
import { Plus, Copy, Check, Link2, Loader2, Trash2, AlertCircle, School, Filter, Calendar, Pencil, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { trierSlotsDesLignes } from '../utils/creneauxSort'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Même année scolaire que EnsembleSondagePage pour la lecture de school_schedules
const CURRENT_YEAR = '2026-2027'

// Ordre canonique des jours pour trier les lignes d'emploi du temps
const ORDER_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(token) {
  return `${window.location.origin}/sondage-ensemble/${token}`
}

// Trie les lignes par ordre de jour canonique ET leurs créneaux chronologiquement
function trierLignesSchedule(rows) {
  return trierSlotsDesLignes(
    [...rows].sort((a, b) => ORDER_JOURS.indexOf(a.day) - ORDER_JOURS.indexOf(b.day))
  )
}

// Compte le total de créneaux dans un objet { jour: [slots] }
function totalCreneauxProposes(cp) {
  if (!cp) return 0
  return Object.values(cp).reduce((s, arr) => s + arr.length, 0)
}

// Convertit [{day, start, end}] → { jour: ["HH:MM–HH:MM", ...] }
function creneauxManuelsToMap(manuels) {
  const map = {}
  for (const { day, start, end } of manuels) {
    const slot = `${start}–${end}`
    map[day] = [...(map[day] ?? []), slot]
  }
  return map
}

// Fusionne les créneaux cochés depuis school_schedules et les créneaux ajoutés manuellement
// dans la même structure { jour: [slots] }
function fusionnerCreneaux(coches, manuels) {
  const manuelsMap = creneauxManuelsToMap(manuels)
  const fusion = { ...coches }
  for (const [jour, slots] of Object.entries(manuelsMap)) {
    fusion[jour] = [...(fusion[jour] ?? []), ...slots]
  }
  return fusion
}

// Inverse de fusionnerCreneaux : redistribue creneaux_proposes existant en deux états distincts.
// Slots présents dans l'emploi du temps de l'école → formCreneaux (coches).
// Slots absents de l'école (ajoutés manuellement) → creneauxManuels [{day, start, end}].
// Utilisé lors du pré-remplissage du formulaire d'édition.
function separerCreneaux(creneauxProposes, scheduleJours) {
  const coches  = {}
  const manuels = []
  if (!creneauxProposes) return { coches, manuels }

  // Index des slots école par jour pour recherche O(1)
  const slotsEcoleParJour = {}
  for (const { day, slots } of scheduleJours) {
    slotsEcoleParJour[day] = new Set(slots)
  }

  for (const [jour, slots] of Object.entries(creneauxProposes)) {
    for (const slot of slots) {
      if (slotsEcoleParJour[jour]?.has(slot)) {
        coches[jour] = [...(coches[jour] ?? []), slot]
      } else {
        // Slot hors emploi du temps : décompose "HH:MM–HH:MM" en {day, start, end}
        const [start, end] = slot.split('–')
        manuels.push({ day: jour, start: start?.trim() ?? '', end: end?.trim() ?? '' })
      }
    }
  }
  return { coches, manuels }
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

// ─── Ajout manuel de créneaux libres ─────────────────────────────────────────

/**
 * Permet d'ajouter des créneaux libres (sans contrainte school_schedules).
 * manuels  : [{day, start, end}] — liste courante
 * onAdd    : fonction appelée avec {day, start, end}
 * onRemove : fonction appelée avec l'index à supprimer
 */
function AjoutCreneauManuel({ manuels, onAdd, onRemove }) {
  const [jour,  setJour]  = useState(ORDER_JOURS[0])
  const [debut, setDebut] = useState('')
  const [fin,   setFin]   = useState('')
  const [err,   setErr]   = useState('')

  function handleAjouter() {
    setErr('')
    if (!debut || !fin) { setErr('Heure de début et de fin requises'); return }
    if (debut >= fin)   { setErr("L'heure de fin doit être après l'heure de début"); return }
    // Déduplication : évite d'ajouter deux fois le même créneau
    if (manuels.some((m) => m.day === jour && m.start === debut && m.end === fin)) {
      setErr('Ce créneau existe déjà'); return
    }
    onAdd({ day: jour, start: debut, end: fin })
    setDebut('')
    setFin('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={jour}
          onChange={(e) => setJour(e.target.value)}
          className={selectCls + ' flex-1 min-w-[120px]'}
        >
          {ORDER_JOURS.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
        <input
          type="time"
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          className={inputCls + ' flex-1 min-w-[100px]'}
          aria-label="Heure de début"
        />
        <span className="text-xs text-muted-foreground shrink-0">→</span>
        <input
          type="time"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className={inputCls + ' flex-1 min-w-[100px]'}
          aria-label="Heure de fin"
        />
        <button
          type="button"
          onClick={handleAjouter}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/30 text-guitar-400 text-xs font-medium hover:bg-guitar-600/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {manuels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {manuels.map((m, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border border-guitar-600/40 bg-guitar-600/10 text-guitar-400"
            >
              <span className="font-medium">{m.day}</span>
              <span>{m.start}–{m.end}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-0.5 hover:text-red-400 transition-colors leading-none"
                title="Supprimer ce créneau"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
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

  // Null = formulaire de création ; string = id du token en cours d'édition
  const [editingTokenId, setEditingTokenId] = useState(null)
  // Incrémenté pour forcer le rechargement de l'emploi du temps même si formSchoolId ne change pas
  const [schoolLoadKey,  setSchoolLoadKey]  = useState(0)
  // Creneaux_proposes à redistribuer après chargement de l'école (mode édition)
  const preFillRef = useRef(null)

  // Formulaire (création et édition)
  const [formType,          setFormType]          = useState('generique')
  const [formLabel,         setFormLabel]         = useState('')
  const [formSchoolId,      setFormSchoolId]      = useState('')
  const [formMode,           setFormMode]          = useState('choix') // 'choix' | 'fixe'
  const [formEcoleActive,   setFormEcoleActive]   = useState(true) // toggle "Proposer les créneaux habituels de cette école"
  const [formCreneaux,      setFormCreneaux]      = useState({}) // créneaux restreints sélectionnés (school_schedules)
  const [creneauxManuels,   setCreneauxManuels]   = useState([]) // créneaux libres ajoutés manuellement
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
      // Permet d'afficher school_name + badge creneaux_proposes + mode dans la liste
      supabase
        .from('ensemble_tokens')
        .select('id, school_id, school_name, creneaux_proposes, mode')
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
  // schoolLoadKey permet de forcer ce rechargement même si formSchoolId n'a pas changé
  // (utile quand on édite deux tokens consécutifs de la même école).

  useEffect(() => {
    if (!formSchoolId) {
      setFormSchoolSchedule([])
      // En mode édition sans école, preFillRef est déjà consommé dans ouvrirEdition
      if (!preFillRef.current) setFormCreneaux({})
      return
    }
    const ecole = schools.find((s) => s.id === formSchoolId)
    if (!ecole) return
    let cancelled = false
    setLoadingSchedule(true)
    supabase
      .from('school_schedules')
      .select('day, slots')
      .eq('school_name', ecole.name)
      .eq('school_year', CURRENT_YEAR)
      .then(({ data }) => {
        if (cancelled) return
        const schedule = trierLignesSchedule(data ?? [])
        setFormSchoolSchedule(schedule)

        // Consomme le pré-remplissage si on vient d'ouvrir l'édition d'un token
        const pending = preFillRef.current
        preFillRef.current = null
        if (pending) {
          const { coches, manuels } = separerCreneaux(pending, schedule)
          // Si le lien n'avait que des créneaux manuels → toggle "Non" automatique
          setFormEcoleActive(Object.keys(coches).length > 0)
          setFormCreneaux(coches)
          setCreneauxManuels(manuels)
        } else {
          setFormEcoleActive(true)
          setFormCreneaux({})
        }
        setLoadingSchedule(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSchoolId, schools, schoolLoadKey])

  // ── Réinitialisation du formulaire ─────────────────────────────────────────

  function annulerEdition() {
    setEditingTokenId(null)
    setFormLabel('')
    setFormType('generique')
    setFormMode('choix')
    setFormSchoolId('')
    setFormEcoleActive(true)
    setFormCreneaux({})
    setCreneauxManuels([])
    setFormErr('')
    preFillRef.current = null
  }

  // ── Ouverture du formulaire d'édition pré-rempli ──────────────────────────

  function ouvrirEdition(token) {
    setEditingTokenId(token.id)
    setFormLabel(token.label ?? '')
    setFormType(token.token_type)
    setFormMode(token.mode ?? 'choix')
    setFormErr('')

    if (token.school_id) {
      // Avec école : le useEffect chargera le schedule puis distribuera creneaux_proposes
      preFillRef.current = token.creneaux_proposes ?? null
      setFormSchoolId(token.school_id)
      // Force le rechargement même si l'école était déjà sélectionnée
      setSchoolLoadKey((k) => k + 1)
    } else {
      // Sans école : tous les slots de creneaux_proposes sont manuels — toggle non pertinent, reset à true
      preFillRef.current = null
      setFormSchoolId('')
      setFormSchoolSchedule([])
      setFormEcoleActive(true)
      setFormCreneaux({})
      const manuels = []
      if (token.creneaux_proposes) {
        for (const [jour, slots] of Object.entries(token.creneaux_proposes)) {
          for (const slot of slots) {
            const [start, end] = slot.split('–')
            manuels.push({ day: jour, start: start?.trim() ?? '', end: end?.trim() ?? '' })
          }
        }
      }
      setCreneauxManuels(manuels)
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Création ou mise à jour d'un token ─────────────────────────────────────

  async function handleSauvegarder(e) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    const ecole = schools.find((s) => s.id === formSchoolId)
    // Fusionne créneaux cochés (school_schedules) + créneaux libres ajoutés manuellement
    // Si toggle école désactivé, formCreneaux ignoré — seuls les créneaux manuels comptent
    // Null si aucun → tous les créneaux de l'école seront proposés (comportement par défaut)
    const fusion = fusionnerCreneaux(formEcoleActive ? formCreneaux : {}, creneauxManuels)
    const creneauxProposes = Object.keys(fusion).length > 0 ? fusion : null

    // ── Branche UPDATE (édition d'un lien existant) ──────────────────────────
    if (editingTokenId) {
      // token et token_type ne sont jamais modifiés — seuls les métadonnées et créneaux changent
      const updatePayload = {
        label:             formLabel.trim() || null,
        school_id:         formSchoolId || null,
        school_name:       ecole?.name ?? null,
        creneaux_proposes: creneauxProposes,
        mode:              formMode,
      }
      let { error } = await supabase.from('ensemble_tokens').update(updatePayload).eq('id', editingTokenId)

      // Dégradation si colonne mode absente (migration-mode-fixe non encore appliquée)
      if (error?.code === '42703') {
        const { mode: _m, ...updateSansMode } = updatePayload
        const r2 = await supabase.from('ensemble_tokens').update(updateSansMode).eq('id', editingTokenId)
        error = r2.error
      }

      setSaving(false)
      if (error) { setFormErr(error.message); return }

      // Mise à jour locale (évite re-fetch)
      setTokens((prev) => prev.map((t) =>
        t.id === editingTokenId ? { ...t, ...updatePayload } : t
      ))
      annulerEdition()
      return
    }

    // ── Branche INSERT (création d'un nouveau lien) ──────────────────────────
    const SEL = 'id, token, token_type, label, used_at, created_at'
    // Tentative 1 : INSERT complet (toutes colonnes disponibles après migration-mode-fixe)
    const insertComplet = {
      teacher_id:        user.id,
      token_type:        formType,
      label:             formLabel.trim() || null,
      school_id:         formSchoolId || null,
      school_name:       ecole?.name ?? null,
      creneaux_proposes: creneauxProposes,
      mode:              formMode,
    }
    let { data, error } = await supabase.from('ensemble_tokens').insert(insertComplet).select(SEL).single()

    if (error?.code === '42703') {
      // Tentative 2 : colonne mode absente (migration-mode-fixe non encore appliquée)
      const { mode: _m, ...insertSansMode } = insertComplet
      const r2 = await supabase.from('ensemble_tokens').insert(insertSansMode).select(SEL).single()
      if (r2.error?.code === '42703') {
        // Tentative 3 : aucune colonne enrichie — comportement pre-migration
        const r3 = await supabase
          .from('ensemble_tokens')
          .insert({ teacher_id: user.id, token_type: formType, label: formLabel.trim() || null })
          .select(SEL)
          .single()
        data  = r3.data
        error = r3.error
      } else {
        data  = r2.data
        error = r2.error
      }
    }

    setSaving(false)
    if (error) { setFormErr(error.message); return }
    const newToken = {
      ...data,
      school_id:         formSchoolId || null,
      school_name:       ecole?.name ?? null,
      creneaux_proposes: creneauxProposes,
      mode:              formMode,
    }
    setTokens((prev) => [newToken, ...prev])
    annulerEdition()
  }

  // ── Suppression ─────────────────────────────────────────────────────────────

  async function handleSupprimer(id) {
    if (!window.confirm('Supprimer ce lien ? Les réponses déjà reçues ne seront pas supprimées.')) return
    const { error } = await supabase.from('ensemble_tokens').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

  // Calculé une fois pour la validation mode fixe (utilisé dans le JSX)
  const fusionCourante    = fusionnerCreneaux(formEcoleActive ? formCreneaux : {}, creneauxManuels)
  const nbFusionCourante  = Object.values(fusionCourante).reduce((s, a) => s + a.length, 0)
  const bloqueFixe        = formMode === 'fixe' && nbFusionCourante !== 1

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

      {/* ── Formulaire de création / édition ───────────────────────────── */}
      <form onSubmit={handleSauvegarder} className="glass-panel rounded-xl p-5 space-y-4 border border-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {editingTokenId ? 'Modifier le lien' : 'Créer un lien'}
          </p>
          {editingTokenId && (
            <button
              type="button"
              onClick={annulerEdition}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Annuler
            </button>
          )}
        </div>

        {/* Type — non modifiable en édition (l'URL partagée dépend du comportement individuel/générique) */}
        {!editingTokenId && (
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
        )}

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
            {/* Toggle : inclure ou non les créneaux habituels de l'école */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <School className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">Proposer les créneaux habituels de cette école</p>
                {loadingSchedule && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex shrink-0 rounded-lg border border-border-subtle overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setFormEcoleActive(true)}
                  className={`px-2.5 py-1 transition-colors ${
                    formEcoleActive
                      ? 'bg-guitar-600/15 text-guitar-400 font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => { setFormEcoleActive(false); setFormCreneaux({}) }}
                  className={`px-2.5 py-1 transition-colors border-l border-border-subtle ${
                    !formEcoleActive
                      ? 'bg-guitar-600/15 text-guitar-400 font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Non
                </button>
              </div>
            </div>

            {/* Liste des créneaux école — masquée si toggle Non */}
            {formEcoleActive && (
              <>
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">Filtrer les créneaux proposés</p>
                </div>
                <SelecteurCreneaux
                  scheduleJours={formSchoolSchedule}
                  value={formCreneaux}
                  onChange={setFormCreneaux}
                />
              </>
            )}
          </div>
        )}

        {/* Section créneaux manuels — toujours visible, indépendante de l'école */}
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-foreground">Ajouter un créneau spécifique à ce lien</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Libre — aucune contrainte de l'emploi du temps de l'école. Se cumule avec les créneaux cochés ci-dessus.
            </p>
          </div>
          <AjoutCreneauManuel
            manuels={creneauxManuels}
            onAdd={(c) => setCreneauxManuels((prev) => [...prev, c])}
            onRemove={(i) => setCreneauxManuels((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>

        {/* Mode du lien — placé après les créneaux pour que le professeur sache combien il en a */}
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Mode du lien
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { value: 'choix', label: 'Sondage de disponibilités', desc: 'Les participants choisissent parmi plusieurs créneaux' },
              { value: 'fixe',  label: 'Horaire fixe à confirmer',  desc: 'Vous annoncez un créneau — ils confirment leur présence' },
            ].map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormMode(value)}
                className={`px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                  formMode === value
                    ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                }`}
              >
                <p className="font-medium">{label}</p>
                <p className="text-xs mt-0.5 opacity-70">{desc}</p>
              </button>
            ))}
          </div>
          {/* Avertissement mode fixe : exactement 1 créneau requis — réutilise bloqueFixe */}
          {bloqueFixe && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {nbFusionCourante === 0
                  ? 'En mode horaire fixe, sélectionnez exactement 1 créneau (cochés ou manuel) avant de valider.'
                  : `En mode horaire fixe, un seul créneau est autorisé — vous en avez sélectionné ${nbFusionCourante}. Retirez les créneaux en trop.`
                }
              </span>
            </div>
          )}
        </div>

        {formErr && <p className="text-xs text-red-400">{formErr}</p>}

        <button
          type="submit"
          disabled={saving || bloqueFixe}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-500 transition-colors disabled:opacity-50"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : editingTokenId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />
          }
          {editingTokenId ? 'Enregistrer les modifications' : 'Créer le lien'}
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
                    {/* Badge mode fixe */}
                    {t.mode === 'fixe' && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">
                        <Calendar className="w-3 h-3" />
                        Horaire fixe
                      </span>
                    )}
                    {/* Badge créneaux restreints (mode choix uniquement) */}
                    {nbCreneaux > 0 && t.mode !== 'fixe' && (
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
                    onClick={() => ouvrirEdition(t)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      editingTokenId === t.id
                        ? 'text-guitar-400 bg-guitar-600/10'
                        : 'text-muted-foreground hover:text-guitar-400 hover:bg-guitar-600/10'
                    }`}
                    title="Modifier ce lien"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
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
