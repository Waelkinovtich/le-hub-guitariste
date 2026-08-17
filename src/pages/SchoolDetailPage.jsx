import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Check, X, Loader2, AlertTriangle, Users, Calendar,
  Star, Plus, Trash2, MapPin, ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  fetchSchoolProfile, updateSchoolProfile,
  fetchHourlyRates, upsertHourlyRate,
  currentSchoolYear, computePriorityScore, computeScoreBreakdown, isScoreIncomplete,
  calculerRendementHoraireNetReel, calculerTauxNetEffectif, isSalaryFixed,
} from '../services/schools'
import {
  fetchStudentsPaidBySchool, fetchStudentsAttachedToSchool,
  fetchTeacherStudents, addStudentContext,
} from '../services/students'
import AddStudentModal from '../components/AddStudentModal'
import HelpTooltip from '../components/HelpTooltip'
import PhoneActions from '../components/PhoneActions'
import EmailActions from '../components/EmailActions'

// Libellés courts des 5 catégories du score pondéré, pour l'affichage du détail
// (voir computeScoreBreakdown dans services/schools.js).
const SCORE_CATEGORY_LABELS = {
  fiabilite:    'Fiabilité des heures',
  remuneration: 'Rémunération réelle',
  distance:     'Distance/trajet',
  perspectives: 'Perspectives & stabilité',
  ambiance:     'Ambiance humaine',
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STRUCTURE_TYPES = [
  { value: 'association',      label: 'Association' },
  { value: 'municipale',       label: 'École municipale' },
  { value: 'conservatoire',    label: 'Conservatoire' },
  { value: 'privee',           label: 'École privée' },
  { value: 'particulier_cesu', label: 'Particulier (CESU)' },
  { value: 'autre',            label: 'Autre' },
]
const STRUCTURE_LABELS = Object.fromEntries(STRUCTURE_TYPES.map((t) => [t.value, t.label]))

const CONTRACT_TYPES = [
  { value: 'CDI',   label: 'CDI' },
  { value: 'CDD',   label: 'CDD' },
  { value: 'Autre', label: 'Autre' },
]
// Note : la valeur "Vacation" peut encore exister en base pour des écoles anciennement enregistrées.
// Elle reste affichée en lecture seule mais n'est plus proposée à la saisie.

const PAYMENT_DURATION_OPTIONS = [
  { value: '10 mois (hors vacances scolaires)', label: '10 mois (hors vacances scolaires)' },
  { value: '12 mois (toute l\'année)',           label: "12 mois (toute l'année)" },
]

const PAYMENT_SMOOTHING_OPTIONS = [
  { value: 'Non lissé (varie selon les heures travaillées)', label: 'Variable selon les heures travaillées' },
  { value: 'Lissé (même montant chaque mois)',               label: 'Fixe, lissé sur 12 mois (montant identique chaque mois)' },
  { value: 'a_la_seance',                                    label: 'À la séance (sans lissage)' },
]

const HOURS_STABILITY_OPTIONS = [
  { value: 'Heures garanties / bloquées',          label: 'Volume fixe non-négociable' },
  { value: 'Recalcul chaque rentrée de septembre', label: 'Renégocié chaque année' },
  { value: 'Variable en cours d\'année',           label: "Variable en cours d'année" },
]

const PAYMENT_DELAY_OPTIONS = [
  { value: 'Immédiat',             label: 'Immédiat' },
  { value: 'Sous 30 jours',        label: 'Sous 30 jours' },
  { value: 'Sous 60 jours',        label: 'Sous 60 jours' },
  { value: 'Sous 90 jours',        label: 'Sous 90 jours' },
  { value: 'Variable / non précisé', label: 'Variable / non précisé' },
]

const ACCESS_RESTRICTION_TYPES = [
  { value: 'a_tout_moment',            label: 'Cours et rattrapages possibles à tout moment' },
  { value: 'vacances_uniquement',      label: 'Rattrapages uniquement pendant les vacances scolaires' },
  { value: 'hors_vacances_uniquement', label: 'Rattrapages uniquement en dehors des vacances scolaires' },
  { value: 'autre',                    label: 'Autre restriction (à préciser ci-dessous)' },
]

// Taux de retenues salariales pour un cachet d'intermittent / vacataire artistique.
// Source : GUSO (Guichet Unique du Spectacle Vivant), grille 2024 — fourchette 22-23 %.
// À revoir si le statut du contrat change (CESU prestataire, salarié droit commun, etc.).
const TAUX_CHARGES_SALARIALES = 0.225  // part salariale : brut → net
// Charges patronales approximatives pour ce type de contrat (intermittent du spectacle).
// Elles s'appliquent au brut et viennent s'y ajouter pour obtenir le coût réel employeur.
const TAUX_CHARGES_PATRONALES = 0.40   // part patronale : brut → coût employeur

/**
 * Estime le taux brut et le coût employeur (net social) à partir d'un taux net connu.
 * Précision indicative : ±5 % selon les cas particuliers — vérifier sur le bulletin réel.
 * Retourne null pour chaque champ si le net est absent ou invalide.
 *
 * Fonction pure : pas d'effet de bord, testable indépendamment du JSX.
 * Règle d'utilisation : n'appeler l'estimation QUE si le champ cible est vide ;
 * une saisie manuelle prévaut TOUJOURS (voir estimBrut / estimNetSocial dans HourlyRateForm).
 */
function estimerBrutNetSocial(net) {
  const netNum = net !== '' && net != null ? parseFloat(net) : null
  if (!netNum || netNum <= 0) return { brutEstime: null, netSocialEstime: null }
  const brut      = netNum / (1 - TAUX_CHARGES_SALARIALES)
  const netSocial = brut * (1 + TAUX_CHARGES_PATRONALES)
  return {
    brutEstime:      Math.round(brut * 100) / 100,
    netSocialEstime: Math.round(netSocial * 100) / 100,
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function val(v) {
  if (v == null || v === '') return 'Non renseigné'
  return v
}

function fmtRate(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/h'
}

function fmtMoney(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/mois'
}

function fmtDate(d) {
  if (!d) return 'Non renseignée'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Composants UI ────────────────────────────────────────────────────────────

function Section({ title, children, help }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
        {title}
        {help && <HelpTooltip texte={help} position="right" />}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="text-sm">{children}</div>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

function TextInput({ value, onChange, placeholder, type = 'text', onBlur }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={inputCls}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      rows={rows}
      className={inputCls + ' resize-none'}
    />
  )
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls}
    >
      <option value="">{placeholder ?? '— Choisir —'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TextToggle({ value, onChange, options }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(({ v, l }) => (
        <button
          key={String(v ?? 'null')}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            value === v
              ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
              : 'border-border-subtle text-muted-foreground hover:border-border'
          }`}
        >{l}</button>
      ))}
    </div>
  )
}

function BooleanToggle({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {[{ v: true, l: 'Oui' }, { v: false, l: 'Non' }, { v: null, l: 'Non renseigné' }].map(({ v, l }) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            value === v
              ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
              : 'border-border-subtle text-muted-foreground hover:border-border'
          }`}
        >{l}</button>
      ))}
    </div>
  )
}

function StarRating({ value, onChange, disabled }) {
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange && onChange(value === n ? null : n)}
          className={`transition-colors ${disabled ? 'cursor-default' : 'hover:text-guitar-400'} ${
            n <= (value ?? 0) ? 'text-guitar-400' : 'text-muted'
          }`}
        >
          <Star className="w-4 h-4" fill={n <= (value ?? 0) ? 'currentColor' : 'none'} />
        </button>
      ))}
      {!disabled && value != null && (
        <button type="button" onClick={() => onChange(null)} className="ml-1 text-xs text-muted hover:text-foreground transition-colors">
          Effacer
        </button>
      )}
      {disabled && value == null && <span className="text-xs text-muted-foreground ml-1">Non renseigné</span>}
    </div>
  )
}

// ─── Géocodage Nominatim ──────────────────────────────────────────────────────

function AddressField({ value, onChange, lat, lon, onGeocode }) {
  const [geocoding, setGeocoding] = useState(false)
  const [geoMsg, setGeoMsg] = useState(null)

  const geocode = async () => {
    const q = (value ?? '').trim()
    if (!q) return
    setGeocoding(true)
    setGeoMsg(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HubGuitaristeApp/1.0 (usage privé, professeur de guitare)' },
      })
      const results = await res.json()
      if (results.length > 0) {
        const r = results[0]
        onGeocode(parseFloat(r.lat), parseFloat(r.lon), r.display_name)
        setGeoMsg({ ok: true, text: `Localisé : ${r.display_name}` })
      } else {
        setGeoMsg({ ok: false, text: 'Adresse introuvable. Renseignez les coordonnées manuellement ci-dessous.' })
      }
    } catch {
      setGeoMsg({ ok: false, text: 'Impossible de contacter le service de géocodage.' })
    }
    setGeocoding(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => { onChange(e.target.value || null); setGeoMsg(null) }}
          placeholder="Adresse complète de l'école…"
          className={inputCls + ' flex-1'}
        />
        <button
          type="button"
          onClick={geocode}
          disabled={geocoding || !value}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
        >
          {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          Localiser
        </button>
      </div>
      {geoMsg && (
        <p className={`text-xs flex items-start gap-1.5 ${geoMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {geoMsg.ok ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          {geoMsg.text}
        </p>
      )}
      {(!geoMsg?.ok) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={lat ?? ''}
              onChange={(e) => onGeocode(e.target.value ? parseFloat(e.target.value) : null, lon, null)}
              placeholder="Ex : 45.748056"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={lon ?? ''}
              onChange={(e) => onGeocode(lat, e.target.value ? parseFloat(e.target.value) : null, null)}
              placeholder="Ex : 4.846667"
              className={inputCls}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Numéros de téléphone multiples ──────────────────────────────────────────

function PhoneList({ phones, onChange }) {
  const list = phones ?? []

  const update = (i, key, val) => {
    const next = list.map((p, idx) => idx === i ? { ...p, [key]: val } : p)
    onChange(next.length ? next : null)
  }
  const remove = (i) => {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length ? next : null)
  }
  const add = () => onChange([...list, { label: '', number: '' }])

  return (
    <div className="space-y-2">
      {list.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={p.label ?? ''}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="Libellé (ex : Mobile)"
            className={inputCls + ' w-32 flex-shrink-0'}
          />
          <input
            type="tel"
            value={p.number ?? ''}
            onChange={(e) => update(i, 'number', e.target.value)}
            placeholder="06 XX XX XX XX"
            className={inputCls + ' flex-1'}
          />
          <button type="button" onClick={() => remove(i)} className="p-2 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter un numéro
      </button>
    </div>
  )
}

// ─── Formulaire taux horaires ─────────────────────────────────────────────────

function HourlyRateForm({ schoolId, teacherId, currentYear, existingRate, onSaved }) {
  const [form, setForm] = useState({
    gross: existingRate?.gross_hourly_rate ?? '',
    net:   existingRate?.net_hourly_rate ?? '',
    net_social: existingRate?.net_social_hourly_rate ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const rates = {
        gross_hourly_rate:      form.gross      !== '' ? Number(form.gross)      : null,
        net_hourly_rate:        form.net        !== '' ? Number(form.net)        : null,
        net_social_hourly_rate: form.net_social !== '' ? Number(form.net_social) : null,
      }
      const saved = await upsertHourlyRate(schoolId, teacherId, currentYear, rates)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const { brutEstime, netSocialEstime } = estimerBrutNetSocial(form.net)
  const estimBrut      = form.gross === ''      ? brutEstime      : null
  const estimNetSocial = form.net_social === '' ? netSocialEstime : null

  const RateField = ({ k, label, hint, estimation }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        <input
          type="number" min="0" step="0.01"
          value={form[k]}
          onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
          placeholder="0,00"
          className={inputCls + ' pr-8'}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
      </div>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      {estimation != null && (
        <p className="text-xs text-guitar-400/70 mt-1">
          ≈ {fmtRate(estimation)} <span className="text-muted-foreground">(estimation · à vérifier)</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="bg-surface-raised rounded-xl p-4 border border-border-subtle">
      <p className="text-xs font-medium text-foreground mb-3">Année scolaire {currentYear}</p>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <RateField k="gross"      label="Brut"       hint="Avant déduction des charges sociales."                                                           estimation={estimBrut} />
        <RateField k="net"        label="Net"        hint="Après déduction des charges salariales, avant impôt." />
        <RateField k="net_social" label="Net social" hint="Taux net déduction faite des cotisations sociales patronales (coût réel pour l'employeur)."      estimation={estimNetSocial} />
      </div>
      {error && <p className="text-xs text-guitar-400 mb-2">{error}</p>}
      <button
        type="button" onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-3 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Enregistrer
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SchoolDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth() // poids de pondération + domicile, pour le score et le rendement net réel

  const [school, setSchool]           = useState(null)
  const [rates, setRates]             = useState([])
  const [teacherId, setTeacherId]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(null)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Élèves liés à cette fiche ─────────────────────────────────────────────
  const [paidStudents, setPaidStudents]         = useState([])   // CESU : payés par cet employeur
  const [attachedStudents, setAttachedStudents] = useState([])   // École : cours dispensés ici
  const [allStudents, setAllStudents]           = useState([])   // tous les élèves (recherche)

  // ── Panneau de rattachement d'un élève existant ───────────────────────────
  const [showAttachPanel, setShowAttachPanel]   = useState(false)
  const [showCreateStudent, setShowCreateStudent] = useState(false)
  const [attachSearch, setAttachSearch]         = useState('')
  const [attachStudentId, setAttachStudentId]   = useState(null)
  const [attachRate, setAttachRate]             = useState('')
  const [attaching, setAttaching]               = useState(false)
  const [attachError, setAttachError]           = useState('')

  const curYear = currentSchoolYear()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Non authentifié'); setLoading(false); return }
      setTeacherId(user.id)
      try {
        const [profile, hourlyRates] = await Promise.all([
          fetchSchoolProfile(id),
          fetchHourlyRates(id),
        ])
        setSchool(profile)
        setRates(hourlyRates)
        // Charger tous les élèves pour la recherche de rattachement
        fetchTeacherStudents(user.id).then(setAllStudents).catch(() => {})
        if (profile?.structure_type === 'particulier_cesu') {
          fetchStudentsPaidBySchool(id, user.id).then(setPaidStudents).catch(() => {})
        } else {
          fetchStudentsAttachedToSchool(id, user.id).then(setAttachedStudents).catch(() => {})
        }
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    load()
  }, [id])

  const startEdit  = () => { setDraft({ ...school }); setEditing(true); setSaveError('') }
  const cancelEdit = () => { setDraft(null); setEditing(false); setSaveError('') }
  const set = (key) => (value) => setDraft((p) => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const updated = await updateSchoolProfile(id, draft)
      // Re-fetch si la réponse de l'UPDATE est vide (cas de RLS ou colonnes inconnues)
      const fresh = updated ?? await fetchSchoolProfile(id)
      setSchool(fresh)
      setDraft(null)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-3 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
    </div>
  )
  if (error) return (
    <div className="p-6">
      <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3">{error}</p>
    </div>
  )
  if (!school) return null

  const data          = editing ? draft : school
  const isCesu        = data.structure_type === 'particulier_cesu'
  // Dérivé directement des listes chargées via student_contexts (même source que
  // fetchContextCountsBySchool sur SchoolsPage.jsx) — jamais une requête séparée
  // sur students.school_id, qui ne reflète pas le rattachement CESU/école réel
  // et pouvait diverger de la section "Élèves" plus bas sur cette même page.
  const studentCount  = isCesu ? paidStudents.length : attachedStudents.length
  const currentRate    = rates.find((r) => r.school_year === curYear)
  const missingRate    = !currentRate || (currentRate.net_hourly_rate == null && currentRate.gross_hourly_rate == null)
  const scoreOptions   = { profile: user, netHourlyRate: currentRate?.net_hourly_rate, weights: user?.scoreWeights }
  const score          = computePriorityScore(school, scoreOptions)
  const scoreBreakdown = computeScoreBreakdown(school, scoreOptions)
  // Indicateur direct, en NET, indépendant du score pondéré (voir schools.js).
  // tauxNetEffectif = valeur avant décote de fiabilité (identique au rendement
  // net réel si la structure est fiable à 100 % — voir calculerRendementHoraireNetReel).
  const tauxNetEffectif  = calculerTauxNetEffectif(school, { netHourlyRate: currentRate?.net_hourly_rate })
  const rendementNetReel = calculerRendementHoraireNetReel(school, { netHourlyRate: currentRate?.net_hourly_rate })
  const fiabiliteReduite = tauxNetEffectif != null && rendementNetReel != null && rendementNetReel !== tauxNetEffectif
  const historyRates  = rates.filter((r) => r.school_year !== curYear)

  // Téléphones : tableau jsonb ou tableau vide
  const phones = Array.isArray(data.director_phones) ? data.director_phones : []

  // ── Élèves déjà liés — exclus de la recherche de rattachement ─────────────
  const alreadyLinkedIds = new Set(
    isCesu ? paidStudents.map((s) => s.id) : attachedStudents.map((s) => s.id)
  )
  // Filtre en mémoire (≥ 2 caractères) — même pattern que StudentsPage
  const searchResults = attachSearch.trim().length >= 2
    ? allStudents
        .filter((s) => !alreadyLinkedIds.has(s.id) && s.name.toLowerCase().includes(attachSearch.toLowerCase()))
        .slice(0, 8)
    : []

  // ── Rattachement d'un élève existant via student_contexts ─────────────────
  const handleAttach = async () => {
    if (!attachStudentId) { setAttachError("Sélectionnez un élève dans la liste."); return }
    setAttaching(true)
    setAttachError('')
    try {
      await addStudentContext(teacherId, attachStudentId, {
        contextType:     isCesu ? 'cesu' : 'ecole',
        schoolId:        id,
        schoolName:      school.name,
        hourlyRate:      attachRate,
        payerStudentId:  null,
      })
      // Mise à jour optimiste sans rechargement
      const found = allStudents.find((s) => s.id === attachStudentId)
      if (found) {
        const entry = { studentId: found.id, id: found.id, firstName: found.firstName, lastName: found.lastName, name: found.name }
        if (isCesu) setPaidStudents((prev) => [...prev, entry])
        else        setAttachedStudents((prev) => [...prev, entry])
      }
      setShowAttachPanel(false)
      setAttachSearch('')
      setAttachStudentId(null)
      setAttachRate('')
    } catch (err) {
      const msg = (err.message?.includes('23505') || err.message?.toLowerCase().includes('unique'))
        ? 'Cet élève est déjà rattaché à cette école.'
        : err.message
      setAttachError(msg)
    }
    setAttaching(false)
  }

  // Réinitialise et ferme le panneau de rattachement
  const cancelAttach = () => {
    setShowAttachPanel(false)
    setAttachSearch('')
    setAttachStudentId(null)
    setAttachRate('')
    setAttachError('')
  }

  return (
    <div className="p-6 sm:p-8 max-w-3xl space-y-4">

      {/* En-tête */}
      <button onClick={() => navigate('/admin/ecoles/liste')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" />
        Retour aux écoles
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{school.name}</h1>
            <HelpTooltip texte="Les notes sur les locaux, l'ambiance et le contrat alimentent le score de priorité visible dans le Simulateur et le Comparatif." />
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {school.structure_type && (
              <span className="text-xs text-muted-foreground bg-surface-raised px-2 py-0.5 rounded-full border border-border-subtle">
                {STRUCTURE_LABELS[school.structure_type] ?? school.structure_type}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {studentCount} élève{studentCount !== 1 ? 's' : ''}
            </span>
            {score != null && (
              <span className="text-xs text-guitar-400 flex items-center gap-1 font-medium">
                <Star className="w-3.5 h-3.5" fill="currentColor" />
                Score de priorité : {score}/5
              </span>
            )}
            {/* Les deux lignes s'affichent TOUJOURS, sur toute structure — y compris
                quand elles sont identiques (école standard, fiabilité maximale).
                L'intérêt est justement de pouvoir comparer les deux d'un coup d'œil,
                structure par structure, pour repérer où une décote s'applique.
                L'info-bulle n'apparaît que si les valeurs diffèrent réellement. */}
            {tauxNetEffectif != null && rendementNetReel != null && (
              <span className="text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground">
                  Taux saisi : {tauxNetEffectif.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h
                </span>
                <span
                  className="text-green-600 dark:text-green-400 font-semibold"
                  title={fiabiliteReduite ? "Tient compte du risque d'annulation non rattrapée pour cette structure — voir la fiabilité des heures ci-dessous" : undefined}
                >
                  {fiabiliteReduite ? '≈ ' : ''}Taux réel : {rendementNetReel.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {!editing ? (
            <button onClick={startEdit} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">
              <Pencil className="w-4 h-4" />Modifier
            </button>
          ) : (
            <>
              <button onClick={cancelEdit} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">
                <X className="w-4 h-4" />Annuler
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3">{saveError}</p>
      )}

      {/* Alerte taux horaire manquant */}
      {missingRate && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-sm">Taux horaire {curYear} non renseigné — à compléter avant la rentrée.</p>
        </div>
      )}

      {/* Navigation rapide */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => navigate('/professeur/eleves', { state: { filterSchool: school.name } })}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
        >
          <Users className="w-3.5 h-3.5" />Voir les élèves de cette école<ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => navigate('/professeur/planning')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
        >
          <Calendar className="w-3.5 h-3.5" />Voir le planning<ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ─── Section 1 : Identité & contact ──────────────────────────────────── */}
      <Section title="Identité & contact">
        <Field label="Type de structure">
          {editing
            ? <SelectInput value={data.structure_type} onChange={set('structure_type')} options={STRUCTURE_TYPES} />
            : <span className="text-foreground">{STRUCTURE_LABELS[data.structure_type] ?? val(data.structure_type)}</span>
          }
        </Field>

        <Field label="Adresse" hint="Cliquez sur « Localiser » pour remplir automatiquement latitude et longitude via OpenStreetMap.">
          {editing
            ? <AddressField
                value={data.address}
                onChange={set('address')}
                lat={data.latitude}
                lon={data.longitude}
                onGeocode={(lat, lon, displayName) => {
                  setDraft((p) => ({
                    ...p,
                    latitude: lat,
                    longitude: lon,
                    ...(displayName ? { address: displayName } : {}),
                  }))
                }}
              />
            : <div>
                <span className="text-foreground">{val(data.address)}</span>
                {data.latitude && data.longitude && (
                  <p className="text-xs text-muted-foreground mt-1">{Number(data.latitude).toFixed(5)}, {Number(data.longitude).toFixed(5)}</p>
                )}
              </div>
          }
        </Field>

        <Field label={isCesu ? 'Employeur particulier' : 'Directeur · Responsable pédagogique'}>
          {editing
            ? <TextInput value={data.director_name} onChange={set('director_name')} placeholder="Prénom Nom" />
            : <span className="text-foreground">{val(data.director_name)}</span>
          }
        </Field>

        <Field label="Téléphone(s) de la direction" hint="Ajoutez autant de numéros que nécessaire (mobile, fixe, secrétariat…).">
          {editing
            ? <PhoneList phones={phones} onChange={set('director_phones')} />
            : phones.length > 0
              ? <div className="space-y-1">{phones.map((p, i) => (
                  <p key={i} className="text-foreground text-sm">
                    {p.label ? <span className="text-muted-foreground mr-2">{p.label}</span> : null}
                    <PhoneActions number={p.number} />
                  </p>
                ))}</div>
              : <span className="text-muted-foreground">Non renseigné</span>
          }
        </Field>

        <Field label="E-mail de la direction">
          {editing
            ? <TextInput value={data.director_email} onChange={set('director_email')} placeholder="direction@…" type="email" />
            : data.director_email
              ? <EmailActions email={data.director_email} />
              : <span className="text-muted-foreground">Non renseigné</span>
          }
        </Field>

        {!isCesu && (
          <Field label="Contacts collègues" hint="Noms et coordonnées des autres intervenants ou du personnel administratif utile.">
            {editing
              ? <Textarea value={data.colleague_contacts} onChange={set('colleague_contacts')} placeholder="Ex : Sophie (flûte) — 06 XX XX XX XX" rows={2} />
              : <span className="text-foreground whitespace-pre-wrap">{val(data.colleague_contacts)}</span>
            }
          </Field>
        )}
      </Section>

      {/* ─── Section 2 : Contrat & rémunération ──────────────────────────────── */}
      <Section title="Contrat & rémunération" help="Taux horaire brut et net saisis ici servent à calculer le revenu estimé dans le Simulateur.">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Type de contrat" hint="Nature du contrat qui te lie à cette structure.">
            {editing
              ? <SelectInput
                  value={data.contract_type}
                  onChange={(v) => {
                    set('contract_type')(v)
                    if (v !== 'Autre') set('contract_type_detail')(null)
                  }}
                  options={CONTRACT_TYPES}
                />
              : <span className="text-foreground">{val(data.contract_type)}</span>
            }
          </Field>
          {/* Volume d'heures garanti — indépendant du type de contrat (un CESU ou un
              CDD peuvent aussi avoir des heures fixes) ; sous-facteur de la catégorie
              "Fiabilité des heures" du score de priorité (voir schools.js). */}
          <Field
            label="Volume d'heures garanti"
            hint="Ex : 6h30 garanties, jamais plus jamais moins — distingue un volume vraiment fixe d'un volume qui bouge chaque rentrée ou en cours d'année."
          >
            {editing
              ? <SelectInput value={data.hours_stability} onChange={set('hours_stability')} options={HOURS_STABILITY_OPTIONS} />
              : <span className="text-foreground">{val(data.hours_stability)}</span>
            }
          </Field>
        </div>

        {data.contract_type === 'Autre' && (
          <Field label="Précision sur le contrat" hint="Décris la nature exacte de ton contrat si elle ne correspond pas aux options standard.">
            {editing
              ? <TextInput value={data.contract_type_detail} onChange={set('contract_type_detail')} placeholder="Ex : convention de mise à disposition, contrat d'artiste…" />
              : <span className="text-foreground">{val(data.contract_type_detail)}</span>
            }
          </Field>
        )}

        {/* Dates : une seule paire contract_start_date / contract_end_date.
            contract_first_date (premier cours historique) reste en base mais n'est pas affiché
            ici — voir le commentaire dans schools.js PROFILE_COLUMNS pour la justification. */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Début de contrat">
            {editing
              ? <TextInput value={data.contract_start_date} onChange={set('contract_start_date')} type="date" />
              : <span className="text-foreground">{fmtDate(data.contract_start_date)}</span>
            }
          </Field>
          <Field label="Fin de contrat" hint="Laisser vide si la collaboration est toujours en cours.">
            {editing
              ? <TextInput value={data.contract_end_date} onChange={set('contract_end_date')} type="date" />
              : data.contract_end_date
                ? <span className="text-foreground">{fmtDate(data.contract_end_date)}</span>
                : <span className="text-green-500 text-sm font-medium">Collaboration en cours</span>
            }
          </Field>
        </div>

        <Field label="Préavis de rupture">
          {editing
            ? <TextInput value={data.notice_period} onChange={set('notice_period')} placeholder="Ex : 3 mois" />
            : <span className="text-foreground">{val(data.notice_period)}</span>
          }
        </Field>

        <Field label="Délai de paiement" hint="Délai habituel entre la fin du mois travaillé et le versement du salaire.">
          {editing
            ? <SelectInput value={data.payment_delay} onChange={set('payment_delay')} options={PAYMENT_DELAY_OPTIONS} />
            : <span className="text-foreground">{val(data.payment_delay)}</span>
          }
        </Field>

        {/* Sous-facteur de la catégorie "Rémunération réelle" du score pondéré
            (voir calculerRemunerationReelle, schools.js) — pas une 6e catégorie
            à part, même choix que hours_stability pour la fiabilité des heures. */}
        <Field
          label="Sérieux administratif et paiement"
          hint="Régularité des paiements et réactivité administrative : papiers, contrats, retards."
        >
          {editing
            ? <StarRating value={data.administrative_reliability_rating} onChange={set('administrative_reliability_rating')} />
            : <StarRating value={data.administrative_reliability_rating} disabled />
          }
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Durée de versement" hint="Sur combien de mois le salaire est-il versé dans l'année scolaire.">
            {editing
              ? <SelectInput value={data.payment_duration} onChange={set('payment_duration')} options={PAYMENT_DURATION_OPTIONS} />
              : <span className="text-foreground">{val(data.payment_duration)}</span>
            }
          </Field>
          <Field
            label="Type de lissage du salaire"
            hint="Indique si ton salaire mensuel est fixe (indépendant des heures du mois) ou variable."
          >
            {editing
              ? <SelectInput
                  value={data.payment_smoothing}
                  onChange={(v) => {
                    set('payment_smoothing')(v)
                    if (!isSalaryFixed(v)) set('fixed_monthly_salary')(null)
                  }}
                  options={PAYMENT_SMOOTHING_OPTIONS}
                />
              : <span className="text-foreground">
                  {data.payment_smoothing
                    ? (PAYMENT_SMOOTHING_OPTIONS.find((o) => o.value === data.payment_smoothing)?.label ?? data.payment_smoothing)
                    : 'Non renseigné'}
                </span>
            }
          </Field>
        </div>

        {/* Montant mensuel fixe — visible uniquement si lissage actif */}
        {isSalaryFixed(data.payment_smoothing) && (
          <Field
            label="Montant mensuel net fixe"
            hint={
              editing
                ? "Montant net versé chaque mois, indépendamment des heures réellement travaillées. Ex : l'école verse 1 200 € nets en octobre (3 semaines de cours) comme en décembre (4 semaines), car le salaire est calculé sur l'année entière et lissé sur 12 mois."
                : null
            }
          >
            {editing
              ? <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={data.fixed_monthly_salary ?? ''}
                    onChange={(e) => set('fixed_monthly_salary')(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Ex : 1 200,00"
                    className={inputCls + ' pr-16'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">€ / mois</span>
                </div>
              : <span className="text-foreground font-medium">
                  {data.fixed_monthly_salary != null
                    ? fmtMoney(data.fixed_monthly_salary)
                    : <span className="text-muted-foreground italic">Montant non renseigné</span>
                  }
                </span>
            }
          </Field>
        )}

        {/* Tâche 2 : prime annuelle estimée */}
        <Field
          label="Prime annuelle estimée"
          hint={editing
            ? "Montant brut de prime perçue chaque année dans cette école (ex : prime de rentrée). Laisser vide si aucune prime. Utilisée dans le simulateur pour affiner le revenu mensuel estimé."
            : null
          }
        >
          {editing
            ? <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={data.estimated_annual_bonus ?? ''}
                  onChange={(e) => set('estimated_annual_bonus')(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ex : 200"
                  className={inputCls + ' pr-12'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">€ / an</span>
              </div>
            : <span className="text-foreground">
                {data.estimated_annual_bonus != null
                  ? `${Number(data.estimated_annual_bonus).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € / an`
                  : <span className="text-muted-foreground italic">Non renseignée</span>
                }
              </span>
          }
        </Field>

        {/* Résumé combiné en lecture seule */}
        {!editing && (data.payment_duration || data.payment_smoothing) && (
          <div className="text-xs text-muted-foreground bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
            {[
              data.payment_duration,
              data.payment_smoothing
                ? (PAYMENT_SMOOTHING_OPTIONS.find((o) => o.value === data.payment_smoothing)?.label ?? data.payment_smoothing)
                : null,
              isSalaryFixed(data.payment_smoothing) && data.fixed_monthly_salary != null
                ? `${fmtMoney(data.fixed_monthly_salary)} net`
                : null,
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        <div className="pt-1">
          <p className="text-xs text-muted-foreground mb-2">Taux horaires — {curYear}</p>
          {editing ? (
            <HourlyRateForm
              schoolId={id}
              teacherId={teacherId}
              currentYear={curYear}
              existingRate={currentRate}
              onSaved={(saved) => {
                setRates((prev) => {
                  const without = prev.filter((r) => r.school_year !== curYear)
                  return [saved, ...without].sort((a, b) => b.school_year.localeCompare(a.school_year))
                })
              }}
            />
          ) : currentRate ? (
            <div className="flex flex-wrap gap-4 text-sm text-foreground bg-surface-raised rounded-xl px-4 py-3 border border-border-subtle">
              <span>Brut : <strong>{fmtRate(currentRate.gross_hourly_rate)}</strong></span>
              <span>Net : <strong>{fmtRate(currentRate.net_hourly_rate)}</strong></span>
              <span>Net social : <strong>{fmtRate(currentRate.net_social_hourly_rate)}</strong></span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucun taux renseigné pour {curYear}. Passez en mode édition pour en ajouter un.</p>
          )}
        </div>

        {historyRates.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Historique</p>
            <div className="space-y-1">
              {historyRates.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle flex-wrap gap-2">
                  <span className="text-muted-foreground font-medium">{r.school_year}</span>
                  <div className="flex gap-4 text-foreground">
                    <span>Brut : {fmtRate(r.gross_hourly_rate)}</span>
                    <span>Net : {fmtRate(r.net_hourly_rate)}</span>
                    <span>Net social : {fmtRate(r.net_social_hourly_rate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ─── Section 3 : Conditions matérielles ──────────────────────────────── */}
      <Section title="Conditions matérielles">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Heures hebdomadaires actuelles">
            {editing
              ? <input type="number" min="0" step="0.5" value={data.current_weekly_hours ?? ''} onChange={(e) => set('current_weekly_hours')(e.target.value ? Number(e.target.value) : null)} placeholder="Ex : 6" className={inputCls} />
              : <span className="text-foreground">{data.current_weekly_hours != null ? `${data.current_weekly_hours} h/semaine` : 'Non renseigné'}</span>
            }
          </Field>
          <Field label="Heures souhaitées">
            {editing
              ? <input type="number" min="0" step="0.5" value={data.desired_weekly_hours ?? ''} onChange={(e) => set('desired_weekly_hours')(e.target.value ? Number(e.target.value) : null)} placeholder="Ex : 8" className={inputCls} />
              : <span className="text-foreground">{data.desired_weekly_hours != null ? `${data.desired_weekly_hours} h/semaine` : 'Non renseigné'}</span>
            }
          </Field>
        </div>

        {/* Tâche 3 : jours de présence hebdomadaires */}
        <Field
          label="Jours de présence par semaine"
          hint={editing
            ? "Nombre de jours distincts par semaine où vous vous déplacez dans cette école (1 = un seul jour fixe, 3 = lundi + mercredi + vendredi, etc.). Purement organisationnel, sans impact sur le calcul de revenu."
            : null
          }
        >
          {editing
            ? <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set('weekly_presence_days')(data.weekly_presence_days === n ? null : n)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      data.weekly_presence_days === n
                        ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                        : 'border-border-subtle text-muted-foreground hover:border-border'
                    }`}
                  >{n}j</button>
                ))}
              </div>
            : <span className="text-foreground">
                {data.weekly_presence_days != null
                  ? `${data.weekly_presence_days} jour${data.weekly_presence_days > 1 ? 's' : ''} / semaine`
                  : <span className="text-muted-foreground italic">Non renseigné</span>
                }
              </span>
          }
        </Field>

        <Field label="Qualité des locaux" hint="Espace de travail, acoustique, luminosité, propreté…">
          {editing
            ? <StarRating value={data.premises_quality_rating} onChange={set('premises_quality_rating')} />
            : <StarRating value={data.premises_quality_rating} disabled />
          }
        </Field>

        {!isCesu && (
          <Field label="Salle partagée avec d'autres intervenants">
            {editing
              ? <BooleanToggle value={data.shared_room} onChange={set('shared_room')} />
              : <span className="text-foreground">{data.shared_room == null ? 'Non renseigné' : data.shared_room ? 'Oui' : 'Non'}</span>
            }
          </Field>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Notes sur le matériel" hint="Instruments disponibles, état, manques à signaler à la direction…">
            {editing
              ? <Textarea value={data.equipment_notes} onChange={set('equipment_notes')} placeholder="Ex : piano droit accordé, pas d'ampli disponible" rows={2} />
              : <span className="text-foreground whitespace-pre-wrap">{val(data.equipment_notes)}</span>
            }
          </Field>
          <Field label="Matériel disponible" hint="Qualité et disponibilité des instruments, amplificateurs, câbles, partitions…">
            {editing
              ? <StarRating value={data.equipment_rating} onChange={set('equipment_rating')} />
              : <StarRating value={data.equipment_rating} disabled />
            }
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Accès parking" hint="Note de 1 (inexistant ou très difficile) à 5 (parking gratuit réservé à l'école).">
            {editing
              ? <StarRating value={data.parking_rating} onChange={set('parking_rating')} />
              : <StarRating value={data.parking_rating} disabled />
            }
          </Field>
          <Field label="Accès à vélo">
            {editing
              ? <TextToggle
                  value={data.bike_access}
                  onChange={set('bike_access')}
                  options={[{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }, { v: null, l: 'Non renseigné' }]}
                />
              : <span className="text-foreground">
                  {data.bike_access === 'oui' ? 'Oui' : data.bike_access === 'non' ? 'Non' : 'Non renseigné'}
                </span>
            }
          </Field>
        </div>
      </Section>

      {/* ─── Section 4 : Humain ───────────────────────────────────────────────── */}
      <Section title="Humain">
        <Field label="Ambiance de travail" hint="Relations avec la direction, l'administration et les élèves au quotidien.">
          {editing
            ? <StarRating value={data.work_atmosphere_rating} onChange={set('work_atmosphere_rating')} />
            : <StarRating value={data.work_atmosphere_rating} disabled />
          }
        </Field>
        <Field label="Engagement des élèves" hint="Niveau de motivation et de régularité des élèves dans cette structure.">
          {editing
            ? <StarRating value={data.student_engagement_rating} onChange={set('student_engagement_rating')} />
            : <StarRating value={data.student_engagement_rating} disabled />
          }
        </Field>
        {!isCesu && (
          <>
            <Field label="Stabilité de l'équipe" hint="1 = turnover élevé, direction instable ; 5 = équipe pédagogique et direction stables depuis plusieurs années.">
              {editing
                ? <StarRating value={data.team_stability_rating} onChange={set('team_stability_rating')} />
                : <StarRating value={data.team_stability_rating} disabled />
              }
            </Field>
            <Field label="Notes — équipe et stabilité" hint="Observations libres : ancienneté de la direction, renouvellement des intervenants, cohésion de l'équipe…">
              {editing
                ? <Textarea value={data.team_stability_notes} onChange={set('team_stability_notes')} placeholder="Ex : direction stable depuis 5 ans, peu de turnover" rows={2} />
                : <span className="text-foreground whitespace-pre-wrap">{val(data.team_stability_notes)}</span>
              }
            </Field>
          </>
        )}
      </Section>

      {/* ─── Section 5 : Contraintes calendaires ─────────────────────────────── */}
      <Section title="Contraintes calendaires">
        <Field label="Zone de vacances (si différente du réglage global)">
          {editing
            ? <SelectInput value={data.vacation_zone_override} onChange={set('vacation_zone_override')} options={[{ value: 'A', label: 'Zone A' }, { value: 'B', label: 'Zone B' }, { value: 'C', label: 'Zone C' }]} placeholder="— Identique au réglage global —" />
            : <span className="text-foreground">{data.vacation_zone_override ? `Zone ${data.vacation_zone_override}` : 'Identique au réglage global'}</span>
          }
        </Field>

        <Field label="Restrictions d'accès pour les rattrapages">
          {editing
            ? <>
                <SelectInput
                  value={data.access_restriction_type}
                  onChange={(v) => { set('access_restriction_type')(v); if (v !== 'autre') set('access_restriction_detail')(null) }}
                  options={ACCESS_RESTRICTION_TYPES}
                  placeholder="— Choisir —"
                />
                {data.access_restriction_type === 'autre' && (
                  <Textarea
                    value={data.access_restriction_detail}
                    onChange={set('access_restriction_detail')}
                    placeholder="Décris la restriction spécifique à cette école…"
                    rows={2}
                  />
                )}
              </>
            : <>
                <span className="text-foreground">
                  {data.access_restriction_type
                    ? (ACCESS_RESTRICTION_TYPES.find((o) => o.value === data.access_restriction_type)?.label ?? data.access_restriction_type)
                    : 'Non renseigné'}
                </span>
                {data.access_restriction_detail && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{data.access_restriction_detail}</p>
                )}
              </>
          }
        </Field>
      </Section>

      {/* ─── Section 6 : Priorité, mots-clés & notes ─────────────────────────── */}
      <Section title="Priorité & mots-clés" help="Ces notes sont combinées avec le poids des curseurs de Réglages → Priorisation pour calculer le score de priorité de cette école.">
        <Field label="Perspectives d'évolution" hint="Probabilité d'augmentation d'heures ou d'ouverture de nouvelles classes à court terme.">
          {editing
            ? <StarRating value={data.growth_perspective_rating} onChange={set('growth_perspective_rating')} />
            : <StarRating value={data.growth_perspective_rating} disabled />
          }
        </Field>
        <Field label="Priorité manuelle" hint="Indépendamment des notes détaillées, ton ressenti global sur l'école (1 = à réduire, 5 = à développer en priorité).">
          {editing
            ? <StarRating value={data.manual_priority_rating} onChange={set('manual_priority_rating')} />
            : <StarRating value={data.manual_priority_rating} disabled />
          }
        </Field>

        {/* Correction manuelle de la catégorie "Fiabilité des heures" du score pondéré
            (voir schools.js/calculerFiabiliteHeures) — remplace le calcul automatique et
            n'est jamais recalculée ni écrasée tant qu'elle reste saisie. */}
        <Field
          label="Correction manuelle de fiabilité"
          hint="Remplace le calcul automatique (basé sur le type de structure et le volume d'heures) si ton vécu de cette école dit autre chose — ex : un CESU historiquement stable, ou une école dont les annulations ne sont jamais rattrapées malgré son statut. Laisse vide pour garder le calcul automatique."
        >
          {editing
            ? <StarRating value={data.manual_reliability_override} onChange={set('manual_reliability_override')} />
            : data.manual_reliability_override != null
              ? <StarRating value={data.manual_reliability_override} disabled />
              : <span className="text-muted-foreground italic">Calcul automatique (aucune correction saisie)</span>
          }
        </Field>

        <Field label="Score de priorité pondéré">
          <span className="text-foreground">
            {score != null
              ? <>
                  {score} / 5{isScoreIncomplete(school, scoreOptions) && <span className="ml-2 text-xs text-muted-foreground italic">(score incomplet — moins de 4 catégories renseignées)</span>}
                  <div className="mt-2 space-y-1">
                    {Object.entries(scoreBreakdown).map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{SCORE_CATEGORY_LABELS[cat]}</span>
                        <span className={val != null ? 'text-foreground font-medium' : 'text-muted italic'}>
                          {val != null ? `${val} / 5` : 'non renseigné'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-2">Pondération réglable dans Réglages → Priorisation des écoles.</p>
                </>
              : 'Aucune donnée renseignée pour l’instant'
            }
          </span>
        </Field>

        <div className="border-t border-border-subtle pt-4">
          <Field label="Mots-clés" hint="Courts mots-clés pour repérer cette école rapidement plus tard, séparés par des virgules (ex : à développer, flexible horaires, matériel fourni).">
            {editing
              ? <TextInput value={data.tags} onChange={set('tags')} placeholder="Ex : à développer, flexible horaires, bon matériel" />
              : data.tags
                ? <div>{(data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded-full text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400">{t}</span>
                  ))}</div>
                : <span className="text-muted-foreground">Non renseigné</span>
            }
          </Field>
        </div>

        <div className="border-t border-border-subtle pt-4">
          <Field label="Notes libres" hint="Tout ce que tu veux garder en tête sur cette école, en texte libre.">
            {editing
              ? <Textarea value={data.notes} onChange={set('notes')} placeholder="Informations diverses, impressions, projets en cours…" rows={3} />
              : <span className="text-foreground whitespace-pre-wrap">{val(data.notes)}</span>
            }
          </Field>
        </div>
      </Section>

      {/* ─── Section CESU : élèves dont les cours sont payés par cet employeur ── */}
      {isCesu && (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider">
            Élèves dont les cours sont payés par cet employeur
          </p>

          {/* Liste des élèves CESU liés */}
          {paidStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun élève lié pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {paidStudents.map((s) => (
                <button
                  key={s.studentId}
                  type="button"
                  onClick={() => navigate('/professeur/eleves/' + s.id)}
                  className="flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle hover:bg-surface-overlay transition-colors text-sm font-medium"
                >
                  <span>{s.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Boutons d'action */}
          {!showAttachPanel && (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setShowAttachPanel(true); setShowCreateStudent(false) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <Plus className="w-3.5 h-3.5" />Rattacher un élève existant
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateStudent(true); setShowAttachPanel(false) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <Plus className="w-3.5 h-3.5" />Créer un nouvel élève
              </button>
            </div>
          )}

          {/* Panneau de recherche / rattachement inline */}
          {showAttachPanel && (
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Rechercher un élève à rattacher</p>
              <input
                type="text"
                value={attachSearch}
                onChange={(e) => { setAttachSearch(e.target.value); setAttachStudentId(null) }}
                placeholder="Nom de l'élève (min. 2 caractères)…"
                autoFocus
                className={inputCls}
              />
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setAttachStudentId(s.id); setAttachSearch(s.name) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        attachStudentId === s.id
                          ? 'bg-guitar-600/15 border border-guitar-600/30 text-guitar-400'
                          : 'hover:bg-surface-overlay border border-transparent'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {attachStudentId && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Taux horaire CESU (optionnel)</label>
                  <div className="relative w-40">
                    <input
                      type="number" min="0" step="0.01"
                      value={attachRate}
                      onChange={(e) => setAttachRate(e.target.value)}
                      placeholder="0,00"
                      className={inputCls + ' pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
                  </div>
                </div>
              )}
              {attachError && <p className="text-xs text-guitar-400">{attachError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={attaching || !attachStudentId}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-60"
                >
                  {attaching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmer le rattachement
                </button>
                <button
                  type="button"
                  onClick={cancelAttach}
                  className="px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Section École : élèves rattachés à cette école de musique ─────────── */}
      {!isCesu && (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider">
            Élèves rattachés à cette école
          </p>

          {/* Liste des élèves école liés */}
          {attachedStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun élève rattaché pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {attachedStudents.map((s) => (
                <button
                  key={s.studentId}
                  type="button"
                  onClick={() => navigate('/professeur/eleves/' + s.id)}
                  className="flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle hover:bg-surface-overlay transition-colors text-sm font-medium"
                >
                  <span>{s.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Boutons d'action */}
          {!showAttachPanel && (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setShowAttachPanel(true); setShowCreateStudent(false) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <Plus className="w-3.5 h-3.5" />Rattacher un élève existant
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateStudent(true); setShowAttachPanel(false) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <Plus className="w-3.5 h-3.5" />Créer un nouvel élève
              </button>
            </div>
          )}

          {/* Panneau de recherche / rattachement inline */}
          {showAttachPanel && (
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Rechercher un élève à rattacher</p>
              <input
                type="text"
                value={attachSearch}
                onChange={(e) => { setAttachSearch(e.target.value); setAttachStudentId(null) }}
                placeholder="Nom de l'élève (min. 2 caractères)…"
                autoFocus
                className={inputCls}
              />
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setAttachStudentId(s.id); setAttachSearch(s.name) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        attachStudentId === s.id
                          ? 'bg-guitar-600/15 border border-guitar-600/30 text-guitar-400'
                          : 'hover:bg-surface-overlay border border-transparent'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {attachStudentId && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Taux horaire (optionnel)</label>
                  <div className="relative w-40">
                    <input
                      type="number" min="0" step="0.01"
                      value={attachRate}
                      onChange={(e) => setAttachRate(e.target.value)}
                      placeholder="0,00"
                      className={inputCls + ' pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
                  </div>
                </div>
              )}
              {attachError && <p className="text-xs text-guitar-400">{attachError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={attaching || !attachStudentId}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-60"
                >
                  {attaching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmer le rattachement
                </button>
                <button
                  type="button"
                  onClick={cancelAttach}
                  className="px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal création d'élève depuis la fiche école ────────────────────────
          preselect pre-coche la case école ou CESU et présélectionne cet établissement */}
      {showCreateStudent && teacherId && (
        <AddStudentModal
          teacherId={teacherId}
          preselect={{
            type:       isCesu ? 'cesu' : 'ecole',
            schoolId:   id,
            schoolName: school.name,
          }}
          onClose={() => setShowCreateStudent(false)}
          onCreated={(newStudent) => {
            // Ajouter immédiatement l'élève dans la liste locale
            const entry = {
              studentId: newStudent.id,
              id:        newStudent.id,
              firstName: newStudent.firstName,
              lastName:  newStudent.lastName,
              name:      newStudent.name,
            }
            if (isCesu) setPaidStudents((prev) => [...prev, entry])
            else        setAttachedStudents((prev) => [...prev, entry])
            setShowCreateStudent(false)
          }}
        />
      )}

    </div>
  )
}
