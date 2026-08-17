import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { geocodeAddress } from '../../utils/geocode'
import { MapPin, Check, Loader2, Car, Bike, Motorbike, Search, AlertCircle, Briefcase, Palette, Trash2, Plus, Route, Navigation, CalendarDays, Copy, RefreshCw, SlidersHorizontal, TableProperties, School, Phone, Link } from 'lucide-react'
import { useTheme, THEMES } from '../../hooks/useTheme'
import { fetchMileageRates, upsertMileageRate, deleteMileageRate, seedDefaultRates } from '../../services/mileageRates'
import { DEFAULT_SCORE_WEIGHTS } from '../../services/schools'
import HelpTooltip from '../../components/HelpTooltip'

// Les 5 catégories du score pondéré (voir services/schools.js) — ordre d'affichage
// des curseurs dans la section "Priorisation des écoles" ci-dessous.
const SCORE_WEIGHT_SLIDERS = [
  { key: 'fiabilite',    label: 'Fiabilité des heures' },
  { key: 'remuneration', label: 'Rémunération réelle (net)' },
  { key: 'distance',     label: 'Distance / trajet' },
  { key: 'perspectives', label: 'Perspectives & stabilité' },
  { key: 'ambiance',     label: 'Ambiance & conditions humaines' },
]

// Ancre de la section "Priorisation des écoles", ciblée depuis SchoolsPage.jsx
// via /professeur/reglages#priorisation-ecoles — l'id doit rester identique
// des deux côtés (pas de source commune : une seule chaîne, dupliquer un
// fichier de constantes pour ça aurait été plus lourd qu'utile).
const PRIORISATION_SECTION_ID = 'priorisation-ecoles'

const ZONES = [
  { value: 'A', label: 'Zone A', description: 'Académies de Paris, Versailles, Créteil…' },
  { value: 'B', label: 'Zone B', description: 'Académies de Lille, Nancy, Strasbourg…' },
  { value: 'C', label: 'Zone C', description: 'Académies de Bordeaux, Lyon, Marseille…' },
]

const VEHICLE_TYPES = [
  { value: 'voiture',               label: 'Voiture',                            icon: Car },
  { value: 'deux_roues_motorise',   label: 'Deux-roues motorisé',               icon: Motorbike },
  { value: 'velo_electrique',       label: 'Vélo électrique',                    icon: Bike },
  { value: 'velo',                  label: 'Vélo simple (musculaire)',            icon: Bike },
  { value: 'plusieurs',             label: 'Plusieurs véhicules selon les jours', icon: Car },
]

const FUEL_TYPES = [
  { value: 'essence',    label: 'Essence' },
  { value: 'diesel',     label: 'Diesel' },
  { value: 'hybride',    label: 'Hybride' },
  { value: 'electrique', label: 'Électrique' },
]

const MILEAGE_VEHICLE_LABELS = {
  voiture: 'Voiture',
  deux_roues_motorise: 'Deux-roues motorisé',
  velo_electrique: 'Vélo électrique',
  velo: 'Vélo',
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

export default function SettingsPage() {
  const { user, setUser } = useAuth()
  const { theme, setTheme, customColor } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  // ── Préférences de planification (Planning intelligent) ──────────────────
  // preferred_days_off : tableau d'objets { jour, mode, heure_debut?, heure_fin? }
  const [preferredDaysOff,       setPreferredDaysOff]       = useState([])
  // preferred_proximity_days : tableau de noms de jours
  const [preferredProximityDays, setPreferredProximityDays] = useState([])
  const [savingPrefs,  setSavingPrefs]  = useState(false)
  const [savedPrefs,   setSavedPrefs]   = useState(false)
  const [errorPrefs,   setErrorPrefs]   = useState(null)

  // ── Abonnement calendrier ──────────────────────────────────────────────────
  const [calendarToken, setCalendarToken]     = useState(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [copiedCal, setCopiedCal]             = useState(false)

  // ── Application GPS ────────────────────────────────────────────────────────
  const [navApp, setNavAppState]   = useState(user?.navApp ?? 'google_maps')
  const [savingNav, setSavingNav]   = useState(false)
  const [savedNav, setSavedNav]     = useState(false)

  // ── Priorisation des écoles (poids du score, voir services/schools.js) ────
  const [weights, setWeightsState] = useState(user?.scoreWeights ?? DEFAULT_SCORE_WEIGHTS)
  const [savingWeights, setSavingWeights] = useState(false)
  const [savedWeights, setSavedWeights]   = useState(false)
  // Ref synchrone : évite de lire un état React potentiellement pas encore
  // re-rendu au moment du relâchement du curseur (pointerup juste après change).
  const weightsRef = useRef(weights)

  // ── Zone scolaire ──────────────────────────────────────────────────────────
  const [zone, setZone]         = useState(user?.schoolZone ?? 'B')
  const [savingZone, setSavingZone] = useState(false)
  const [savedZone, setSavedZone]   = useState(false)
  const [errorZone, setErrorZone]   = useState(null)

  // ── Profil professionnel ───────────────────────────────────────────────────
  const [prof, setProf] = useState({
    home_address:             '',
    home_latitude:            null,
    home_longitude:           null,
    vehicle_type:             '',
    fuel_type:                '',
    fiscal_horsepower:        '',
    fuel_consumption_l_100km: '',
    default_hourly_rate:      '',
    weekly_max_hours:         '',
  })
  const [profLoaded,   setProfLoaded]   = useState(false)
  const [savingProf,   setSavingProf]   = useState(false)
  const [savedProf,    setSavedProf]    = useState(false)
  const [errorProf,    setErrorProf]    = useState(null)
  const [geocoding,    setGeocoding]    = useState(false)
  const [geocodeInfo,  setGeocodeInfo]  = useState(null)
  const [geocodeError, setGeocodeError] = useState(null)

  // ── Fiche contact ─────────────────────────────────────────────────────────
  const [contact, setContact] = useState({
    phone:            '',
    whatsapp_link:    '',
    messenger_link:   '',
    discord_link:     '',
    cloud_share_link: '',
  })
  const [savingContact, setSavingContact] = useState(false)
  const [savedContact,  setSavedContact]  = useState(false)
  const [errorContact,  setErrorContact]  = useState(null)

  // ── Taux kilométriques ────────────────────────────────────────────────────
  const [mileageRates, setMileageRates] = useState([])
  const [mileageLoaded, setMileageLoaded] = useState(false)
  const [mileageError, setMileageError] = useState(null)
  const [editingRate, setEditingRate] = useState(null) // { id?, vehicle_type, fiscal_cv, rate_per_km, label, year }
  const [savingRate, setSavingRate] = useState(false)

  // Scroll direct vers une section précise si l'URL arrive avec une ancre
  // (ex : /professeur/reglages#priorisation-ecoles). On attend que les
  // sections chargées de façon asynchrone plus haut sur la page (profil,
  // taux kilométriques) aient remplacé leur spinner par leur contenu réel :
  // sinon la mise en page grandit APRÈS le scroll et fait atterrir ailleurs
  // (ex : sur "Taux kilométriques", juste au-dessus de la cible réelle).
  // Déclaré ICI et pas plus haut : profLoaded/mileageLoaded doivent déjà être
  // initialisées avant d'apparaître dans le tableau de dépendances, sous peine
  // de "Cannot access before initialization" (temporal dead zone) au build.
  useEffect(() => {
    if (!location.hash || !profLoaded || !mileageLoaded) return
    // requestAnimationFrame : laisse le navigateur peindre la mise en page
    // désormais stable avant de mesurer la position de la section visée.
    const frame = requestAnimationFrame(() => {
      document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.hash, profLoaded, mileageLoaded])

  // Calculatrice kilométrique
  const [calcKm, setCalcKm] = useState('')
  const [calcVehicle, setCalcVehicle] = useState('voiture')
  const [calcCV, setCalcCV] = useState('')

  const showFuel = prof.vehicle_type === 'voiture' || prof.vehicle_type === 'deux_roues_motorise' || prof.vehicle_type === 'plusieurs'
  const showFiscalCV = prof.vehicle_type === 'voiture' || prof.vehicle_type === 'plusieurs'

  // Chargement du profil professionnel (fetch séparé pour ne pas casser l'auth si la migration n'est pas faite)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setContact({
            phone:            data.phone            ?? '',
            whatsapp_link:    data.whatsapp_link    ?? '',
            messenger_link:   data.messenger_link   ?? '',
            discord_link:     data.discord_link     ?? '',
            cloud_share_link: data.cloud_share_link ?? '',
          })
          setProf({
            home_address:             data.home_address             ?? '',
            home_latitude:            data.home_latitude            ?? null,
            home_longitude:           data.home_longitude           ?? null,
            vehicle_type:             data.vehicle_type             ?? '',
            fuel_type:                data.fuel_type                ?? '',
            fiscal_horsepower:        data.fiscal_horsepower        ?? '',
            fuel_consumption_l_100km: data.fuel_consumption_l_100km ?? '',
            default_hourly_rate:      data.default_hourly_rate      ?? '',
            weekly_max_hours:         data.weekly_max_hours         ?? '',
          })
          if (data.home_address && data.home_latitude) {
            setGeocodeInfo('Coordonnées enregistrées.')
          }
          if (data.calendar_token) setCalendarToken(data.calendar_token)
          // Préférences de planification — normalisation rétrocompat au chargement
          if (Array.isArray(data.preferred_days_off)) {
            // Rétrocompat : anciens enregistrements sous forme de chaînes simples
            setPreferredDaysOff(data.preferred_days_off.map((e) =>
              typeof e === 'string' ? { jour: e, mode: 'toute_la_journee' } : e
            ))
          }
          // preferred_proximity_days (nouvelle colonne) avec repli sur l'ancien champ texte
          if (Array.isArray(data.preferred_proximity_days) && data.preferred_proximity_days.length > 0) {
            setPreferredProximityDays(data.preferred_proximity_days)
          } else if (data.preferred_proximity_day) {
            setPreferredProximityDays([data.preferred_proximity_day])
          }
        }
        setProfLoaded(true)
      })
      .catch(() => setProfLoaded(true))

    fetchMileageRates(user.id)
      .then((rates) => { setMileageRates(rates); setMileageLoaded(true) })
      .catch(() => setMileageLoaded(true))
  }, [user?.id])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleSaveContact() {
    setSavingContact(true); setErrorContact(null)
    const payload = {
      phone:            contact.phone            || null,
      whatsapp_link:    contact.whatsapp_link    || null,
      messenger_link:   contact.messenger_link   || null,
      discord_link:     contact.discord_link     || null,
      cloud_share_link: contact.cloud_share_link || null,
    }
    const { error: err } = await supabase.from('profiles').update(payload).eq('id', user.id)
    setSavingContact(false)
    if (err) { setErrorContact('Erreur : ' + err.message); return }
    // Met à jour le contexte auth pour que user.phone soit immédiatement à jour
    // (utilisé par les en-têtes PDF sans recharger la page).
    setUser((prev) => ({ ...prev, phone: contact.phone || null }))
    setSavedContact(true); setTimeout(() => setSavedContact(false), 2000)
  }

  async function handleSaveZone() {
    setSavingZone(true); setErrorZone(null)
    const { error: err } = await supabase.from('profiles').update({ school_zone: zone }).eq('id', user.id)
    setSavingZone(false)
    if (err) { setErrorZone('Erreur : ' + err.message); return }
    setUser((prev) => ({ ...prev, schoolZone: zone }))
    setSavedZone(true); setTimeout(() => setSavedZone(false), 2000)
  }

  async function handleGeocode() {
    setGeocoding(true); setGeocodeInfo(null); setGeocodeError(null)
    try {
      const result = await geocodeAddress(prof.home_address)
      if (!result) {
        setGeocodeError("Adresse introuvable. Essayez d'être plus précis.")
      } else {
        setProf((p) => ({ ...p, home_latitude: result.lat, home_longitude: result.lon }))
        setGeocodeInfo(`Trouvé : ${result.displayName}`)
      }
    } catch (err) {
      setGeocodeError(err.message)
    }
    setGeocoding(false)
  }

  async function handleSaveProf() {
    setSavingProf(true); setErrorProf(null)
    const payload = {
      home_address:             prof.home_address || null,
      home_latitude:            prof.home_latitude ?? null,
      home_longitude:           prof.home_longitude ?? null,
      vehicle_type:             prof.vehicle_type || null,
      fuel_type:                prof.fuel_type || null,
      fiscal_horsepower:        prof.fiscal_horsepower !== '' ? Number(prof.fiscal_horsepower) : null,
      fuel_consumption_l_100km: prof.fuel_consumption_l_100km !== '' ? Number(prof.fuel_consumption_l_100km) : null,
      default_hourly_rate:      prof.default_hourly_rate !== '' ? Number(prof.default_hourly_rate) : null,
      weekly_max_hours:         prof.weekly_max_hours !== '' ? Number(prof.weekly_max_hours) : null,
    }
    const { error: err } = await supabase.from('profiles').update(payload).eq('id', user.id)
    setSavingProf(false)
    if (err) { setErrorProf('Erreur : ' + err.message); return }
    setSavedProf(true); setTimeout(() => setSavedProf(false), 2000)
  }

  async function handleSaveRate(rate) {
    setSavingRate(true); setMileageError(null)
    try {
      const saved = await upsertMileageRate(user.id, rate)
      setMileageRates((prev) => {
        const without = prev.filter((r) => r.id !== saved.id)
        return [...without, saved].sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type) || (a.fiscal_cv ?? 0) - (b.fiscal_cv ?? 0))
      })
      setEditingRate(null)
    } catch (e) {
      setMileageError(e.message)
    }
    setSavingRate(false)
  }

  async function handleDeleteRate(rateId) {
    try {
      await deleteMileageRate(rateId)
      setMileageRates((prev) => prev.filter((r) => r.id !== rateId))
    } catch (e) {
      setMileageError(e.message)
    }
  }

  async function handleSeedRates() {
    setSavingRate(true)
    try {
      const seeded = await seedDefaultRates(user.id)
      setMileageRates(seeded)
    } catch (e) {
      setMileageError(e.message)
    }
    setSavingRate(false)
  }

  // Calcul kilométrique
  const calcResult = (() => {
    const km = parseFloat(calcKm)
    if (!km || km <= 0) return null
    const match = mileageRates.find((r) => {
      if (r.vehicle_type !== calcVehicle) return false
      if (calcVehicle === 'voiture' && calcCV) return r.fiscal_cv === Number(calcCV)
      if (calcVehicle === 'voiture') return r.fiscal_cv != null
      return true
    }) ?? mileageRates.find((r) => r.vehicle_type === calcVehicle)
    if (!match) return null
    return { cost: (km * match.rate_per_km).toFixed(2), rate: match.rate_per_km, label: match.label }
  })()

  async function handleSaveNavApp(value) {
    setSavingNav(true)
    const chosen = value ?? navApp
    const { error: err } = await supabase.from('profiles').update({ nav_app: chosen }).eq('id', user.id)
    setSavingNav(false)
    if (err) return
    setUser((prev) => ({ ...prev, navApp: chosen }))
    setSavedNav(true); setTimeout(() => setSavedNav(false), 2000)
  }

  // Met à jour l'affichage du curseur immédiatement (fluide pendant le glisser),
  // et garde une copie synchrone dans la ref pour la sauvegarde au relâchement.
  function updateWeight(key, value) {
    const next = { ...weightsRef.current, [key]: value }
    weightsRef.current = next
    setWeightsState(next)
  }

  async function handleSaveWeights() {
    setSavingWeights(true)
    const w = weightsRef.current
    const { error: err } = await supabase.from('profiles').update({
      score_weight_fiabilite:    w.fiabilite,
      score_weight_remuneration: w.remuneration,
      score_weight_distance:     w.distance,
      score_weight_perspectives: w.perspectives,
      score_weight_ambiance:     w.ambiance,
    }).eq('id', user.id)
    setSavingWeights(false)
    if (err) return
    setUser((prev) => ({ ...prev, scoreWeights: w }))
    setSavedWeights(true); setTimeout(() => setSavedWeights(false), 2000)
  }

  // ── Préférences de planification ─────────────────────────────────────────

  function isDayOff(jour) {
    return preferredDaysOff.some((e) => e.jour === jour)
  }

  function toggleDayOff(jour) {
    setPreferredDaysOff((prev) =>
      isDayOff(jour)
        ? prev.filter((e) => e.jour !== jour)
        : [...prev, { jour, mode: 'toute_la_journee' }]
    )
  }

  function setDayMode(jour, mode) {
    setPreferredDaysOff((prev) => prev.map((e) =>
      e.jour !== jour ? e : { ...e, mode }
    ))
  }

  function setDayTime(jour, field, value) {
    setPreferredDaysOff((prev) => prev.map((e) =>
      e.jour !== jour ? e : { ...e, [field]: value }
    ))
  }

  function toggleProximityDay(jour) {
    setPreferredProximityDays((prev) =>
      prev.includes(jour) ? prev.filter((d) => d !== jour) : [...prev, jour]
    )
  }

  async function handleSavePrefs() {
    setSavingPrefs(true); setErrorPrefs(null)
    const { error: err } = await supabase.from('profiles').update({
      preferred_days_off:       preferredDaysOff,
      preferred_proximity_days: preferredProximityDays,
    }).eq('id', user.id)
    setSavingPrefs(false)
    if (err) { setErrorPrefs('Erreur : ' + err.message); return }
    setSavedPrefs(true); setTimeout(() => setSavedPrefs(false), 2000)
  }

  // ── Handlers calendrier ───────────────────────────────────────────────────

  async function handleGenerateCalendarToken() {
    setGeneratingToken(true)
    // Génère un UUID côté client — stable, opaque, jamais affiché comme "token"
    const newToken = crypto.randomUUID()
    const { error: err } = await supabase
      .from('profiles')
      .update({ calendar_token: newToken })
      .eq('id', user.id)
    setGeneratingToken(false)
    if (!err) setCalendarToken(newToken)
  }

  function handleCopyCalendarUrl() {
    if (!calendarToken) return
    const url = calendarIcsUrl(calendarToken)
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCal(true)
      setTimeout(() => setCopiedCal(false), 2500)
    })
  }

  function calendarIcsUrl(token) {
    return window.location.origin + '/api/planning-ics?token=' + token
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 sm:p-8 max-w-2xl space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Réglages</h1>
        <p className="text-muted-foreground mt-1">Personnalisez votre espace professeur</p>
      </header>

      {/* ── Localisation ─────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Localisation</h2>
              <HelpTooltip texte="L'adresse est géocodée pour calculer la distance Haversine entre votre domicile et chaque école. Elle apparaît aussi dans l'en-tête de vos PDF." position="right" />
            </div>
            <p className="text-sm text-muted-foreground">Adresse du domicile et zone scolaire pour les calculs de trajet et les vacances</p>
          </div>
        </div>

        {!profLoaded ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Adresse domicile + géocodage */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Adresse du domicile</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prof.home_address}
                  onChange={(e) => {
                    setProf((p) => ({ ...p, home_address: e.target.value, home_latitude: null, home_longitude: null }))
                    setGeocodeInfo(null); setGeocodeError(null)
                  }}
                  placeholder="Ex : 12 rue de la Paix, 75002 Paris"
                  className={inputCls}
                />
                <button
                  type="button" onClick={handleGeocode}
                  disabled={!prof.home_address.trim() || geocoding}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors disabled:opacity-40 shrink-0"
                  title="Géocoder l'adresse"
                >
                  {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Géocoder
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Utilisée pour calculer la distance Haversine entre votre domicile et chaque école.</p>
              {geocodeInfo && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 flex items-start gap-1">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />{geocodeInfo}
                </p>
              )}
              {geocodeError && (
                <p className="text-xs text-guitar-400 mt-1.5 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{geocodeError}
                </p>
              )}
              {prof.home_latitude && (
                <p className="text-xs text-muted-foreground mt-1">
                  Coordonnées : {prof.home_latitude.toFixed(5)}, {prof.home_longitude?.toFixed(5)}
                </p>
              )}
            </div>

            {/* Zone scolaire */}
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Zone de vacances scolaires</label>
              <div className="space-y-2">
                {ZONES.map((z) => (
                  <button key={z.value} onClick={() => setZone(z.value)}
                    className={'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ' +
                      (zone === z.value
                        ? 'border-guitar-600/60 bg-guitar-600/10 text-foreground'
                        : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}
                  >
                    <div>
                      <p className="font-medium text-sm">{z.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{z.description}</p>
                    </div>
                    {zone === z.value && <Check className="w-4 h-4 text-guitar-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {(errorZone || errorProf) && (
              <p className="text-xs text-guitar-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />{errorZone ?? errorProf}
              </p>
            )}

            <button onClick={handleSaveZone} disabled={savingZone || savingProf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
            >
              {(savingZone || savingProf) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {(savingZone || savingProf) ? 'Sauvegarde…' : (savedZone || savedProf) ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        )}
      </section>

      {/* ── Fiche contact ─────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Phone className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Fiche contact</h2>
              <HelpTooltip texte="Ces coordonnées sont intégrées automatiquement dans l'en-tête de tous vos PDF (émargement, trajet, feuille de route) et dans les sondages envoyés aux familles." position="right" />
            </div>
            <p className="text-sm text-muted-foreground">Coordonnées réutilisées automatiquement dans les PDF, sondages et exports</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Téléphone */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Téléphone <span className="italic">(facultatif)</span>
            </label>
            <input
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              placeholder="Ex : +33 6 12 34 56 78"
              className={inputCls}
            />
          </div>

          {/* Email — non modifiable ici, géré par l'authentification Supabase */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Adresse e-mail</label>
            <input
              type="email"
              value={user?.email ?? ''}
              readOnly
              className={inputCls + ' opacity-60 cursor-not-allowed'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Non modifiable ici — changez-la depuis votre compte Supabase si nécessaire.
            </p>
          </div>

          {/* Liens de messagerie et partage */}
          <div className="border-t border-border-subtle pt-4 space-y-3">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-3">
              <Link className="w-3.5 h-3.5 text-guitar-400" />
              Liens de messagerie et partage <span className="font-normal text-muted-foreground">(facultatifs)</span>
            </p>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">WhatsApp</label>
              <input
                type="url"
                value={contact.whatsapp_link}
                onChange={(e) => setContact((c) => ({ ...c, whatsapp_link: e.target.value }))}
                placeholder="https://wa.me/33612345678"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Messenger</label>
              <input
                type="url"
                value={contact.messenger_link}
                onChange={(e) => setContact((c) => ({ ...c, messenger_link: e.target.value }))}
                placeholder="https://m.me/votre.pseudo"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Discord</label>
              <input
                type="url"
                value={contact.discord_link}
                onChange={(e) => setContact((c) => ({ ...c, discord_link: e.target.value }))}
                placeholder="https://discord.gg/votre-serveur"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Partage de fichiers</label>
              <input
                type="url"
                value={contact.cloud_share_link}
                onChange={(e) => setContact((c) => ({ ...c, cloud_share_link: e.target.value }))}
                placeholder="https://drive.google.com/… ou Dropbox, OneDrive…"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Utile pour partager des partitions ou des ressources pédagogiques avec les écoles.
              </p>
            </div>
          </div>

          {errorContact && (
            <p className="text-xs text-guitar-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />{errorContact}
            </p>
          )}

          <button onClick={handleSaveContact} disabled={savingContact}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
          >
            {savingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {savingContact ? 'Sauvegarde…' : savedContact ? 'Enregistré !' : 'Enregistrer'}
          </button>
        </div>
      </section>

      {/* ── Déplacement ──────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Motorbike className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Déplacement</h2>
            <p className="text-sm text-muted-foreground">Véhicule et carburant utilisés pour les indemnités kilométriques</p>
          </div>
        </div>

        {!profLoaded ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Moyen de transport */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Moyen de déplacement habituel</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VEHICLE_TYPES.map((v) => (
                  <button
                    key={v.value} type="button"
                    onClick={() => setProf((p) => ({ ...p, vehicle_type: v.value }))}
                    className={'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium text-center transition-colors ' +
                      (prof.vehicle_type === v.value
                        ? 'border-guitar-600/60 bg-guitar-600/10 text-guitar-400'
                        : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}
                  >
                    <v.icon className="w-4 h-4" />
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Type de carburant */}
            {showFuel && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Type de carburant</label>
                <div className="flex flex-wrap gap-2">
                  {FUEL_TYPES.map((f) => (
                    <button key={f.value} type="button"
                      onClick={() => setProf((p) => ({ ...p, fuel_type: f.value }))}
                      className={'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ' +
                        (prof.fuel_type === f.value
                          ? 'border-guitar-600/60 bg-guitar-600/10 text-guitar-400'
                          : 'border-border-subtle text-muted-foreground hover:bg-surface-overlay')}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Puissance fiscale */}
            {showFiscalCV && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Puissance fiscale</label>
                <div className="relative max-w-xs">
                  <input
                    type="number" min="1" max="20" step="1"
                    value={prof.fiscal_horsepower}
                    onChange={(e) => setProf((p) => ({ ...p, fiscal_horsepower: e.target.value }))}
                    placeholder="Ex : 5"
                    className={inputCls + ' pr-8'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">CV</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Indiquée sur votre carte grise (cases P.6 ou Q). Nécessaire pour le barème kilométrique voitures.</p>
              </div>
            )}

            {/* Consommation carburant */}
            {showFuel && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Consommation moyenne</label>
                <div className="relative max-w-xs">
                  <input
                    type="number" min="0" step="0.1"
                    value={prof.fuel_consumption_l_100km}
                    onChange={(e) => setProf((p) => ({ ...p, fuel_consumption_l_100km: e.target.value }))}
                    placeholder="Ex : 6,5"
                    className={inputCls + ' pr-16'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">L/100 km</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Optionnel. Utilisé pour une estimation du coût en carburant en complément des taux URSSAF.</p>
              </div>
            )}

            <button onClick={handleSaveProf} disabled={savingProf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
            >
              {savingProf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {savingProf ? 'Sauvegarde…' : savedProf ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        )}
      </section>

      {/* ── Rémunération ─────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Rémunération</h2>
            <p className="text-sm text-muted-foreground">Taux horaire et volume hebdomadaire utilisés dans les calculs de revenus</p>
          </div>
        </div>

        {!profLoaded ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Chargement…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Taux horaire par défaut */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Taux horaire par défaut</label>
              <div className="relative max-w-xs">
                <input
                  type="number" min="0" step="0.01"
                  value={prof.default_hourly_rate}
                  onChange={(e) => setProf((p) => ({ ...p, default_hourly_rate: e.target.value }))}
                  placeholder="Ex : 25,00"
                  className={inputCls + ' pr-8'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Pré-rempli lors de la création d'une nouvelle école. Peut être surchargé par école.</p>
            </div>

            {/* Volume horaire maximum hebdomadaire */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Plafond horaire hebdomadaire{' '}
                <span className="text-muted italic">(optionnel)</span>
              </label>
              <div className="relative max-w-xs">
                <input
                  type="number" min="0" step="0.5"
                  value={prof.weekly_max_hours}
                  onChange={(e) => setProf((p) => ({ ...p, weekly_max_hours: e.target.value }))}
                  placeholder="Ex : 30"
                  className={inputCls + ' pr-14'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">h/sem.</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Seuil au-delà duquel une alerte s'affiche dans le tableau de bord.</p>
            </div>

            {errorProf && (
              <p className="text-xs text-guitar-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />{errorProf}
              </p>
            )}

            <button onClick={handleSaveProf} disabled={savingProf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
            >
              {savingProf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {savingProf ? 'Sauvegarde…' : savedProf ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        )}
      </section>

      {/* ── Taux kilométriques ────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
              <Route className="w-4 h-4 text-guitar-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">Taux kilométriques</h2>
                <HelpTooltip texte="Ces barèmes sont utilisés dans la page Déplacements professionnels pour estimer le coût de chaque trajet en voiture, moto ou vélo." position="right" />
              </div>
              <p className="text-sm text-muted-foreground">Barèmes pour le calcul des indemnités de déplacement</p>
            </div>
          </div>
          {mileageLoaded && mileageRates.length === 0 && (
            <button
              onClick={handleSeedRates}
              disabled={savingRate}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
            >
              {savingRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Pré-remplir (barème URSSAF 2025)
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4 bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
          Ces taux sont indicatifs. Les valeurs pré-remplies sont basées sur le barème URSSAF 2025 — vérifiez auprès de votre administration fiscale ou de votre comptable.
        </p>

        {mileageError && (
          <p className="text-xs text-guitar-400 mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />{mileageError}
          </p>
        )}

        {!mileageLoaded ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Chargement…
          </div>
        ) : (
          <>
            {/* Tableau des taux */}
            {mileageRates.length > 0 && (
              <div className="rounded-xl border border-border-subtle overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left">
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Véhicule</th>
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">CV</th>
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Taux (€/km)</th>
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Libellé</th>
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mileageRates.map((r) => (
                      <tr key={r.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2.5 text-sm">{MILEAGE_VEHICLE_LABELS[r.vehicle_type] ?? r.vehicle_type}</td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground">{r.fiscal_cv ?? '—'}</td>
                        <td className="px-3 py-2.5 text-sm font-medium">{Number(r.rate_per_km).toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[180px]">{r.label ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingRate({ ...r })}
                              className="p-1.5 rounded-lg text-muted hover:text-foreground transition-colors"
                              title="Modifier"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteRate(r.id)}
                              className="p-1.5 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulaire d'édition / ajout */}
            {editingRate !== null ? (
              <div className="rounded-xl bg-surface-raised border border-border-subtle p-4 mb-4 space-y-3">
                <p className="text-xs font-medium text-foreground">{editingRate.id ? 'Modifier le taux' : 'Ajouter un taux'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Véhicule</label>
                    <select
                      value={editingRate.vehicle_type ?? ''}
                      onChange={(e) => setEditingRate((r) => ({ ...r, vehicle_type: e.target.value }))}
                      className={inputCls}
                    >
                      {Object.entries(MILEAGE_VEHICLE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">CV fiscaux</label>
                    <input
                      type="number" min="1" max="20"
                      value={editingRate.fiscal_cv ?? ''}
                      onChange={(e) => setEditingRate((r) => ({ ...r, fiscal_cv: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="—"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Taux (€/km)</label>
                    <input
                      type="number" min="0" step="0.0001"
                      value={editingRate.rate_per_km ?? ''}
                      onChange={(e) => setEditingRate((r) => ({ ...r, rate_per_km: e.target.value }))}
                      placeholder="0,0000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Année</label>
                    <input
                      type="number" min="2020" max="2030"
                      value={editingRate.year ?? new Date().getFullYear()}
                      onChange={(e) => setEditingRate((r) => ({ ...r, year: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Libellé</label>
                  <input
                    type="text"
                    value={editingRate.label ?? ''}
                    onChange={(e) => setEditingRate((r) => ({ ...r, label: e.target.value }))}
                    placeholder="Ex : Barème URSSAF 2025 – 5 CV"
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveRate(editingRate)}
                    disabled={savingRate || !editingRate.rate_per_km}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-50"
                  >
                    {savingRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditingRate(null)}
                    className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingRate({ vehicle_type: 'voiture', fiscal_cv: null, rate_per_km: '', label: '', year: new Date().getFullYear() })}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter un taux personnalisé
              </button>
            )}

            {/* Calculatrice kilométrique */}
            <div className="border-t border-border-subtle pt-4">
              <p className="text-xs font-medium text-foreground mb-3">Calculatrice de déplacement</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Distance</label>
                  <div className="relative w-32">
                    <input
                      type="number" min="0" step="0.1"
                      value={calcKm}
                      onChange={(e) => setCalcKm(e.target.value)}
                      placeholder="km"
                      className={inputCls + ' pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">km</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Véhicule</label>
                  <select
                    value={calcVehicle}
                    onChange={(e) => setCalcVehicle(e.target.value)}
                    className={inputCls + ' w-44'}
                  >
                    {Object.entries(MILEAGE_VEHICLE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                {calcVehicle === 'voiture' && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">CV fiscaux</label>
                    <input
                      type="number" min="1" max="20"
                      value={calcCV}
                      onChange={(e) => setCalcCV(e.target.value)}
                      placeholder="5"
                      className={inputCls + ' w-20'}
                    />
                  </div>
                )}
                {calcResult && (
                  <div className="px-4 py-2.5 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-sm font-medium text-guitar-400">
                    {calcResult.cost} € <span className="text-xs font-normal text-muted-foreground ml-1">({calcResult.rate} €/km)</span>
                  </div>
                )}
              </div>
              {calcKm && !calcResult && mileageRates.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">Aucun taux correspondant — ajoutez un taux pour ce type de véhicule.</p>
              )}
              {mileageRates.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">Aucun taux enregistré. Pré-remplissez avec le barème URSSAF ou ajoutez un taux manuellement.</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Apparence ─────────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Palette className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Apparence</h2>
            <p className="text-sm text-muted-foreground">Choisissez le thème visuel de l'application</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = theme === t.value
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value === 'personnalise' ? `personnalise:${customColor}` : t.value)}
                className={'flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors text-left ' +
                  (active
                    ? 'border-guitar-600/60 bg-guitar-600/10 text-foreground'
                    : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}
              >
                <span className="text-xl">{t.emoji}</span>
                <div className="self-start w-full">
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-guitar-400 self-start" />}
              </button>
            )
          })}
        </div>

        {/* Sélecteur de couleur pour le thème personnalisé */}
        {theme === 'personnalise' && (
          <div className="mt-4 flex items-center gap-4 p-4 rounded-xl bg-surface-raised border border-border-subtle">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Couleur d'accent</label>
              <input
                type="color"
                value={customColor}
                onChange={(e) => setTheme(`personnalise:${e.target.value}`)}
                className="w-14 h-10 rounded-lg border border-border-subtle cursor-pointer bg-transparent"
                title="Choisir la couleur d'accent"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Comment ça fonctionne</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cette couleur remplace l'accent principal (boutons, liens actifs, étoiles). Le fond reste sombre. La teinte choisie est appliquée en direct et sauvegardée automatiquement.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Navigation GPS ───────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Navigation className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Navigation GPS</h2>
            <p className="text-sm text-muted-foreground">Application utilisée pour les boutons de navigation vers les écoles dans le planning</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {[
            { value: 'google_maps', label: 'Google Maps',        description: 'Application par défaut sur la plupart des appareils' },
            { value: 'waze',        label: 'Waze',                description: 'Navigation communautaire avec trafic en temps réel' },
            { value: 'apple_maps',  label: 'Plans (Apple Maps)',  description: 'Intégré nativement sur iPhone, iPad et Mac' },
          ].map((app) => {
            const active = navApp === app.value
            return (
              <button
                key={app.value}
                type="button"
                onClick={() => { setNavAppState(app.value); handleSaveNavApp(app.value) }}
                disabled={savingNav}
                className={'flex flex-col gap-1 p-3 rounded-xl border text-left transition-colors ' +
                  (active
                    ? 'border-guitar-600/60 bg-guitar-600/10 text-foreground'
                    : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}
              >
                <p className="text-sm font-medium">{app.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{app.description}</p>
                {active && <Check className="w-3.5 h-3.5 text-guitar-400 mt-0.5" />}
              </button>
            )
          })}
        </div>
        {savedNav && (
          <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />Préférence enregistrée.
          </p>
        )}
      </section>

      {/* ── Priorisation des écoles ───────────────────────────────────────────── */}
      <section id={PRIORISATION_SECTION_ID} className="glass-panel rounded-2xl p-6 scroll-mt-4">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-guitar-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">Priorisation des écoles</h2>
                <HelpTooltip texte="Ces poids modifient le classement en temps réel dans la liste des Écoles, le Comparatif et le Simulateur. Un critère à 0 est ignoré." position="right" />
              </div>
              <p className="text-sm text-muted-foreground">Réglez l'importance de chaque critère dans le classement de vos écoles</p>
            </div>
          </div>
          {/* Effet immédiat visible : accès direct au classement et au comparatif
              pour voir le résultat d'un changement de curseur. Icônes reprises
              telles quelles de SchoolsPage.jsx / SchoolsComparativePage.jsx. */}
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => navigate('/admin/ecoles/liste')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
            >
              <School className="w-3.5 h-3.5" />
              Voir le classement
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/ecoles/comparatif')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
            >
              <TableProperties className="w-3.5 h-3.5" />
              Voir le comparatif
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-5 bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
          Plus un curseur est élevé, plus ce critère pèse dans le score de chaque école. Ajustez-les selon ce qui compte le plus pour vous en ce moment — il n'y a pas de réglage universel, seulement le vôtre.
        </p>

        <div className="space-y-4">
          {SCORE_WEIGHT_SLIDERS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <span className="text-xs font-medium text-guitar-400">{weights[key]}</span>
              </div>
              <input
                type="range" min="0" max="100" step="5"
                value={weights[key]}
                onChange={(e) => updateWeight(key, Number(e.target.value))}
                onPointerUp={handleSaveWeights}
                onKeyUp={handleSaveWeights}
                className="w-full accent-guitar-600"
              />
            </div>
          ))}
        </div>

        {(savingWeights || savedWeights) && (
          <p className="text-xs mt-3 flex items-center gap-1 text-muted-foreground">
            {savingWeights
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sauvegarde…</>
              : <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Pondération enregistrée.</span>
            }
          </p>
        )}
      </section>

      {/* ── Préférences de planification (Planning intelligent) ───────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Préférences de planification</h2>
              <HelpTooltip texte="Ces préférences influencent le score des propositions du Planning intelligent. Elles n'éliminent jamais une proposition : un créneau sur un jour à éviter reste proposé, mais moins bien classé." position="right" />
            </div>
            <p className="text-sm text-muted-foreground">Jours à éviter et jour de proximité préféré</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Jours à éviter */}
          <div>
            <p className="text-sm font-medium mb-2">
              Jours à éviter
              <span className="ml-2 text-xs text-muted-foreground font-normal">— malus de −2 pts dans le Planning intelligent</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((jour) => {
                const actif = isDayOff(jour)
                return (
                  <button
                    key={jour}
                    type="button"
                    onClick={() => toggleDayOff(jour)}
                    className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                      actif
                        ? 'bg-guitar-600/15 border-guitar-600/40 text-guitar-400'
                        : 'border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
                    }`}
                  >
                    {actif ? '✕ ' : ''}{jour}
                  </button>
                )
              })}
            </div>
            {/* Détail de chaque jour sélectionné : toute la journée ou plage horaire */}
            {preferredDaysOff.length > 0 && (
              <div className="space-y-2">
                {preferredDaysOff.map((pref) => (
                  <div key={pref.jour} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle">
                    <span className="text-sm font-medium text-guitar-400 w-20 shrink-0">{pref.jour}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDayMode(pref.jour, 'toute_la_journee')}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                          pref.mode === 'toute_la_journee'
                            ? 'bg-guitar-600/15 border-guitar-600/40 text-guitar-400'
                            : 'border-border-subtle text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Toute la journée
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayMode(pref.jour, 'plage')}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                          pref.mode === 'plage'
                            ? 'bg-guitar-600/15 border-guitar-600/40 text-guitar-400'
                            : 'border-border-subtle text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Plage horaire
                      </button>
                    </div>
                    {pref.mode === 'plage' && (
                      <div className="flex items-center gap-2 ml-auto">
                        <input
                          type="time"
                          value={pref.heure_debut ?? '08:00'}
                          onChange={(e) => setDayTime(pref.jour, 'heure_debut', e.target.value)}
                          className={inputCls + ' w-28 py-1 text-sm'}
                        />
                        <span className="text-xs text-muted-foreground">à</span>
                        <input
                          type="time"
                          value={pref.heure_fin ?? '20:00'}
                          onChange={(e) => setDayTime(pref.jour, 'heure_fin', e.target.value)}
                          className={inputCls + ' w-28 py-1 text-sm'}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Jours de proximité préférée */}
          <div>
            <p className="text-sm font-medium mb-1">
              Jours de proximité préférée
              <span className="ml-2 text-xs text-muted-foreground font-normal">— bonus de +1 pt pour les écoles proches du domicile ces jours (seuil : 20 km)</span>
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Les jours sélectionnés, les écoles situées à moins de 20 km de votre domicile seront favorisées dans les propositions. Pratique pour les jours sans voiture ou à proximité de chez vous.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((jour) => {
                const actif = preferredProximityDays.includes(jour)
                return (
                  <button
                    key={jour}
                    type="button"
                    onClick={() => toggleProximityDay(jour)}
                    className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                      actif
                        ? 'bg-guitar-600/15 border-guitar-600/40 text-guitar-400'
                        : 'border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
                    }`}
                  >
                    {actif ? '✓ ' : ''}{jour}
                  </button>
                )
              })}
            </div>
          </div>

          {errorPrefs && (
            <p className="text-xs text-guitar-400">{errorPrefs}</p>
          )}

          <button
            type="button"
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-40"
          >
            {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : savedPrefs ? <Check className="w-4 h-4" /> : null}
            {savedPrefs ? 'Enregistré' : 'Enregistrer les préférences'}
          </button>
        </div>
      </section>

      {/* ── Abonnement calendrier ─────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Abonnement au calendrier</h2>
            <p className="text-sm text-muted-foreground">Ajoutez vos cours directement dans Google Calendar, Apple Calendrier ou tout autre agenda</p>
          </div>
        </div>

        {!calendarToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Générez votre lien d'abonnement personnel pour suivre vos cours en temps réel dans votre agenda préféré.
              Ce lien est unique et privé — ne le partagez pas.
            </p>
            <button
              type="button"
              onClick={handleGenerateCalendarToken}
              disabled={generatingToken}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
            >
              {generatingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              Générer mon lien d'abonnement
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Votre lien d'abonnement</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-xs font-mono break-all select-all">
                  {calendarIcsUrl(calendarToken)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCalendarUrl}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
                  title="Copier le lien"
                >
                  {copiedCal ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copiedCal ? 'Copié !' : 'Copier'}
                </button>
              </div>
            </div>

            <div className="px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-1">Comment utiliser ce lien ?</p>
              <p>• <strong>Google Calendar</strong> : Autres agendas → Via l'URL → collez le lien</p>
              <p>• <strong>Apple Calendrier</strong> (Mac) : Fichier → Nouvel abonnement → collez le lien</p>
              <p>• <strong>iPhone / iPad</strong> : Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Abonnement Calendrier</p>
              <p>• <strong>Outlook</strong> : Ajouter un calendrier → S'abonner à partir du Web → collez le lien</p>
              <p className="text-xs text-muted mt-1 pt-1 border-t border-border-subtle">
                Le calendrier se met à jour automatiquement. Tous vos cours planifiés y apparaissent.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateCalendarToken}
              disabled={generatingToken}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {generatingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Révoquer et générer un nouveau lien
            </button>
          </div>
        )}
      </section>

    </div>
  )
}
