import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Guitar, ChevronRight, ChevronLeft, Check, Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'
import { REGLE_PAR_DUREE } from '../utils/slotDurationRules'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Nomenclature CMF (Confédération Musicale de France) — cycles officiels guitare
const NIVEAUX = [
  'Éveil',
  'Initiation',
  'Cycle 1 — 1re année',  'Cycle 1 — 2e année',  'Cycle 1 — 3e année',
  'Cycle 2 — 1re année',  'Cycle 2 — 2e année',  'Cycle 2 — 3e année',
  'Cycle 3 — 1re année',  'Cycle 3 — 2e année',  'Cycle 3 — 3e année',
  'COP',
  'DEM',
  'Adulte loisir',
  'Autre / pas de cycle fédéral',
]
const TRANSPORTS = ['À pied', 'Vélo', 'Voiture', 'Transport en commun']
const FREQUENCES = ['1x/semaine', '2x/semaine', 'Toutes les 2 semaines']
const INSTRUMENTS = ['Guitare folk', 'Guitare électrique', 'Guitare classique', 'Basse', 'Autre']
const USAGES_TUTEUR = ['Organisation', 'Documents pédagogiques', 'Les deux']
// Rôle du tuteur vis-à-vis de l'élève — "Autre" déclenche un champ texte libre
const ROLES_TUTEUR = ['Père', 'Mère', 'Autre']
const CURRENT_YEAR = '2026-2027'

// Convertit "H:MM" ou "HH:MM" en minutes depuis minuit pour un tri numérique fiable.
// Comparaison lexicographique sur des chaînes serait incorrecte si l'heure n'est pas
// paddée ("9:00" < "17:00" échouerait en tri alphabétique : "9" > "1").
function slotStartMinutes(slot) {
  const [h, m] = slot.split('–')[0].split(':').map(Number)
  return h * 60 + (m || 0)
}

// Trie un tableau de créneaux "HH:MM–HH:MM" par heure de début croissante.
// Pur et sans mutation : renvoie un nouveau tableau.
function trierSlots(slots) {
  return [...(slots ?? [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b))
}

// Applique trierSlots sur le champ slots de chaque ligne school_schedule.
function trierLignesSchedule(rows) {
  return (rows ?? []).map(row => ({ ...row, slots: trierSlots(row.slots) }))
}

function generateAllSlots() {
  const slots = []
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const endM = m + 15
      const endH = endM >= 60 ? h + 1 : h
      const endMm = String(endM >= 60 ? endM - 60 : endM).padStart(2, '0')
      const endHh = String(endH).padStart(2, '0')
      slots.push(`${hh}:${mm}–${endHh}:${endMm}`)
    }
  }
  return slots
}
const CESU_SLOTS = generateAllSlots()
const CESU_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const STEPS = [
  { id: 'identite',       label: 'Identité' },
  { id: 'niveau',         label: 'Niveau' },
  { id: 'tuteurs',        label: 'Tuteurs' },
  { id: 'disponibilites', label: 'Disponibilités' },
  { id: 'logistique',     label: 'Pratique' },
  { id: 'attentes',       label: 'Attentes' },
  { id: 'inscriptions',   label: 'Inscriptions' },
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

const selectCls =
  'w-full px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle focus:border-guitar-600 focus:ring-1 focus:ring-guitar-600/50 outline-none transition-all text-sm appearance-none'

// ─── Étapes ──────────────────────────────────────────────────────────────────

function StepIdentite({ data, onChange, schools }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  const setSchool = (e) => {
    // Réinitialise les disponibilités quand l'école change
    onChange({ ...data, school_name: e.target.value, availabilities: {} })
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <Field label="Prénom" required>
        <input className={inputCls} value={data.first_name} onChange={set('first_name')} placeholder="Jean" />
      </Field>
      <Field label="Nom" required>
        <input className={inputCls} value={data.last_name} onChange={set('last_name')} placeholder="Dupont" />
      </Field>
      <Field label="Année de naissance" required>
        <input className={inputCls} type="number" min="1930" max="2025"
          value={data.birth_year} onChange={set('birth_year')} placeholder="2005" />
      </Field>
      <Field label="Email">
        <input className={inputCls} type="email" value={data.email} onChange={set('email')} placeholder="jean@email.fr" />
      </Field>
      <Field label="Téléphone">
        <input className={inputCls} type="tel" value={data.phone} onChange={set('phone')} placeholder="06 00 00 00 00" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="École">
          <select className={selectCls} value={data.school_name} onChange={setSchool}>
            <option value="">Choisir une école…</option>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="CESU">CESU / Cours privé</option>
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Type d'inscription" required>
          <div className="flex gap-3">
            {[
              { value: 'reinscription', label: 'Je me réinscris' },
              { value: 'nouvelle',      label: 'Nouvelle inscription' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ ...data, registration_type: value })}
                className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                  data.registration_type === value
                    ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  )
}

function StepNiveau({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  const isAutre = data.level === 'Autre / pas de cycle fédéral'
  return (
    <div className="space-y-5">
      <Field label="Années de pratique" required>
        <input className={inputCls} type="number" min="0" max="99"
          value={data.practice_years} onChange={set('practice_years')} placeholder="3" />
      </Field>
      <Field label="Niveau actuel (nomenclature CMF)" required>
        <select className={selectCls} value={data.level} onChange={set('level')}>
          <option value="">Choisir un niveau…</option>
          {NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      {isAutre && (
        <Field label="Précisez votre niveau">
          <input
            className={inputCls}
            value={data.diplomas}
            onChange={set('diplomas')}
            placeholder="Ex : autodidacte, formation en ligne, 5 ans de pratique…"
          />
        </Field>
      )}
      {!isAutre && (
        <Field label="Diplômes obtenus (optionnel)">
          <textarea
            className={inputCls + ' resize-none'}
            rows={3}
            value={data.diplomas}
            onChange={set('diplomas')}
            placeholder="Ex : DEM guitare, CFEM…"
          />
        </Field>
      )}
    </div>
  )
}

function StepTuteurs({ data, onChange }) {
  const addTuteur = () => {
    if (data.tuteurs.length >= 2) return
    onChange({ ...data, tuteurs: [...data.tuteurs, defaultTuteur()] })
  }
  const removeTuteur = (i) =>
    onChange({ ...data, tuteurs: data.tuteurs.filter((_, idx) => idx !== i) })
  const setField = (i, k) => (e) => {
    const updated = data.tuteurs.map((t, idx) => idx === i ? { ...t, [k]: e.target.value } : t)
    onChange({ ...data, tuteurs: updated })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Ajoutez jusqu&apos;à 2 contacts tuteurs (parent, responsable légal, etc.).
      </p>
      {data.tuteurs.map((t, i) => (
        <div key={i} className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Tuteur {i + 1}</span>
            <button type="button" onClick={() => removeTuteur(i)}
              className="p-1.5 rounded-lg hover:bg-guitar-600/10 text-muted hover:text-guitar-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Prénom" required>
              <input className={inputCls} value={t.prenom} onChange={setField(i, 'prenom')} placeholder="Marie" />
            </Field>
            <Field label="Nom" required>
              <input className={inputCls} value={t.nom} onChange={setField(i, 'nom')} placeholder="Dupont" />
            </Field>
            <Field label="Rôle" required>
              <select className={selectCls} value={t.role} onChange={setField(i, 'role')}>
                <option value="">Choisir…</option>
                {ROLES_TUTEUR.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            {t.role === 'Autre' && (
              <Field label="Précisez le rôle" required>
                <input className={inputCls} value={t.role_precision} onChange={setField(i, 'role_precision')}
                  placeholder="Ex : Grand-parent, tuteur légal…" />
              </Field>
            )}
            <Field label="Téléphone">
              <input className={inputCls} type="tel" value={t.phone} onChange={setField(i, 'phone')} placeholder="06 00 00 00 00" />
            </Field>
            <Field label="Email">
              <input className={inputCls} type="email" value={t.email} onChange={setField(i, 'email')} placeholder="marie@email.fr" />
            </Field>
            <Field label="Usage du contact" required>
              <select className={selectCls} value={t.purpose} onChange={setField(i, 'purpose')}>
                <option value="">Choisir…</option>
                {USAGES_TUTEUR.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </div>
      ))}
      {data.tuteurs.length < 2 && (
        <button type="button" onClick={addTuteur}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-guitar-600/60 hover:bg-guitar-600/5 text-muted-foreground hover:text-guitar-400 transition-all text-sm">
          <Plus className="w-4 h-4" />
          Ajouter un tuteur
        </button>
      )}
    </div>
  )
}

// schoolSchedules : [{ day: string, slots: string[] }]
// availabilities format : { "Lundi": ["09:00–09:15", ...], ... }
function StepDisponibilites({ data, onChange, schoolSchedules, loadingSchedules }) {
  const isCesu = data.school_name === 'CESU'
  const noSchool = !data.school_name

  // Construire la liste jour→créneaux disponibles
  const jourSlots = isCesu
    ? CESU_JOURS.map(day => ({ day, slots: CESU_SLOTS }))
    : schoolSchedules

  const toggleSlot = (jour, slot) => {
    const current = data.availabilities[jour] ?? []
    const next = current.includes(slot)
      ? current.filter(s => s !== slot)
      : [...current, slot]
    const updated = { ...data.availabilities }
    if (next.length === 0) delete updated[jour]
    else updated[jour] = next
    onChange({ ...data, availabilities: updated })
  }

  if (noSchool) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Veuillez d&apos;abord choisir une école à l&apos;étape <strong>Identité</strong>.
        </p>
      </div>
    )
  }

  if (loadingSchedules) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Chargement des créneaux…</span>
      </div>
    )
  }

  if (jourSlots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Aucun créneau configuré pour cette école. Contactez votre professeur.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-guitar-600/5 border border-guitar-600/20 px-4 py-3">
        <p className="text-sm text-foreground font-medium mb-0.5">💡 Cochez plusieurs créneaux</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Plus vous cochez de créneaux disponibles, plus il sera facile de trouver un horaire
          adapté. Ne vous limitez pas à un seul — sélectionnez tous les moments où vous êtes libre.
        </p>
      </div>
      {jourSlots.map(({ day, slots }) => {
        const selected = data.availabilities[day] ?? []
        const hasSelected = selected.length > 0
        return (
          <div key={day} className={`rounded-xl border transition-all ${
            hasSelected ? 'border-guitar-600/60 bg-guitar-600/5' : 'border-border-subtle bg-surface-raised'
          }`}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className={`text-sm font-medium ${hasSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {day}
              </span>
              {hasSelected && (
                <span className="text-xs text-guitar-400">{selected.length} créneau{selected.length > 1 ? 'x' : ''}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {slots.map(slot => {
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

function StepLogistique({ data, onChange, availableDurations, isCesu }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value })
  // Durées à afficher : si CESU ou pas d'école, on affiche [30, 60] par défaut
  const durations = availableDurations?.length ? availableDurations : (isCesu ? [60] : [30])
  const showDurationPicker = !isCesu && durations.length > 1
  return (
    <div className="space-y-5">
      <Field label="Adresse">
        <input className={inputCls} value={data.address} onChange={set('address')}
          placeholder="Ex : 12 rue des Lilas, 59000 Lille" />
      </Field>
      <Field label="Instrument">
        <select className={selectCls} value={data.instrument} onChange={set('instrument')}>
          <option value="">Choisir…</option>
          {INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      {showDurationPicker && (
        <Field label="Durée de cours souhaitée">
          <div className="flex flex-col gap-2">
            {durations.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => onChange({ ...data, desired_duration_minutes: min })}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${
                  data.desired_duration_minutes === min
                    ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                }`}
              >
                <span className="font-semibold">{min} min</span>
                {REGLE_PAR_DUREE[min] && (
                  <span className="ml-2 text-xs opacity-70">{REGLE_PAR_DUREE[min]}</span>
                )}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Ouvert aux cours collectifs ?">
        <div className="flex gap-3">
          {[true, false].map((v) => (
            <button key={String(v)} type="button"
              onClick={() => onChange({ ...data, open_to_group: v })}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                data.open_to_group === v
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
              }`}>
              {v ? 'Oui' : 'Non'}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

function StepAttentes({ data, onChange }) {
  return (
    <div className="space-y-5">
      <Field label="Vos attentes et objectifs">
        <textarea
          className={inputCls + ' resize-none'}
          rows={6}
          value={data.expectations}
          onChange={(e) => onChange({ ...data, expectations: e.target.value })}
          placeholder="Décrivez vos objectifs musicaux, ce que vous espérez apprendre, vos envies particulières…"
        />
      </Field>
      <div className="rounded-xl bg-surface-overlay border border-border-subtle px-4 py-3">
        <p className="text-sm text-muted-foreground leading-relaxed italic">
          Je donne cours à plus de 60 élèves, je m&apos;adapte au maximum mais une base pédagogique
          commune s&apos;applique à tous.
        </p>
      </div>
    </div>
  )
}

// suppSchedules : { [index]: [{ day, slots }] } — créneaux par personne supplémentaire
// onSuppSchoolChange(i, schoolName) — déclenche le chargement des créneaux pour la personne i
function StepInscriptions({ data, onChange, schools, suppSchedules, suppLoading, onSuppSchoolChange }) {
  const inscrits = data.inscriptions_supplementaires ?? []

  const add = () => onChange({
    ...data,
    inscriptions_supplementaires: [...inscrits, defaultPersonSupp()],
  })

  const remove = (i) => onChange({
    ...data,
    inscriptions_supplementaires: inscrits.filter((_, idx) => idx !== i),
  })

  // Mise à jour d'un champ simple pour la personne i
  const setField = (i, k, value) => {
    const updated = inscrits.map((p, idx) => idx === i ? { ...p, [k]: value } : p)
    onChange({ ...data, inscriptions_supplementaires: updated })
  }

  // Changement d'école : réinitialise les créneaux ET déclenche le chargement
  const handleSchoolChange = (i, schoolName) => {
    const updated = inscrits.map((p, idx) =>
      idx === i ? { ...p, school_name: schoolName, availabilities: {} } : p
    )
    onChange({ ...data, inscriptions_supplementaires: updated })
    onSuppSchoolChange(i, schoolName)
  }

  // Toggle d'un créneau de disponibilité pour la personne i
  const toggleSlot = (i, jour, slot) => {
    const p = inscrits[i]
    const current = (p.availabilities ?? {})[jour] ?? []
    const next = current.includes(slot) ? current.filter(s => s !== slot) : [...current, slot]
    const newAvail = { ...(p.availabilities ?? {}) }
    if (next.length === 0) delete newAvail[jour]
    else newAvail[jour] = next
    setField(i, 'availabilities', newAvail)
  }

  return (
    <div className="space-y-6">
      {/* Récapitulatif du répondant principal */}
      <div className="rounded-xl border border-guitar-600/30 bg-guitar-600/5 px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-guitar-600/20 border border-guitar-600/40 flex items-center justify-center">
          <Check className="w-3 h-3 text-guitar-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {data.first_name || '—'} {data.last_name || ''}
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
              Répondant principal
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.school_name || 'École non précisée'}
            {data.email && <> · {data.email}</>}
          </p>
        </div>
      </div>

      {/* Avertissement non-inscription officielle */}
      <div className="rounded-xl bg-surface-overlay border border-border-subtle px-4 py-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Ce formulaire n&apos;est pas une inscription officielle.</strong>{' '}
          Votre professeur vous enverra une confirmation par email après avoir pris connaissance de votre sondage.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Souhaitez-vous inscrire d&apos;autres personnes en même temps ? Chaque personne suit son propre
        parcours complet : identité, structure de cours et créneaux disponibles.
      </p>

      {inscrits.map((p, i) => {
        const isCesu = p.school_name === 'CESU'
        // Créneaux à afficher selon l'école choisie
        const jourSlots = isCesu
          ? CESU_JOURS.map(day => ({ day, slots: CESU_SLOTS }))
          : (suppSchedules[i] ?? [])
        const loading = suppLoading[i] ?? false
        const totalCreneaux = Object.values(p.availabilities ?? {}).reduce((s, arr) => s + arr.length, 0)

        return (
          <div key={i} className="glass-panel rounded-2xl p-5 space-y-5">
            {/* En-tête */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Personne {i + 1}
                {(p.prenom || p.nom) && (
                  <span className="ml-2 font-normal text-muted-foreground">— {p.prenom} {p.nom}</span>
                )}
              </span>
              <button type="button" onClick={() => remove(i)}
                className="p-1.5 rounded-lg hover:bg-guitar-600/10 text-muted hover:text-guitar-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* ── SECTION 1 : Identité ── */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Identité</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Prénom" required>
                  <input className={inputCls} value={p.prenom}
                    onChange={(e) => setField(i, 'prenom', e.target.value)}
                    placeholder="Prénom" />
                </Field>
                <Field label="Nom" required>
                  <input className={inputCls} value={p.nom}
                    onChange={(e) => setField(i, 'nom', e.target.value)}
                    placeholder="Nom" />
                </Field>
                <Field label="Année de naissance">
                  <input className={inputCls} type="number" min="1930" max="2025"
                    value={p.birth_year}
                    onChange={(e) => setField(i, 'birth_year', e.target.value)}
                    placeholder="2010" />
                </Field>
                <Field label="Email">
                  <input className={inputCls} type="email" value={p.email}
                    onChange={(e) => setField(i, 'email', e.target.value)}
                    placeholder="email@exemple.fr" />
                </Field>
                <Field label="Téléphone">
                  <input className={inputCls} type="tel" value={p.phone}
                    onChange={(e) => setField(i, 'phone', e.target.value)}
                    placeholder="06 00 00 00 00" />
                </Field>
                <Field label="Type d'inscription">
                  <div className="flex gap-2">
                    {[
                      { value: 'nouvelle',      label: 'Nouvelle' },
                      { value: 'reinscription', label: 'Réinscription' },
                    ].map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => setField(i, 'registration_type', value)}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                          p.registration_type === value
                            ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                            : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                {/* Instrument — même liste que le répondant principal */}
                <Field label="Instrument">
                  <select className={selectCls} value={p.instrument}
                    onChange={(e) => setField(i, 'instrument', e.target.value)}>
                    <option value="">Choisir…</option>
                    {INSTRUMENTS.map((inst) => <option key={inst} value={inst}>{inst}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* ── SECTION 2 : Structure de cours ── */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Structure de cours</p>
              <div className="space-y-3">
                <Field label="Type de cours" required>
                  <div className="flex gap-3">
                    {[
                      { value: 'ecole', label: 'École de musique' },
                      { value: 'CESU',  label: 'Cours particulier (CESU)' },
                    ].map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => handleSchoolChange(i, value === 'ecole' ? '' : 'CESU')}
                        className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                          (value === 'CESU' && p.school_name === 'CESU') ||
                          (value === 'ecole' && p.school_name !== 'CESU' && p.school_name !== '')
                            ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                            : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                {p.school_name !== 'CESU' && (
                  <Field label="École">
                    <select className={selectCls} value={p.school_name}
                      onChange={(e) => handleSchoolChange(i, e.target.value)}>
                      <option value="">Choisir une école…</option>
                      {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </div>

            {/* ── SECTION 3 : Disponibilités ── */}
            {p.school_name && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  Disponibilités
                  {totalCreneaux > 0 && (
                    <span className="ml-2 normal-case font-normal text-guitar-400">
                      {totalCreneaux} créneau{totalCreneaux > 1 ? 'x' : ''} sélectionné{totalCreneaux > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                {loading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
                    Chargement…
                  </div>
                ) : jourSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">
                    Aucun créneau configuré pour cette école.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {jourSlots.map(({ day, slots }) => {
                      const selected = (p.availabilities ?? {})[day] ?? []
                      const hasSelected = selected.length > 0
                      return (
                        <div key={day} className={`rounded-xl border transition-all ${
                          hasSelected ? 'border-guitar-600/60 bg-guitar-600/5' : 'border-border-subtle bg-surface-raised'
                        }`}>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className={`text-sm font-medium ${hasSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {day}
                            </span>
                            {hasSelected && (
                              <span className="text-xs text-guitar-400">{selected.length} créneau{selected.length > 1 ? 'x' : ''}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                            {slots.map(slot => {
                              const active = selected.includes(slot)
                              return (
                                <button key={slot} type="button"
                                  onClick={() => toggleSlot(i, day, slot)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all ${
                                    active
                                      ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                                      : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
                                  }`}>
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
                )}
              </div>
            )}
          </div>
        )
      })}

      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-guitar-600/60 hover:bg-guitar-600/5 text-muted-foreground hover:text-guitar-400 transition-all text-sm">
        <Plus className="w-4 h-4" />
        Ajouter une autre personne à inscrire
      </button>
    </div>
  )
}

// ─── État initial ─────────────────────────────────────────────────────────────

// Structure interne d'un tuteur — guardian1_role/guardian2_role nécessitent la migration SQL
const defaultTuteur = () => ({ prenom: '', nom: '', role: '', role_precision: '', phone: '', email: '', purpose: '' })

// Structure d'une personne supplémentaire — suit le même parcours que le répondant principal
// (identité, école/CESU, créneaux disponibles). Nécessite la migration SQL bloc T1b.
const defaultPersonSupp = () => ({
  prenom: '', nom: '', birth_year: '', email: '', phone: '',
  // instrument : ajouté pour stocker le choix d'instrument de la personne supplémentaire
  // (même liste que le répondant principal — nécessite la colonne sur survey_registrations)
  instrument: '',
  school_name: '', registration_type: 'nouvelle', availabilities: {},
})

const defaultForm = {
  first_name: '', last_name: '', birth_year: '', email: '', phone: '',
  school_name: '', registration_type: '',
  practice_years: '', level: '', diplomas: '',
  tuteurs: [],
  availabilities: {},
  address: '', instrument: '', open_to_group: false,
  desired_duration_minutes: null,
  expectations: '',
  inscriptions_supplementaires: [],
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SondagePage() {
  const { token } = useParams()
  const [status, setStatus] = useState('loading')
  const [tokenRow, setTokenRow] = useState(null)
  const [debug, setDebug] = useState(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Écoles et créneaux du répondant principal
  const [schools, setSchools] = useState([])
  const [schoolSchedules, setSchoolSchedules] = useState([])   // [{ day, slots }]
  const [schoolDurations, setSchoolDurations] = useState([])   // integer[] — durées proposées
  const [loadingSchedules, setLoadingSchedules] = useState(false)

  // Créneaux des personnes supplémentaires : indexés par position dans le tableau
  const [suppSchedules, setSuppSchedules] = useState({})  // { [i]: [{ day, slots }] }
  const [suppLoading,   setSuppLoading]   = useState({})  // { [i]: bool }

  // ── Chargement du token ───────────────────────────────────────────────────

  useEffect(() => {
    async function checkToken() {
      const dbg = { token }
      try {
        const { data, error } = await supabase
          .from('survey_tokens')
          .select('id, student_id, expires_at, used_at, token_type')
          .eq('token', token)
          .maybeSingle()
        dbg.data = data
        dbg.error = error
        setDebug(dbg)
        if (error) throw error
        if (!data) return setStatus('invalid')
        // Les liens génériques sont réutilisables (partagés dans un groupe)
        if (data.used_at && data.token_type !== 'generique') return setStatus('used')
        if (new Date(data.expires_at) < new Date()) return setStatus('expired')
        setTokenRow(data)
        setStatus('valid')
      } catch (e) {
        dbg.caught = e?.message ?? String(e)
        setDebug(dbg)
        setStatus('error')
      }
    }
    checkToken()
  }, [token])

  // ── Chargement des écoles ─────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'valid') return
    supabase
      .from('school_schedules')
      .select('school_name')
      .eq('school_year', CURRENT_YEAR)
      .then(({ data }) => {
        const distinct = [...new Set((data ?? []).map(r => r.school_name).filter(Boolean))].sort()
        setSchools(distinct)
      })
  }, [status])

  // ── Chargement des créneaux quand l'école change ──────────────────────────

  useEffect(() => {
    const school = form.school_name
    if (!school || school === 'CESU') {
      setSchoolSchedules([])
      return
    }
    setLoadingSchedules(true)
    supabase
      .from('school_schedules')
      .select('day, slots, available_slot_durations')
      .eq('school_name', school)
      .eq('school_year', CURRENT_YEAR)
      .then(({ data }) => {
        // Tri chronologique à la réception : la DB renvoie les slots dans l'ordre
        // d'insertion, potentiellement incohérent si des créneaux ont été ajoutés
        // en plusieurs fois ou par fusion de lignes.
        setSchoolSchedules(trierLignesSchedule(data))
        // Toutes les lignes partagent la même valeur — on prend la première non-vide
        const durations = (data ?? []).find((r) => r.available_slot_durations?.length)?.available_slot_durations ?? [30]
        setSchoolDurations(durations)
        // Auto-sélection si une seule durée disponible
        if (durations.length === 1) {
          setForm((prev) => ({ ...prev, desired_duration_minutes: durations[0] }))
        }
        setLoadingSchedules(false)
      })
  }, [form.school_name])

  // ── Chargement des créneaux pour une personne supplémentaire ─────────────
  // Appelé par StepInscriptions quand l'école d'une personne change.
  // 'CESU' et '' : pas de chargement Supabase (créneaux constants ou vides).

  const loadSuppSchedule = async (i, schoolName) => {
    if (!schoolName || schoolName === 'CESU') {
      setSuppSchedules(prev => { const n = { ...prev }; delete n[i]; return n })
      return
    }
    setSuppLoading(prev => ({ ...prev, [i]: true }))
    const { data } = await supabase
      .from('school_schedules')
      .select('day, slots')
      .eq('school_name', schoolName)
      .eq('school_year', CURRENT_YEAR)
    setSuppSchedules(prev => ({ ...prev, [i]: trierLignesSchedule(data) }))
    setSuppLoading(prev => ({ ...prev, [i]: false }))
  }

  // ── Soumission ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const t1 = form.tuteurs[0] ?? {}
      const t2 = form.tuteurs[1] ?? {}
      // UUID généré côté client pour éviter RETURNING après l'INSERT :
      // les visiteurs anonymes n'ont pas de policy SELECT sur survey_responses,
      // donc .select('id') déclencherait une erreur RLS via Prefer:return=representation.
      const responseId = crypto.randomUUID()
      const payload = {
        id: responseId,
        token_id: tokenRow.id,
        student_id: tokenRow.student_id,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        birth_year: form.birth_year ? parseInt(form.birth_year) : null,
        email: form.email || null,
        phone: form.phone || null,
        school_name: form.school_name || null,
        registration_type: form.registration_type || 'nouvelle',
        // Toujours 'attente' : même une réinscription doit passer par le Planning
        // intelligent pour se voir attribuer un créneau. 'confirme' ne doit être écrit
        // que par l'action explicite de l'utilisateur (Planning intelligent → Acter,
        // ou bouton Confirmer sur la fiche). Écrire 'confirme' ici excluait les
        // réinscriptions du Planning intelligent et affichait un badge "Créneau attribué"
        // trompeur sans qu'aucun créneau n'ait jamais été choisi.
        status: 'attente',
        practice_years: form.practice_years ? parseInt(form.practice_years) : null,
        level: form.level || null,
        diplomas: form.diplomas || null,
        guardian1_name: [t1.prenom, t1.nom].filter(Boolean).join(' ') || null,
        guardian1_phone: t1.phone || null,
        guardian1_email: t1.email || null,
        guardian1_contact_purpose: t1.purpose || null,
        guardian1_role: t1.role || null,
        guardian1_role_precision: t1.role === 'Autre' ? (t1.role_precision || null) : null,
        guardian2_name: [t2.prenom, t2.nom].filter(Boolean).join(' ') || null,
        guardian2_phone: t2.phone || null,
        guardian2_email: t2.email || null,
        guardian2_contact_purpose: t2.purpose || null,
        guardian2_role: t2.role || null,
        guardian2_role_precision: t2.role === 'Autre' ? (t2.role_precision || null) : null,
        availabilities: form.availabilities,
        address: form.address || null,
        instrument: form.instrument || null,
        // ?? false : filet de sécurité si une session navigateur a l'ancienne valeur null
        open_to_group: form.open_to_group ?? false,
        desired_duration_minutes: form.desired_duration_minutes ?? null,
        expectations: form.expectations || null,
      }
      const { error: insertError } = await supabase
        .from('survey_responses')
        .insert(payload)
      if (insertError) throw insertError

      // ── Inscriptions individuelles ────────────────────────────────────────
      // Répondant principal (is_respondent = true) + personnes supplémentaires
      const regsToInsert = [
        {
          token_id: tokenRow.id,
          response_id: responseId,
          is_respondent: true,
          prenom: form.first_name || null,
          nom: form.last_name || null,
          email: form.email || null,
          telephone: form.phone || null,
          // instrument du répondant principal — copié depuis survey_responses pour
          // permettre la fusion via survey_registrations sans re-requêter survey_responses
          instrument: form.instrument || null,
          choix_structure: form.school_name === 'CESU' ? 'cesu' : (form.school_name ? 'ecole' : null),
          school_name: form.school_name && form.school_name !== 'CESU' ? form.school_name : null,
          school_id: null,
        },
        ...(form.inscriptions_supplementaires ?? []).map((p) => ({
          token_id: tokenRow.id,
          response_id: responseId,
          is_respondent: false,
          prenom: p.prenom || null,
          nom: p.nom || null,
          email: p.email || null,
          telephone: p.phone || null,
          birth_year: p.birth_year ? parseInt(p.birth_year, 10) : null,
          registration_type: p.registration_type || 'nouvelle',
          // instrument de la personne supplémentaire — nécessite la colonne
          // sur survey_registrations (migration bloc T1)
          instrument: p.instrument || null,
          choix_structure: p.school_name === 'CESU' ? 'cesu' : (p.school_name ? 'ecole' : null),
          school_name: p.school_name && p.school_name !== 'CESU' ? p.school_name : null,
          school_id: null,
          // availabilities : JSONB — nécessite la migration SQL bloc T1b sur survey_registrations
          availabilities: Object.keys(p.availabilities ?? {}).length > 0 ? p.availabilities : null,
        })),
      ]
      const { error: regError } = await supabase.from('survey_registrations').insert(regsToInsert)
      if (regError) throw regError

      // Les tokens génériques ne sont pas marqués "utilisés" — ils restent actifs
      if (tokenRow.token_type !== 'generique') {
        const { error: updateError } = await supabase
          .from('survey_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('id', tokenRow.id)
        if (updateError) throw updateError
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

  if (status === 'invalid' || status === 'expired' || status === 'used' || status === 'error') {
    const labels = {
      invalid: ['❌', 'Lien invalide'],
      expired: ['⏳', 'Lien expiré'],
      used:    ['✅', 'Déjà répondu'],
      error:   ['⚠️', 'Erreur'],
    }
    const [icon, title] = labels[status]
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="text-4xl">{icon}</span>
          <h2 className="font-display text-2xl">{title}</h2>
          {debug && (
            <pre className="w-full text-left text-xs bg-surface border border-border rounded-xl p-4 overflow-auto text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}
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
              Votre sondage a bien été enregistré. Votre professeur en prendra connaissance prochainement.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Formulaire multi-étapes ───────────────────────────────────────────────

  const isLast = step === STEPS.length - 1
  const stepContent = [
    <StepIdentite       key="i" data={form} onChange={setForm} schools={schools} />,
    <StepNiveau         key="n" data={form} onChange={setForm} />,
    <StepTuteurs        key="t" data={form} onChange={setForm} />,
    <StepDisponibilites key="d" data={form} onChange={setForm}
      schoolSchedules={schoolSchedules} loadingSchedules={loadingSchedules} />,
    <StepLogistique     key="l" data={form} onChange={setForm}
      availableDurations={schoolDurations} isCesu={form.school_name === 'CESU'} />,
    <StepAttentes       key="a" data={form} onChange={setForm} />,
    <StepInscriptions   key="r" data={form} onChange={setForm} schools={schools}
      suppSchedules={suppSchedules} suppLoading={suppLoading} onSuppSchoolChange={loadSuppSchedule} />,
  ]

  return (
    <Shell>
      {/* Barre de progression */}
      <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-1">
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

      {/* Titre */}
      <h2 className="font-display text-2xl mb-6">{STEPS[step].label}</h2>

      {/* Contenu */}
      <div className="min-h-[300px]">{stepContent[step]}</div>

      {/* Erreur soumission */}
      {submitError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      {/* Navigation */}
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
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl guitar-gradient text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><Check className="w-4 h-4" />Envoyer</>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl guitar-gradient text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25"
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

function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl guitar-gradient flex items-center justify-center flex-shrink-0">
            <Guitar className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display text-xl leading-tight">Cours de guitare</p>
            <p className="text-xs text-muted-foreground">Fiche d&apos;inscription</p>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}
