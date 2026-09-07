import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Music2, Check, ChevronRight, ChevronLeft, Loader2, AlertCircle } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Même année scolaire que SondagePage pour les requêtes school_schedules
const CURRENT_YEAR = '2026-2027'

// Ordre canonique des jours pour trier les lignes d'emploi du temps
const ORDER_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Créneaux libres 30 min 9h–22h — fallback si aucune école liée au token
function genererCreneauxLibres() {
  const slots = []
  for (let h = 9; h <= 21; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const endM = m + 30
      const endH = endM >= 60 ? h + 1 : h
      slots.push(`${hh}:${mm}–${String(endH).padStart(2, '0')}:${String(endM >= 60 ? endM - 60 : endM).padStart(2, '0')}`)
    }
  }
  return slots
}
const CRENEAUX_LIBRES = genererCreneauxLibres()

const INSTRUMENTS_ENSEMBLE = [
  'Guitare folk', 'Guitare électrique', 'Guitare classique', 'Basse',
  'Batterie', 'Clavier / Piano', 'Violon', 'Flûte', 'Saxophone',
  'Trompette', 'Voix', 'Autre',
]

const NIVEAUX_ENSEMBLE = [
  'Débutant (moins de 2 ans)', 'Intermédiaire (2–5 ans)', 'Confirmé (5–10 ans)', 'Avancé (10 ans et plus)',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Trie les lignes d'emploi du temps par ordre de jour canonique
function trierLignesSchedule(rows) {
  return [...rows].sort((a, b) => ORDER_JOURS.indexOf(a.day) - ORDER_JOURS.indexOf(b.day))
}

// Calcule les étapes selon si la personne est déjà élève
function getStepIds(estDejaEleve) {
  if (estDejaEleve === true) return ['identite', 'disponibilites']
  return ['identite', 'instrument', 'disponibilites']
}
const STEP_LABELS = {
  identite:       'Identité',
  instrument:     'Instrument & Compétences',
  disponibilites: 'Disponibilités',
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-muted-foreground">
        {label}{required && <span className="text-guitar-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle focus:border-guitar-600 focus:ring-1 focus:ring-guitar-600/50 outline-none transition-all text-sm'
const selectCls = inputCls + ' appearance-none'

// Bouton oui/non générique
function QuestionBinaire({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex gap-1 shrink-0">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              value === v
                ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400 font-medium'
                : 'border-border-subtle text-muted-foreground hover:border-border'
            }`}
          >
            {v ? 'Oui' : 'Non'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Étapes ───────────────────────────────────────────────────────────────────

function StepIdentite({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Prénom" required>
          <input className={inputCls} value={data.prenom} onChange={set('prenom')} placeholder="Jean" />
        </Field>
        <Field label="Nom" required>
          <input className={inputCls} value={data.nom} onChange={set('nom')} placeholder="Dupont" />
        </Field>
        <Field label="Année de naissance">
          <input
            className={inputCls}
            type="number"
            min="1930"
            max="2020"
            value={data.birth_year}
            onChange={set('birth_year')}
            placeholder="2000"
          />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={data.email} onChange={set('email')} placeholder="jean@email.fr" />
        </Field>
        <Field label="Téléphone">
          <input className={inputCls} type="tel" value={data.telephone} onChange={set('telephone')} placeholder="06 00 00 00 00" />
        </Field>
      </div>

      {/* Question clé : déjà élève ou participant externe */}
      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <p className="text-sm font-medium">Êtes-vous déjà élève de ce professeur ?</p>
        <div className="flex gap-3">
          {[
            { v: true,  l: 'Oui, je suis déjà élève', desc: 'Vous avez déjà des cours individuels' },
            { v: false, l: 'Non, je suis externe',     desc: 'Nouveau participant, pas de cours individuels' },
          ].map(({ v, l, desc }) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange({ ...data, est_deja_eleve: v })}
              className={`flex-1 px-3 py-3 rounded-xl border text-sm text-left transition-all ${
                data.est_deja_eleve === v
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle text-muted-foreground hover:border-border'
              }`}
            >
              <p className="font-medium text-xs">{l}</p>
              <p className="text-xs mt-0.5 opacity-70">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StepInstrument({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  const setBool = (k) => (v) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-5">
      <Field label="Instrument" required>
        <select className={selectCls} value={data.instrument} onChange={set('instrument')}>
          <option value="">Choisir…</option>
          {INSTRUMENTS_ENSEMBLE.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>

      <Field label="Niveau indicatif" required>
        <div className="space-y-2">
          {NIVEAUX_ENSEMBLE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...data, niveau: n })}
              className={`w-full px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                data.niveau === n
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Années de pratique">
        <input
          className={inputCls}
          type="number"
          min="0"
          max="60"
          value={data.annees_pratique}
          onChange={set('annees_pratique')}
          placeholder="ex : 3"
        />
      </Field>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground mb-3">Compétences musicales</p>
        <QuestionBinaire label="Lecture de partitions"  value={data.lecture_partition}  onChange={setBool('lecture_partition')} />
        <QuestionBinaire label="Lecture de tablatures"  value={data.lecture_tablature}  onChange={setBool('lecture_tablature')} />
        <QuestionBinaire label="Solfège rythmique"      value={data.solfege_rythmique}  onChange={setBool('solfege_rythmique')} />
        <QuestionBinaire label="Notions d'harmonie"     value={data.harmonie}           onChange={setBool('harmonie')} />
        <QuestionBinaire label="Déjà joué en groupe"    value={data.experience_groupe}  onChange={setBool('experience_groupe')} />
        {data.experience_groupe === true && (
          <div className="pt-2">
            <Field label="Durée d'expérience en groupe">
              <input
                className={inputCls}
                value={data.experience_groupe_duree}
                onChange={(e) => onChange({ ...data, experience_groupe_duree: e.target.value })}
                placeholder="ex : 2 ans avec un groupe de jazz"
                maxLength={200}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

/** Affiche les créneaux réels de l'école ou les créneaux libres si pas d'école. */
function StepDisponibilites({ data, onChange, scheduleJours }) {
  const totalSlots = Object.values(data.availabilities).reduce((s, arr) => s + arr.length, 0)

  function toggleSlot(jour, slot) {
    const current = data.availabilities[jour] ?? []
    const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot]
    const updated = { ...data.availabilities }
    if (next.length === 0) delete updated[jour]
    else updated[jour] = next
    onChange({ ...data, availabilities: updated })
  }

  // Utiliser l'emploi du temps réel si disponible, sinon les créneaux libres
  const lignes = useMemo(() => {
    if (scheduleJours && scheduleJours.length > 0) {
      return scheduleJours.map((row) => ({ jour: row.day, slots: row.slots ?? [] }))
    }
    return ORDER_JOURS.map((jour) => ({ jour, slots: CRENEAUX_LIBRES }))
  }, [scheduleJours])

  const avecSchool = scheduleJours && scheduleJours.length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-guitar-600/5 border border-guitar-600/20 px-4 py-3">
        <p className="text-sm text-foreground font-medium mb-0.5">💡 Cochez tous vos créneaux disponibles</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {avecSchool
            ? 'Créneaux selon le calendrier de votre école. '
            : 'Indiquez vos disponibilités générales. '}
          Plus vous cochez de créneaux, plus il sera facile de composer des groupes compatibles.
          {totalSlots > 0 && (
            <span className="ml-1 text-guitar-400 font-medium">
              {totalSlots} sélectionné{totalSlots > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>

      {lignes.map(({ jour, slots }) => {
        if (slots.length === 0) return null
        const selected = data.availabilities[jour] ?? []
        const hasSelected = selected.length > 0
        return (
          <div
            key={jour}
            className={`rounded-xl border transition-all ${
              hasSelected ? 'border-guitar-600/60 bg-guitar-600/5' : 'border-border-subtle bg-surface-raised'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className={`text-sm font-medium ${hasSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {jour}
              </span>
              {hasSelected && (
                <span className="text-xs text-guitar-400">{selected.length} créneau{selected.length > 1 ? 'x' : ''}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {slots.map((slot) => {
                const active = selected.includes(slot)
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(jour, slot)}
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

// ─── État initial du formulaire ───────────────────────────────────────────────

const defaultForm = {
  prenom: '', nom: '', email: '', telephone: '',
  birth_year: '',
  est_deja_eleve: null,
  instrument: '', niveau: '',
  annees_pratique: '',
  lecture_partition: null, lecture_tablature: null,
  solfege_rythmique: null, harmonie: null,
  experience_groupe: null, experience_groupe_duree: '',
  availabilities: {},
}

// ─── Validation par étape ─────────────────────────────────────────────────────

function validerEtape(stepId, form) {
  if (stepId === 'identite') return form.prenom.trim() && form.nom.trim() && form.est_deja_eleve !== null
  if (stepId === 'instrument') return form.instrument && form.niveau
  if (stepId === 'disponibilites') return Object.keys(form.availabilities).length > 0
  return true
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleSondagePage() {
  const { token } = useParams()
  const [status,       setStatus]       = useState('loading')
  const [tokenRow,     setTokenRow]     = useState(null)
  const [scheduleJours, setScheduleJours] = useState(null) // null = chargement, [] = libre
  const [stepIdx,      setStepIdx]      = useState(0)
  const [form,         setForm]         = useState(defaultForm)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  // Étapes dynamiques selon est_deja_eleve
  const stepIds = useMemo(() => getStepIds(form.est_deja_eleve), [form.est_deja_eleve])
  const currentStepId = stepIds[stepIdx] ?? 'identite'

  // ── Validation du token + chargement emploi du temps ─────────────────────────

  useEffect(() => {
    async function checkToken() {
      // Phase 1 : lecture du token — erreur ici = problème critique → statut 'error'
      let data
      try {
        // participant_id et expires_at exclus du SELECT : ces colonnes ont été
        // omises de la migration initiale et n'existent qu'après exécution de
        // migration-enrichissement-sondage-ensemble.sql.
        // - participant_id absent → traité comme null → "créer nouveau participant"
        // - expires_at absent → vérification d'expiration sautée (tokens sans expiry)
        const res = await supabase
          .from('ensemble_tokens')
          .select('id, teacher_id, token_type, used_at, label, school_id, school_name')
          .eq('token', token)
          .maybeSingle()
        if (res.error) throw res.error
        data = res.data
      } catch {
        setStatus('error')
        return
      }

      if (!data) return setStatus('invalid')
      if (data.used_at && data.token_type !== 'generique') return setStatus('used')
      // expires_at non présent dans le SELECT (colonne manquante pre-migration) :
      // la vérification d'expiration sera réactivée après ALTER TABLE.
      setTokenRow(data)
      setStatus('valid')

      // Phase 2 : chargement de l'emploi du temps — erreur non bloquante,
      // on bascule simplement sur les créneaux libres en fallback.
      if (data.school_name) {
        try {
          const { data: rows } = await supabase
            .from('school_schedules')
            .select('day, slots')
            .eq('school_name', data.school_name)
            .eq('school_year', CURRENT_YEAR)
          setScheduleJours(trierLignesSchedule(rows ?? []))
        } catch {
          // Échec de lecture des créneaux d'école → fallback créneaux libres
          setScheduleJours([])
        }
      } else {
        setScheduleJours([]) // pas d'école liée → créneaux libres
      }
    }
    checkToken()
  }, [token])

  // Réinitialiser stepIdx si les étapes changent (bascule élève ↔ externe)
  useEffect(() => {
    setStepIdx(0)
  }, [form.est_deja_eleve])

  // ── Soumission ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const participantId = crypto.randomUUID()
      let finalParticipantId = tokenRow.participant_id ?? null

      if (!finalParticipantId) {
        const isExternal = form.est_deja_eleve !== true
        const { error: pErr } = await supabase.from('ensemble_participants').insert({
          id:                      participantId,
          teacher_id:              tokenRow.teacher_id,
          prenom:                  form.prenom.trim(),
          nom:                     form.nom.trim(),
          email:                   form.email.trim() || null,
          telephone:               form.telephone.trim() || null,
          birth_year:              form.birth_year ? parseInt(form.birth_year, 10) : null,
          est_deja_eleve:          form.est_deja_eleve,
          // Champs instrument/compétences : seulement pour les participants externes
          instrument:              isExternal ? (form.instrument || null)    : null,
          niveau:                  isExternal ? (form.niveau || null)        : null,
          annees_pratique:         isExternal ? (form.annees_pratique ? parseInt(form.annees_pratique, 10) : null) : null,
          lecture_partition:       isExternal ? (form.lecture_partition ?? null)  : null,
          lecture_tablature:       isExternal ? (form.lecture_tablature ?? null)  : null,
          solfege_rythmique:       isExternal ? (form.solfege_rythmique ?? null)  : null,
          harmonie:                isExternal ? (form.harmonie ?? null)            : null,
          experience_groupe:       isExternal ? (form.experience_groupe ?? null)   : null,
          experience_groupe_duree: isExternal ? (form.experience_groupe_duree?.trim() || null) : null,
          est_eleve:               false,
        })
        if (pErr) throw pErr
        finalParticipantId = participantId
      }

      const { error: rErr } = await supabase.from('ensemble_responses').insert({
        teacher_id:     tokenRow.teacher_id,
        token_id:       tokenRow.id,
        participant_id: finalParticipantId,
        availabilities: form.availabilities,
        status:         'attente',
      })
      if (rErr) throw rErr

      // Marquer le token individuel utilisé
      if (tokenRow.token_type !== 'generique') {
        await supabase
          .from('ensemble_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('id', tokenRow.id)
      }

      setStatus('submitted')
    } catch (err) {
      setSubmitError(err.message || 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── États non-formulaire ──────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="w-8 h-8 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Vérification du lien…</p>
        </div>
      </Shell>
    )
  }

  if (['invalid', 'used', 'expired', 'error'].includes(status)) {
    const labels = {
      invalid: ['❌', 'Lien invalide',  'Ce lien ne correspond à aucune invitation.'],
      used:    ['✅', 'Déjà soumis',    'Ce lien a déjà été utilisé. Contactez votre professeur si besoin.'],
      expired: ['⏳', 'Lien expiré',    "Ce lien n'est plus valide."],
      error:   ['⚠️', 'Erreur',         'Une erreur est survenue. Réessayez dans quelques instants.'],
    }
    const [icon, title, msg] = labels[status]
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="text-4xl">{icon}</span>
          <h2 className="font-display text-2xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{msg}</p>
        </div>
      </Shell>
    )
  }

  if (status === 'submitted') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-5 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-guitar-600/15 border border-guitar-600/30 flex items-center justify-center">
            <Check className="w-8 h-8 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-display text-2xl mb-2">Merci !</h2>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              Vos disponibilités ont bien été enregistrées.
              Votre professeur vous contactera pour vous confirmer votre groupe de répétition.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Formulaire multi-étapes ───────────────────────────────────────────────

  const isLast = stepIdx === stepIds.length - 1
  const peutAvancer = validerEtape(currentStepId, form)

  const stepContent = {
    identite:       <StepIdentite       data={form} onChange={setForm} />,
    instrument:     <StepInstrument     data={form} onChange={setForm} />,
    disponibilites: <StepDisponibilites data={form} onChange={setForm} scheduleJours={scheduleJours} />,
  }

  return (
    <Shell label={tokenRow?.label}>
      {/* Barre de progression */}
      <div className="flex items-center gap-1.5 mb-8">
        {stepIds.map((sid, i) => (
          <div key={sid} className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => i < stepIdx && setStepIdx(i)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                i === stepIdx ? 'text-guitar-400'
                : i < stepIdx ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                : 'text-muted cursor-default'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] border transition-all ${
                i < stepIdx ? 'bg-guitar-600 border-guitar-600 text-white'
                : i === stepIdx ? 'border-guitar-600 text-guitar-400'
                : 'border-border text-muted'
              }`}>
                {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{STEP_LABELS[sid]}</span>
            </button>
            {i < stepIds.length - 1 && (
              <div className={`w-5 h-px flex-shrink-0 ${i < stepIdx ? 'bg-guitar-600/60' : 'bg-border-subtle'}`} />
            )}
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl mb-6">{STEP_LABELS[currentStepId]}</h2>

      <div className="min-h-[280px]">{stepContent[currentStepId]}</div>

      {submitError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border-subtle">
        <button
          type="button"
          onClick={() => setStepIdx((s) => s - 1)}
          disabled={stepIdx === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Précédent
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !peutAvancer}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl guitar-gradient text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-60"
          >
            {submitting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Check className="w-4 h-4" />Envoyer</>
            }
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIdx((s) => s + 1)}
            disabled={!peutAvancer}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl guitar-gradient text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Suivant
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </Shell>
  )
}

// ─── Mise en page ─────────────────────────────────────────────────────────────

function Shell({ children, label }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl guitar-gradient flex items-center justify-center flex-shrink-0">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display text-xl leading-tight">Répétitions d'ensemble</p>
            <p className="text-xs text-muted-foreground">
              {label ? label : 'Inscription — disponibilités'}
            </p>
          </div>
        </div>

        {/* Bandeau distinctif — clairement séparé du sondage cours individuel */}
        <div className="mb-5 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3">
          <p className="text-sm text-foreground font-medium mb-0.5">📣 Inscription aux répétitions d'ensemble</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ce formulaire concerne uniquement les <strong>jeux d'ensemble et la musique de groupe</strong>.
            Il est indépendant des cours de guitare individuels.
            Si vous cherchez à vous inscrire aux cours de guitare, utilisez le lien qui vous a été envoyé séparément.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}
