import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Music2, Check, ChevronRight, ChevronLeft, Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Jours de la semaine pour les disponibilités ensemble
// (pas de créneaux d'école fixes : on offre toute la plage horaire)
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Créneaux par tranches de 30 min de 9h à 22h (granularité adaptée aux répétitions)
function genererCreneauxEnsemble() {
  const slots = []
  for (let h = 9; h <= 21; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const endM = m + 30
      const endH = endM >= 60 ? h + 1 : h
      const endMm = String(endM >= 60 ? endM - 60 : endM).padStart(2, '0')
      const endHh = String(endH).padStart(2, '0')
      slots.push(`${hh}:${mm}–${endHh}:${endMm}`)
    }
  }
  return slots
}
const CRENEAUX = genererCreneauxEnsemble()

// Instruments courants en ensemble — liste plus large que pour les cours individuels
const INSTRUMENTS_ENSEMBLE = [
  'Guitare folk', 'Guitare électrique', 'Guitare classique', 'Basse',
  'Batterie', 'Clavier / Piano', 'Violon', 'Flûte', 'Saxophone',
  'Trompette', 'Voix', 'Autre',
]

// Niveaux indicatifs pour ensemble (pas de nomenclature CMF stricte)
const NIVEAUX_ENSEMBLE = [
  'Débutant (moins de 2 ans)', 'Intermédiaire (2–5 ans)', 'Confirmé (5–10 ans)', 'Avancé (10 ans et plus)',
]

const STEPS = [
  { id: 'identite',       label: 'Identité' },
  { id: 'instrument',     label: 'Instrument' },
  { id: 'disponibilites', label: 'Disponibilités' },
]

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

// ─── Étapes ───────────────────────────────────────────────────────────────────

function StepIdentite({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <Field label="Prénom" required>
        <input className={inputCls} value={data.prenom} onChange={set('prenom')} placeholder="Jean" />
      </Field>
      <Field label="Nom" required>
        <input className={inputCls} value={data.nom} onChange={set('nom')} placeholder="Dupont" />
      </Field>
      <Field label="Email">
        <input className={inputCls} type="email" value={data.email} onChange={set('email')} placeholder="jean@email.fr" />
      </Field>
      <Field label="Téléphone">
        <input className={inputCls} type="tel" value={data.telephone} onChange={set('telephone')} placeholder="06 00 00 00 00" />
      </Field>
    </div>
  )
}

function StepInstrument({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
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
    </div>
  )
}

/** Sélecteur de créneaux horaires — copie du pattern de SondagePage,
 *  recréé dans ce fichier pour ne créer aucune dépendance croisée. */
function StepDisponibilites({ data, onChange }) {
  const totalSlots = Object.values(data.availabilities).reduce((s, arr) => s + arr.length, 0)

  function toggleSlot(jour, slot) {
    const current = data.availabilities[jour] ?? []
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot]
    const updated = { ...data.availabilities }
    if (next.length === 0) delete updated[jour]
    else updated[jour] = next
    onChange({ ...data, availabilities: updated })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-guitar-600/5 border border-guitar-600/20 px-4 py-3">
        <p className="text-sm text-foreground font-medium mb-0.5">💡 Cochez tous vos créneaux disponibles</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Plus vous indiquez de disponibilités, plus il sera facile de composer des groupes
          compatibles. Ne vous limitez pas à votre créneau préféré.
          {totalSlots > 0 && <span className="ml-1 text-guitar-400 font-medium">{totalSlots} sélectionné{totalSlots > 1 ? 's' : ''}</span>}
        </p>
      </div>

      {JOURS.map((jour) => {
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
              {CRENEAUX.map((slot) => {
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
  instrument: '', niveau: '',
  availabilities: {},
}

// ─── Validation par étape ─────────────────────────────────────────────────────

function validerEtape(step, form) {
  if (step === 0) return form.prenom.trim() && form.nom.trim()
  if (step === 1) return form.instrument && form.niveau
  if (step === 2) return Object.keys(form.availabilities).length > 0
  return true
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleSondagePage() {
  const { token } = useParams()
  const [status,    setStatus]    = useState('loading')  // loading|valid|invalid|used|expired|submitted|error
  const [tokenRow,  setTokenRow]  = useState(null)
  const [step,      setStep]      = useState(0)
  const [form,      setForm]      = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Validation du token ────────────────────────────────────────────────────

  useEffect(() => {
    async function checkToken() {
      try {
        const { data, error } = await supabase
          .from('ensemble_tokens')
          .select('id, teacher_id, participant_id, token_type, used_at, expires_at, label')
          .eq('token', token)
          .maybeSingle()
        if (error) throw error
        if (!data) return setStatus('invalid')
        if (data.used_at && data.token_type !== 'generique') return setStatus('used')
        if (data.expires_at && new Date(data.expires_at) < new Date()) return setStatus('expired')
        setTokenRow(data)
        setStatus('valid')
      } catch {
        setStatus('error')
      }
    }
    checkToken()
  }, [token])

  // ── Soumission ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      // UUID généré côté client — les anonymes n'ont pas de policy SELECT sur
      // ensemble_participants, donc on évite RETURNING après INSERT.
      const participantId = crypto.randomUUID()

      // 1. Créer ou réutiliser le participant
      //    Si le token est individuel et lie déjà un participant (pré-rempli),
      //    on réutilise son id. Sinon on en crée un nouveau.
      let finalParticipantId = tokenRow.participant_id ?? null
      if (!finalParticipantId) {
        const { error: pErr } = await supabase.from('ensemble_participants').insert({
          id:         participantId,
          teacher_id: tokenRow.teacher_id,
          prenom:     form.prenom.trim(),
          nom:        form.nom.trim(),
          email:      form.email.trim() || null,
          telephone:  form.telephone.trim() || null,
          instrument: form.instrument || null,
          niveau:     form.niveau || null,
          est_eleve:  false,
        })
        if (pErr) throw pErr
        finalParticipantId = participantId
      }

      // 2. Créer la réponse
      const { error: rErr } = await supabase.from('ensemble_responses').insert({
        teacher_id:     tokenRow.teacher_id,
        token_id:       tokenRow.id,
        participant_id: finalParticipantId,
        availabilities: form.availabilities,
        status:         'attente',
      })
      if (rErr) throw rErr

      // 3. Marquer le token utilisé (individuel uniquement)
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
      expired: ['⏳', 'Lien expiré',    'Ce lien n\'est plus valide.'],
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

  const isLast = step === STEPS.length - 1
  const peutAvancer = validerEtape(step, form)

  const stepContent = [
    <StepIdentite       key="i" data={form} onChange={setForm} />,
    <StepInstrument     key="n" data={form} onChange={setForm} />,
    <StepDisponibilites key="d" data={form} onChange={setForm} />,
  ]

  return (
    <Shell label={tokenRow?.label}>
      {/* Barre de progression */}
      <div className="flex items-center gap-1.5 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                i === step ? 'text-guitar-400'
                : i < step ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                : 'text-muted cursor-default'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] border transition-all ${
                i < step ? 'bg-guitar-600 border-guitar-600 text-white'
                : i === step ? 'border-guitar-600 text-guitar-400'
                : 'border-border text-muted'
              }`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-5 h-px flex-shrink-0 ${i < step ? 'bg-guitar-600/60' : 'bg-border-subtle'}`} />
            )}
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl mb-6">{STEPS[step].label}</h2>

      <div className="min-h-[280px]">{stepContent[step]}</div>

      {submitError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border-subtle">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
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
            onClick={() => setStep((s) => s + 1)}
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

        {/* Bandeau de contexte — distingue clairement ce formulaire du sondage cours */}
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
