// ─── ObjectivesPage.jsx ──────────────────────────────────────────────────────
//
// Page fusionnée Objectifs + Simulateur de répartition.
//
// Choix d'architecture : ObjectivesPage.jsx comme base (pas SimulationPage.jsx)
// car les objectifs sont l'INPUT qui pilote le simulateur — les saisir en haut
// et voir l'effet immédiatement en dessous est la lecture naturelle du flux.
//
// Règle clé : le simulateur ne se recalcule QU'APRÈS l'enregistrement explicite
// des objectifs (clic sur "Enregistrer"). L'état `savedObjectives` est distinct
// de l'état `form` (édition en cours) — le simulateur n'observe que le premier.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Euro, Clock, Car, Save, Loader2, Check, AlertCircle,
  ChevronDown, BarChart2, Target, TrendingUp, Star, Info,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import HelpTooltip from '../components/HelpTooltip'
import { currentSchoolYear, allSchoolYears } from '../context/PeriodContext'
import {
  fetchSchoolsOverview,
  calculerRendementHoraireNetReel,
} from '../services/schools'
import {
  calculerRevenuMensuelEcole, determinerTypeLissage,
} from '../utils/revenueEcole'
import {
  repartirHeuresSelonPriorite,
  bornesRealistesEcole,
  GAIN_MAX_REALISTE_HEBDO,
  PERTE_MAX_REALISTE_HEBDO,
  GRANULARITE_HEURES,
  HOURS_STABILITY_FIXE,
} from '../utils/repartitionHeures'

// ─── Constantes ───────────────────────────────────────────────────────────────

const SCHOOL_YEARS = allSchoolYears()

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'

// ─── Sous-composants UI (objectifs) ───────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, help }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {help && <HelpTooltip texte={help} position="right" />}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
        {hint && <span className="ml-1 font-normal text-muted/70">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Sous-composants UI (simulateur) ──────────────────────────────────────────

function fmtHeures(h) {
  if (h == null || isNaN(h)) return '—'
  const heures  = Math.floor(h)
  const minutes = Math.round((h - heures) * 60)
  return minutes === 0 ? `${heures}h` : `${heures}h${String(minutes).padStart(2, '0')}`
}

function fmt(v, suffix = '', digits = 0) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (suffix ? ' ' + suffix : '')
}

function ScoreDots({ score }) {
  if (score == null) return <span className="text-xs text-muted italic">Non évalué</span>
  const full    = Math.floor(score)
  const partial = score - full
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${
            i <= full ? 'text-guitar-400 fill-guitar-400'
            : i === full + 1 && partial >= 0.3 ? 'text-guitar-400/50 fill-guitar-400/40'
            : 'text-border'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{score.toFixed(1)}</span>
    </span>
  )
}

function StatSim({ icon: Icon, label, value, highlight }) {
  const valueColor = highlight === 'warn' ? 'text-amber-400'
    : highlight === 'ok'   ? 'text-green-400'
    : 'text-foreground'
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className={`text-sm font-medium ${valueColor}`}>{value}</span>
      </div>
    </div>
  )
}

// ─── Couche revenu (enrichit les écoles issues de repartirHeuresSelonPriorite) ──
//
// Séparée de la répartition pour garder chaque couche pure et testable
// indépendamment : répartition d'heures vs calcul de revenu mensuel calendaire.
// N'est appelée qu'avec les objectifs ENREGISTRÉS, jamais pendant la saisie.

/**
 * Revenu mensuel estimé d'une école pour un volume hebdomadaire donné.
 * Extraite pour être réutilisée hors de `simuler` : ajustement manuel
 * (Tâche 2) et recherche de budget par objectif (Tâche 1) en ont besoin
 * indépendamment de la boucle de répartition.
 *
 * @param {object} school - école (taux, lissage, zone, prime)
 * @param {number|null} heuresHebdo
 * @param {{schoolYear, teacherZone}} opts
 * @returns {number|null}
 */
function estimerRevenuEcole(school, heuresHebdo, { schoolYear, teacherZone }) {
  const tauxRetenu = school.netHourlyYieldReal ?? school.currentNetRate
  if (!tauxRetenu || heuresHebdo == null || heuresHebdo <= 0) return null
  const zone        = school.vacation_zone_override ?? teacherZone ?? 'B'
  const typeLissage = determinerTypeLissage(school.payment_smoothing, school.payment_duration)
  return calculerRevenuMensuelEcole({
    heuresHebdo,
    tauxHoraire:   tauxRetenu,
    typeLissage,
    anneeScolaire: schoolYear,
    zone,
    primeAnnuelle: school.estimated_annual_bonus ?? 0,
  })
}

function sommeRevenu(ecoles) {
  return ecoles.reduce((acc, s) => acc + (s.revenuMensuelEstime ?? 0), 0)
}

/**
 * @param {Array}  schools       - écoles enrichies par repartirHeuresSelonPriorite
 * @param {number} plafondHebdo  - plafond total (passé tel quel à repartir)
 * @param {{schoolYear, teacherZone, diversification}} opts
 * @returns {{ ecoles, heuresDistribuees, heuresMaxAtteignables, budgetNonDistribue }}
 */
function simuler(schools, plafondHebdo, { schoolYear, teacherZone, diversification = 0 } = {}) {
  const vide = {
    ecoles: schools.map((s) => ({
      ...s, heuresHebdoProposees: null, volumeFixe: false,
      revenuMensuelEstime: null, sousPlancherRealiste: false,
    })),
    heuresDistribuees: 0, heuresMaxAtteignables: 0, budgetNonDistribue: 0,
  }
  if (!schools.length || !plafondHebdo) return vide

  const { ecoles: avecHeures, heuresDistribuees, heuresMaxAtteignables, budgetNonDistribue }
    = repartirHeuresSelonPriorite(schools, plafondHebdo, diversification)

  const ecoles = avecHeures.map((s) => ({
    ...s,
    revenuMensuelEstime: estimerRevenuEcole(s, s.heuresHebdoProposees, { schoolYear, teacherZone }),
  }))

  return { ecoles, heuresDistribuees, heuresMaxAtteignables, budgetNonDistribue }
}

// ─── Tâche 1 : simulation pilotée par le seul objectif financier ──────────────
//
// Quand aucun plafond hebdomadaire n'est défini, on ne peut pas passer un
// budget à `repartirHeuresSelonPriorite` : on cherche au contraire le plus
// petit budget hebdomadaire qui atteint le revenu cible. La répartition
// étant construite en round-robin cumulatif (voir repartitionHeures.js),
// le total d'heures — et donc le revenu, à taux positif — croît de façon
// monotone avec le budget : une recherche dichotomique est donc valide.

/**
 * @param {Array}  schools - écoles candidates (déjà filtrées si besoin)
 * @param {number} cible   - revenu mensuel net visé, en euros
 * @param {{schoolYear, teacherZone, diversification}} opts
 * @returns {{ simulation, budgetUtilise: number, objectifAtteint: boolean }}
 */
function trouverBudgetPourObjectif(schools, cible, opts) {
  const Qr = Math.round(1 / GRANULARITE_HEURES)

  // Borne supérieure : somme des plafonds réalistes de toutes les écoles.
  const budgetMaxHebdo = schools.reduce((acc, s) => {
    if (s.hours_stability === HOURS_STABILITY_FIXE) return acc + (s.current_weekly_hours ?? 0)
    return acc + bornesRealistesEcole(s).max
  }, 0)

  // Cible déjà atteinte (ex. par des écoles ajustées manuellement en amont) :
  // on n'alloue aucune heure supplémentaire à ces écoles, la répartition s'arrête.
  if (cible <= 0) {
    return { simulation: simuler(schools, 0, opts), budgetUtilise: 0, objectifAtteint: true }
  }
  if (budgetMaxHebdo <= 0) {
    return { simulation: simuler(schools, 0, opts), budgetUtilise: 0, objectifAtteint: false }
  }

  const simulationMax = simuler(schools, budgetMaxHebdo, opts)
  if (sommeRevenu(simulationMax.ecoles) < cible) {
    // Objectif inatteignable même en maximisant : on propose le maximum réaliste.
    return { simulation: simulationMax, budgetUtilise: budgetMaxHebdo, objectifAtteint: false }
  }

  // Recherche dichotomique du budget minimal (en quarts d'heure) atteignant la cible.
  let lo = 0
  let hi = Math.round(budgetMaxHebdo * Qr)
  while (lo < hi) {
    const mid    = Math.floor((lo + hi) / 2)
    const revenu = sommeRevenu(simuler(schools, mid / Qr, opts).ecoles)
    if (revenu >= cible) hi = mid
    else lo = mid + 1
  }

  const budgetUtilise = hi / Qr
  return { simulation: simuler(schools, budgetUtilise, opts), budgetUtilise, objectifAtteint: true }
}

// ─── Orchestration : plafond normal / objectif seul + ajustements manuels ─────
//
// Point d'entrée unique du simulateur. Compose les trois mécanismes :
//   • Tâche 1 : pas de plafond enregistré → recherche par objectif financier.
//   • Tâche 2 : écoles ajustées manuellement, en mode interactif, retirées du
//     moteur et traitées comme des volumes fixes temporaires — le reste du
//     budget est redistribué normalement aux autres écoles flexibles. En mode
//     indépendant, le moteur tourne sans elles ; leur valeur est simplement
//     superposée à l'affichage après coup, sans toucher les autres écoles.
//   • Tâche 3 : gérée en amont par l'appelant via `schools` (desired_weekly_hours
//     déjà neutralisé pour les écoles concernées avant l'appel).
//
// @param {{schools, plafond, cible, manualOverrides, ajustementMode, diversification, schoolYear, teacherZone}} params
// @returns {{ ecoles, heuresDistribuees, heuresMaxAtteignables, budgetNonDistribue, mode, objectifAtteint, budgetUtilise }}
function calculerSimulation({
  schools, plafond, cible, manualOverrides, ajustementMode,
  diversification, schoolYear, teacherZone,
}) {
  const opts = { schoolYear, teacherZone, diversification }

  const overridesActifs = Object.fromEntries(
    Object.entries(manualOverrides).filter(([, v]) => v != null)
  )
  // Mode interactif : les écoles ajustées manuellement sortent du moteur de
  // répartition (traitées comme une contrainte fixe temporaire) ; leur budget
  // est déduit avant de redistribuer le reste aux autres écoles flexibles.
  const idsExclusInteractif = ajustementMode === 'interactif' ? new Set(Object.keys(overridesActifs)) : new Set()

  const schoolsMoteur  = schools.filter((s) => !idsExclusInteractif.has(String(s.id)))
  const schoolsExclues = schools.filter((s) => idsExclusInteractif.has(String(s.id)))
  const budgetExclu    = schoolsExclues.reduce((acc, s) => acc + overridesActifs[s.id], 0)

  let base
  let mode = 'normal'
  let objectifAtteint = null
  let budgetUtilise = plafond

  if (plafond) {
    base = simuler(schoolsMoteur, Math.max(0, plafond - budgetExclu), opts)
  } else if (cible) {
    mode = 'objectif-seul'
    const revenuDejaAcquis = schoolsExclues.reduce(
      (acc, s) => acc + (estimerRevenuEcole(s, overridesActifs[s.id], opts) ?? 0), 0
    )
    const recherche = trouverBudgetPourObjectif(schoolsMoteur, Math.max(0, cible - revenuDejaAcquis), opts)
    base            = recherche.simulation
    objectifAtteint = recherche.objectifAtteint
    budgetUtilise   = recherche.budgetUtilise + budgetExclu
  } else {
    mode = 'vide'
    base = simuler(schoolsMoteur, null, opts)
  }

  let ecoles = [
    ...base.ecoles,
    ...schoolsExclues.map((s) => ({
      ...s,
      heuresHebdoProposees: overridesActifs[s.id],
      volumeFixe:           false,
      ajustementManuel:     true,
      sousPlancherRealiste: false,
      revenuMensuelEstime:  estimerRevenuEcole(s, overridesActifs[s.id], opts),
    })),
  ]

  // Mode indépendant : le moteur ci-dessus a tourné avec toutes les écoles,
  // sans tenir compte des ajustements. On superpose juste l'affichage.
  if (ajustementMode === 'independant') {
    ecoles = ecoles.map((s) => {
      const ov = overridesActifs[s.id]
      if (ov == null) return s
      return {
        ...s,
        heuresHebdoProposees: ov,
        ajustementManuel:     true,
        sousPlancherRealiste: false,
        revenuMensuelEstime:  estimerRevenuEcole(s, ov, opts),
      }
    })
  }

  return {
    ecoles,
    heuresDistribuees:     ecoles.reduce((acc, s) => acc + (s.heuresHebdoProposees ?? 0), 0),
    heuresMaxAtteignables: base.heuresMaxAtteignables + budgetExclu,
    budgetNonDistribue:    base.budgetNonDistribue,
    mode,
    objectifAtteint,
    budgetUtilise,
  }
}

// ─── Contrôle d'ajustement manuel (Tâche 2) ────────────────────────────────────
//
// État de saisie local (texte brut) séparé de la valeur validée pour permettre
// à l'utilisateur de taper librement ; le clampage aux bornes réalistes se
// fait à la validation (blur), jamais pendant la frappe.

function ManualHoursInput({ bornes, valeurActuelle, onChange, onReset }) {
  const [texte, setTexte] = useState(valeurActuelle != null ? String(valeurActuelle) : '')
  const [messageBorne, setMessageBorne] = useState('')

  useEffect(() => {
    setTexte(valeurActuelle != null ? String(valeurActuelle) : '')
  }, [valeurActuelle])

  const valider = (brut) => {
    if (brut === '') { onReset(); setMessageBorne(''); return }
    const val = parseFloat(brut)
    if (isNaN(val)) return
    if (val > bornes.max) {
      onChange(bornes.max)
      setMessageBorne(`Plafond réaliste atteint (+${GAIN_MAX_REALISTE_HEBDO} h max) — bloqué à ${fmtHeures(bornes.max)}.`)
    } else if (val < bornes.min) {
      onChange(bornes.min)
      setMessageBorne(`Plancher réaliste atteint (−${PERTE_MAX_REALISTE_HEBDO} h max) — bloqué à ${fmtHeures(bornes.min)}.`)
    } else {
      onChange(val)
      setMessageBorne('')
    }
  }

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          type="number" min={bornes.min} max={bornes.max} step={GRANULARITE_HEURES}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={(e) => valider(e.target.value)}
          placeholder="ajuster (h)"
          className={inputCls + ' py-1.5 text-xs w-24'}
        />
        <span className="text-xs text-muted">/ sem.</span>
        {valeurActuelle != null && (
          <button
            type="button"
            onClick={() => { onReset(); setTexte(''); setMessageBorne('') }}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </div>
      {messageBorne && <p className="text-xs text-amber-400 mt-1">{messageBorne}</p>}
    </div>
  )
}

// ─── Ligne école dans le tableau de simulation ────────────────────────────────

function SchoolRow({
  school, plafond, manualOverride, onChangeManualOverride, onResetManualOverride,
  ignorePlafond, onToggleIgnorePlafond,
}) {
  const navigate = useNavigate()
  const {
    name, priorityScore, heuresHebdoProposees, revenuMensuelEstime,
    currentNetRate, netHourlyYieldReal, volumeFixe, weekly_presence_days,
    sousPlancherRealiste, ajustementManuel, desired_weekly_hours,
    desired_weekly_hours_original, hours_stability,
  } = school

  const pct = plafond && heuresHebdoProposees
    ? Math.round((heuresHebdoProposees / plafond) * 100) : 0
  const fiabiliteReduite = currentNetRate != null && netHourlyYieldReal != null
    && netHourlyYieldReal !== currentNetRate
  // Une école est ajustable manuellement si elle participe à la répartition
  // flexible (score connu, pas de volume contractuel fixe).
  const estAjustable = hours_stability !== HOURS_STABILITY_FIXE && priorityScore != null
  // Le plafond souhaité "réel" reste affichable même quand la Tâche 3 l'a
  // neutralisé (desired_weekly_hours mis à null) pour le calcul en cours.
  const desiredWeeklyHoursAffiche = desired_weekly_hours ?? desired_weekly_hours_original

  return (
    <div
      className="px-5 py-4 cursor-pointer hover:bg-surface-overlay transition-colors"
      onClick={() => navigate(`/admin/ecoles/${school.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/ecoles/${school.id}`)}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate hover:text-guitar-400 transition-colors">{name}</p>
            {volumeFixe && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                🔒 Fixe
              </span>
            )}
            {sousPlancherRealiste && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-guitar-600/10 text-guitar-400 border border-guitar-600/20 shrink-0"
                title={`Budget insuffisant pour atteindre le plancher réaliste (−${PERTE_MAX_REALISTE_HEBDO} h maxi)`}>
                ↓ sous le plancher
              </span>
            )}
            {ajustementManuel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0"
                title="Volume fixé à la main pour cette simulation">
                ✋ Ajusté manuellement
              </span>
            )}
            {ignorePlafond && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0"
                title="Le plafond souhaité de la fiche école est ignoré pour cette simulation">
                🔓 Plafond ignoré
              </span>
            )}
          </div>
          {!volumeFixe && <ScoreDots score={priorityScore} />}
          {volumeFixe && (
            <p className="text-xs text-muted-foreground mt-0.5">Volume contractuel non-négociable</p>
          )}
          {weekly_presence_days != null && (
            <p className="text-xs text-muted mt-0.5">{weekly_presence_days} j / sem.</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {heuresHebdoProposees != null ? (
            <p className="text-sm font-semibold text-foreground">
              {revenuMensuelEstime != null
                ? `${fmtHeures(heuresHebdoProposees)} / sem. → ${fmt(revenuMensuelEstime, '€ / mois')}`
                : `${fmtHeures(heuresHebdoProposees)} / sem.`}
            </p>
          ) : volumeFixe ? (
            <span className="text-xs text-amber-400 italic">Volume fixe — à renseigner dans la fiche</span>
          ) : (
            <span className="text-muted italic text-xs">Non évalué</span>
          )}
          {fiabiliteReduite && (
            <p className="text-xs text-muted italic" title="Revenu déjà réduit du risque d'annulation non rattrapée">
              ≈ {fmt(netHourlyYieldReal, '€/h réel', 2)} (saisi : {fmt(currentNetRate, '€/h', 2)})
            </p>
          )}
          {heuresHebdoProposees != null && heuresHebdoProposees > 0 && !netHourlyYieldReal && (
            <p className="text-xs text-muted italic">Taux inconnu</p>
          )}
        </div>
      </div>

      {heuresHebdoProposees != null && heuresHebdoProposees > 0 && (
        <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
          <div
            className={`h-full rounded-full ${volumeFixe ? 'bg-amber-500/60' : 'guitar-gradient'}`}
            style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
          />
        </div>
      )}

      {estAjustable && (
        <ManualHoursInput
          bornes={bornesRealistesEcole(school)}
          valeurActuelle={manualOverride}
          onChange={(val) => onChangeManualOverride(school.id, val)}
          onReset={() => onResetManualOverride(school.id)}
        />
      )}

      {estAjustable && desiredWeeklyHoursAffiche != null && (
        <label
          className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground cursor-pointer select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={!!ignorePlafond}
            onChange={() => onToggleIgnorePlafond(school.id)}
            className="accent-guitar-600"
          />
          Ignorer le plafond souhaité de la fiche ({fmtHeures(desiredWeeklyHoursAffiche)}) pour cette simulation
        </label>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ObjectivesPage() {
  const { user } = useAuth()
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear())

  // ── État du formulaire (ce que l'utilisateur est en train de saisir) ────────
  const [form, setForm] = useState({
    revenu_mensuel_cible:     '',
    plafond_heures_hebdo:     '',
    budget_km_mensuel:        '',
    budget_carburant_mensuel: '',
    notes:                    '',
  })

  // ── Objectifs ENREGISTRÉS : seule source de vérité du simulateur ─────────
  // Mis à jour uniquement après un enregistrement réussi, jamais pendant la
  // saisie — évite les recalculs incessants pendant que l'utilisateur tape.
  const [savedObjectives, setSavedObjectives] = useState(null)

  // ── État des écoles pour le simulateur ──────────────────────────────────────
  const [schools,     setSchools]     = useState([])
  const [teacherZone, setTeacherZone] = useState('B')
  const [schoolsLoading, setSchoolsLoading] = useState(true)

  // ── État UI ──────────────────────────────────────────────────────────────────
  const [loading,         setLoading]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [error,           setError]           = useState('')
  // Curseur de diversification (0 = concentré, 100 = diversifié).
  // Paramètre de simulation uniquement — non sauvegardé en base.
  const [diversification, setDiversification] = useState(0)

  // ── Paramètres de simulation (Tâches 2 & 3) — jamais persistés en base ───────
  // Mode d'ajustement manuel : 'interactif' (défaut) redistribue les autres
  // écoles flexibles à chaque ajustement ; 'independant' isole l'ajustement.
  const [ajustementMode,   setAjustementMode]   = useState('interactif')
  // Volumes hebdomadaires fixés à la main, par id d'école : { [schoolId]: heures }
  const [manualOverrides,  setManualOverrides]  = useState({})
  // Écoles dont le plafond souhaité (desired_weekly_hours) est neutralisé
  // pour cette simulation uniquement : { [schoolId]: true }
  const [ignorePlafondIds, setIgnorePlafondIds] = useState({})

  // ── Chargement initial : objectifs + écoles + zone du prof ──────────────────

  useEffect(() => {
    if (!user?.id) return

    setLoading(true)
    setSchoolsLoading(true)
    setError('')

    Promise.all([
      supabase
        .from('objectives')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('school_year', schoolYear)
        .maybeSingle(),
      fetchSchoolsOverview(user.id),
      supabase
        .from('profiles')
        .select('school_zone')
        .eq('id', user.id)
        .maybeSingle(),
    ])
      .then(([{ data: obj, error: objErr }, schoolData, { data: prof }]) => {
        if (objErr) throw new Error(objErr.message)

        // Formulaire et objectifs enregistrés — même valeur au chargement
        const objFields = obj ? {
          revenu_mensuel_cible:     obj.revenu_mensuel_cible     ?? '',
          plafond_heures_hebdo:     obj.plafond_heures_hebdo     ?? '',
          budget_km_mensuel:        obj.budget_km_mensuel        ?? '',
          budget_carburant_mensuel: obj.budget_carburant_mensuel ?? '',
          notes:                    obj.notes                    ?? '',
        } : { revenu_mensuel_cible: '', plafond_heures_hebdo: '', budget_km_mensuel: '', budget_carburant_mensuel: '', notes: '' }

        setForm(objFields)
        setSavedObjectives(obj ?? null)
        setSchools(schoolData)
        if (prof?.school_zone) setTeacherZone(prof.school_zone)
        // Écoles rechargées : les ajustements de simulation de l'année
        // précédente ne sont plus pertinents.
        setManualOverrides({})
        setIgnorePlafondIds({})
      })
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); setSchoolsLoading(false) })
  }, [user?.id, schoolYear])

  // ── Handlers formulaire ──────────────────────────────────────────────────────

  const f = (key) => (e) => { setForm((p) => ({ ...p, [key]: e.target.value })); setSaved(false) }

  const revenuAnnuel = form.revenu_mensuel_cible
    ? (parseFloat(form.revenu_mensuel_cible) * 12).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
    : null

  // ── Sauvegarde (UPSERT) — met à jour savedObjectives après succès ────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.id) return
    setSaving(true)
    setError('')
    setSaved(false)

    const payload = {
      teacher_id:               user.id,
      school_year:              schoolYear,
      revenu_mensuel_cible:     form.revenu_mensuel_cible     !== '' ? parseFloat(form.revenu_mensuel_cible)     : null,
      plafond_heures_hebdo:     form.plafond_heures_hebdo     !== '' ? parseFloat(form.plafond_heures_hebdo)     : null,
      budget_km_mensuel:        form.budget_km_mensuel        !== '' ? parseInt(form.budget_km_mensuel, 10)      : null,
      budget_carburant_mensuel: form.budget_carburant_mensuel !== '' ? parseFloat(form.budget_carburant_mensuel) : null,
      notes:                    form.notes || null,
    }

    const { error: err } = await supabase
      .from('objectives')
      .upsert(payload, { onConflict: 'teacher_id,school_year' })

    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      // Déclenche le recalcul du simulateur UNIQUEMENT ici, après enregistrement
      setSavedObjectives(payload)
    }
    setSaving(false)
  }

  // ── Tâche 3 : neutralise desired_weekly_hours des écoles marquées "ignorer" ──
  // La valeur d'origine est conservée sous une autre clé pour rester affichable
  // (la fiche école en base n'est elle-même jamais modifiée).
  const effectiveSchools = useMemo(() => schools.map((s) => (
    ignorePlafondIds[s.id]
      ? { ...s, desired_weekly_hours: null, desired_weekly_hours_original: s.desired_weekly_hours }
      : s
  )), [schools, ignorePlafondIds])

  // Bornes réalistes courantes par école (tiennent compte de la Tâche 3).
  const bornesParEcole = useMemo(() => Object.fromEntries(
    effectiveSchools.map((s) => [s.id, bornesRealistesEcole(s)])
  ), [effectiveSchools])

  // Garde-fou Tâche 2 : si les bornes se resserrent pendant qu'un ajustement
  // manuel est actif (ex. désactivation du toggle Tâche 3), on le re-clampe
  // silencieusement — les bornes réalistes restent TOUJOURS respectées.
  useEffect(() => {
    setManualOverrides((prev) => {
      let changed = false
      const next = {}
      for (const [id, val] of Object.entries(prev)) {
        const bornes = bornesParEcole[id]
        if (!bornes) { next[id] = val; continue }
        const clamped = Math.min(Math.max(val, bornes.min), bornes.max)
        next[id] = clamped
        if (clamped !== val) changed = true
      }
      return changed ? next : prev
    })
  }, [bornesParEcole])

  const plafondBrut = savedObjectives?.plafond_heures_hebdo ? parseFloat(savedObjectives.plafond_heures_hebdo) : null
  const cible        = savedObjectives?.revenu_mensuel_cible  ? parseFloat(savedObjectives.revenu_mensuel_cible)  : null

  // ── Simulation (mémorisée sur les objectifs ENREGISTRÉS et les paramètres) ───
  // Le curseur de diversification et les ajustements manuels réagissent
  // immédiatement, sans enregistrement des objectifs.

  const simulation = useMemo(() => calculerSimulation({
    schools: effectiveSchools,
    plafond: plafondBrut,
    cible,
    manualOverrides,
    ajustementMode,
    diversification,
    schoolYear,
    teacherZone,
  }), [effectiveSchools, plafondBrut, cible, manualOverrides, ajustementMode, diversification, schoolYear, teacherZone])

  const totaux = useMemo(() => ({
    hTotal: simulation.ecoles.reduce((acc, s) => acc + (s.heuresHebdoProposees ?? 0), 0),
    rTotal: simulation.ecoles.reduce((acc, s) => acc + (s.revenuMensuelEstime  ?? 0), 0),
  }), [simulation])

  const manque = cible && totaux.rTotal ? cible - totaux.rTotal : null

  // Plafond "effectif" pour la barre de progression et les libellés : le
  // plafond enregistré, ou à défaut le budget trouvé par la recherche
  // d'objectif (Tâche 1) — jamais null tant qu'une simulation tourne.
  const plafondEffectif = plafondBrut || simulation.budgetUtilise || null

  // Heures que les bornes réalistes ne permettent pas d'absorber (toutes les écoles à plafond).
  const { budgetNonDistribue, heuresMaxAtteignables } = simulation

  // Écoles flexibles éligibles à la répartition automatique (score connu, pas
  // de volume fixe, pas déjà sorties du moteur par un ajustement manuel interactif).
  const nFlexiblesEligibles = simulation.ecoles.filter(
    (s) => !s.volumeFixe && !s.ajustementManuel && s.priorityScore != null
  ).length
  const nbParTour = nFlexiblesEligibles === 0 ? 0
    : Math.max(1, Math.round(1 + (diversification / 100) * (nFlexiblesEligibles - 1)))

  // ── Handlers ajustements manuels (Tâche 2) et plafond par école (Tâche 3) ────

  const handleChangeManualOverride = (id, val) => setManualOverrides((p) => ({ ...p, [id]: val }))
  const handleResetManualOverride  = (id) => setManualOverrides((p) => {
    const next = { ...p }; delete next[id]; return next
  })
  const handleToggleIgnorePlafond = (id) => setIgnorePlafondIds((p) => {
    const next = { ...p }
    if (next[id]) delete next[id]; else next[id] = true
    return next
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl">

      {/* ── En-tête ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-display text-3xl text-foreground">Objectifs & Simulateur</h1>
          <HelpTooltip texte="Saisissez vos objectifs, enregistrez-les, et le simulateur en dessous recalcule instantanément la répartition d'heures optimale par école." />
        </div>
        <p className="text-sm text-muted-foreground">
          Définissez vos cibles financières et contraintes de temps — le simulateur
          se met à jour après chaque enregistrement.
        </p>
      </div>

      {/* ── Sélecteur d'année (partagé entre le formulaire et le simulateur) ── */}
      <div className="glass-panel rounded-2xl p-5 mb-4">
        <Field label="Année scolaire concernée">
          <div className="relative">
            <select
              value={schoolYear}
              onChange={(e) => { setSchoolYear(e.target.value); setSaved(false) }}
              className={inputCls + ' pr-8 appearance-none cursor-pointer'}
            >
              {SCHOOL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </Field>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — FORMULAIRE OBJECTIFS
         ══════════════════════════════════════════════════════════════════════ */}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Euro}
              title="Revenu cible"
              subtitle="Montant net mensuel que vous souhaitez atteindre."
              help="Toutes sources confondues : écoles + cours particuliers CESU. Le simulateur calcule combien d'heures allouer à chaque école pour atteindre ce montant."
            />
            <div className="space-y-4">
              <Field label="Revenu mensuel net cible" hint="€">
                <input
                  type="number" min="0" step="50"
                  value={form.revenu_mensuel_cible}
                  onChange={f('revenu_mensuel_cible')}
                  placeholder="ex : 2 500"
                  className={inputCls}
                />
              </Field>
              {revenuAnnuel && (
                <p className="text-xs text-muted-foreground">
                  Soit <span className="font-medium text-foreground">{revenuAnnuel} / an</span>.
                </p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Clock}
              title="Plafond d'heures"
              subtitle="Nombre maximum d'heures de cours par semaine, toutes écoles confondues."
            />
            <Field label="Heures maximum par semaine" hint="h">
              <input
                type="number" min="1" max="60" step="0.5"
                value={form.plafond_heures_hebdo}
                onChange={f('plafond_heures_hebdo')}
                placeholder="ex : 25"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Car}
              title="Budget déplacements"
              subtitle="Vos contraintes de kilométrage et de carburant chaque mois."
              help="Estimé depuis votre kilométrage mensuel moyen et le barème URSSAF. Configurez les taux dans Réglages → Taux kilométriques."
            />
            <div className="space-y-4">
              <Field label="Kilométrage mensuel maximum" hint="km">
                <input
                  type="number" min="0" step="50"
                  value={form.budget_km_mensuel}
                  onChange={f('budget_km_mensuel')}
                  placeholder="ex : 800"
                  className={inputCls}
                />
              </Field>
              <Field label="Budget carburant mensuel" hint="€">
                <input
                  type="number" min="0" step="5"
                  value={form.budget_carburant_mensuel}
                  onChange={f('budget_carburant_mensuel')}
                  placeholder="ex : 120"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <Field label="Notes libres" hint="facultatif">
              <textarea
                rows={3}
                value={form.notes}
                onChange={f('notes')}
                placeholder="Contraintes particulières, priorités, rappels…"
                className={inputCls + ' resize-none'}
              />
            </Field>
          </div>

          {error && (
            <div className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
            ) : saved ? (
              <><Check className="w-4 h-4" /> Objectifs enregistrés — simulateur mis à jour</>
            ) : (
              <><Save className="w-4 h-4" /> Enregistrer les objectifs</>
            )}
          </button>
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — SIMULATEUR DE RÉPARTITION
          Visible dès que les écoles sont chargées, recalcule après save.
         ══════════════════════════════════════════════════════════════════════ */}

      <div className="mt-10 border-t border-border-subtle pt-8">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-foreground">Simulateur de répartition</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimation consultative — aucun créneau n'est attribué automatiquement.
            Se met à jour après chaque enregistrement des objectifs ci-dessus.
          </p>
        </div>

        {schoolsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
            Chargement des écoles…
          </div>
        ) : schools.length === 0 ? (
          <p className="text-sm text-muted-foreground glass-panel rounded-2xl p-6 text-center">Aucune école enregistrée.</p>
        ) : savedObjectives == null ? (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground space-y-2">
            <Target className="w-8 h-8 mx-auto text-muted opacity-50" />
            <p>Enregistrez vos objectifs ci-dessus pour lancer la simulation.</p>
          </div>
        ) : !plafondBrut && !cible ? (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground space-y-2">
            <Target className="w-8 h-8 mx-auto text-muted opacity-50" />
            <p>
              Définissez un <strong>plafond d'heures hebdomadaire</strong> ou un{' '}
              <strong>revenu mensuel cible</strong>, puis enregistrez pour lancer la simulation.
            </p>
          </div>
        ) : (
          <>
            {/* Bandeau objectifs enregistrés */}
            <div className="glass-panel rounded-2xl p-4 mb-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                Objectifs enregistrés {schoolYear}
                <HelpTooltip texte="Valeurs au moment du dernier enregistrement. Modifiez le formulaire ci-dessus et enregistrez pour recalculer." position="right" />
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatSim icon={Euro}      label="Revenu mensuel cible" value={fmt(savedObjectives.revenu_mensuel_cible, '€')} />
                <StatSim icon={Clock}     label="Plafond hebdomadaire" value={fmt(savedObjectives.plafond_heures_hebdo, 'h')} />
                <StatSim icon={BarChart2} label="Budget km/mois"       value={fmt(savedObjectives.budget_km_mensuel, 'km')} />
                <StatSim icon={TrendingUp} label="Budget carburant"    value={fmt(savedObjectives.budget_carburant_mensuel, '€')} />
              </div>
              {savedObjectives.budget_carburant_mensuel != null && (
                <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Ce simulateur ne calcule pas les coûts de trajet — consultez la{' '}
                  <a href="/admin/trajets" className="text-guitar-400 underline underline-offset-2 hover:opacity-80">page Trajets</a>
                  {' '}pour l'analyse kilométrique par école.
                </p>
              )}
            </div>

            {/* Tâche 1 : bandeau mode "objectif financier seul" */}
            {simulation.mode === 'objectif-seul' && (
              <div className="flex items-start gap-2 px-4 py-3 mb-4 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-xs text-guitar-400">
                <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Simulation basée uniquement sur l'objectif financier</strong> — aucun plafond d'heures
                  hebdomadaire n'est enregistré, la répartition s'arrête dès que le revenu cible est atteint
                  (dans les bornes réalistes). Budget hebdomadaire utilisé : <strong>{fmtHeures(simulation.budgetUtilise)}</strong>.
                </span>
              </div>
            )}
            {simulation.mode === 'objectif-seul' && simulation.objectifAtteint === false && (
              <div className="flex items-start gap-2 px-4 py-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Objectif non atteignable même en maximisant les heures dans les bornes réalistes.
                  Revenu maximal estimé : <strong>{fmt(totaux.rTotal, '€')}</strong> pour <strong>{fmtHeures(simulation.budgetUtilise)}</strong> / semaine.
                </span>
              </div>
            )}

            {/* Curseur de diversification */}
            <div className="glass-panel rounded-2xl p-4 mb-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Répartition entre employeurs</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {diversification === 0
                      ? `La meilleure école absorbe tout le budget disponible avant de passer à la suivante (glouton).`
                      : diversification === 100
                      ? `Les heures sont distribuées en petits incréments (${fmtHeures(0.25)}) à toutes les écoles éligibles tour à tour.`
                      : `Distribué entre les ${nbParTour} meilleures écoles éligibles par cycle — interpolation linéaire entre glouton et rotation totale.`
                    }
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">
                  {diversification === 0 ? 'Concentré' : diversification === 100 ? 'Diversifié' : `${diversification} %`}
                </span>
              </div>
              <input
                type="range" min="0" max="100" step="10"
                value={diversification}
                onChange={(e) => setDiversification(Number(e.target.value))}
                className="w-full accent-guitar-600 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted mt-1 select-none">
                <span>Concentré</span>
                <span>Équilibré</span>
                <span>Diversifié</span>
              </div>
            </div>

            {/* Tâche 2 : mode d'ajustement manuel par école */}
            <div className="glass-panel rounded-2xl p-4 mb-4">
              <div className="mb-2">
                <p className="text-sm font-medium text-foreground">Mode d'ajustement manuel</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ajustementMode === 'interactif'
                    ? "Ajuster une école recalcule aussitôt la répartition des autres écoles flexibles avec le budget restant."
                    : "Ajuster une école ne modifie que son propre volume — les autres écoles restent inchangées."}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAjustementMode('interactif')}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    ajustementMode === 'interactif' ? 'guitar-gradient text-white' : 'bg-surface-raised border border-border-subtle text-muted-foreground'
                  }`}
                >
                  Interactif
                </button>
                <button
                  type="button"
                  onClick={() => setAjustementMode('independant')}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    ajustementMode === 'independant' ? 'guitar-gradient text-white' : 'bg-surface-raised border border-border-subtle text-muted-foreground'
                  }`}
                >
                  Indépendant
                </button>
              </div>
            </div>

            {/* Avertissement : plafond non atteignable avec les bornes réalistes */}
            {simulation.mode === 'normal' && budgetNonDistribue > 0.01 && (
              <div className="flex items-start gap-2 px-4 py-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>{fmtHeures(budgetNonDistribue)}</strong> du plafond ne peuvent pas être distribuées :
                  toutes les écoles flexibles ont atteint leur plafond réaliste
                  (+{GAIN_MAX_REALISTE_HEBDO} h max par rapport à l'existant).
                  Maximum atteignable : <strong>{fmtHeures(heuresMaxAtteignables)}</strong> / semaine.
                </span>
              </div>
            )}

            {/* Tableau des écoles */}
            <div className="glass-panel rounded-2xl overflow-hidden mb-4">
              <div className="px-5 py-4 border-b border-border-subtle">
                <p className="text-sm font-semibold text-foreground">Répartition simulée par école</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fixes figés · flexibles bornés (±{GAIN_MAX_REALISTE_HEBDO} h / −{PERTE_MAX_REALISTE_HEBDO} h max) · {fmt(plafondEffectif, 'h')} / semaine
                  {simulation.mode === 'objectif-seul' ? ' (déduites de l\'objectif financier)' : ' au total'}
                </p>
              </div>
              <div className="divide-y divide-border-subtle">
                {simulation.ecoles.map((s) => (
                  <SchoolRow
                    key={s.id}
                    school={s}
                    plafond={plafondEffectif}
                    manualOverride={manualOverrides[s.id] ?? null}
                    onChangeManualOverride={handleChangeManualOverride}
                    onResetManualOverride={handleResetManualOverride}
                    ignorePlafond={!!ignorePlafondIds[s.id]}
                    onToggleIgnorePlafond={handleToggleIgnorePlafond}
                  />
                ))}
              </div>
            </div>

            {/* Récapitulatif */}
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Récapitulatif</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatSim icon={Clock}  label="Heures / semaine (total simulé)" value={fmt(totaux.hTotal, 'h', 2)} />
                <StatSim icon={Euro}   label="Revenu mensuel estimé"           value={fmt(totaux.rTotal, '€')} />
                {cible != null && (
                  <StatSim
                    icon={Target}
                    label="Écart vs cible"
                    value={manque != null ? `${manque > 0 ? '-' : '+'}${fmt(Math.abs(manque), '€')}` : '—'}
                    highlight={manque != null && manque > 0 ? 'warn' : 'ok'}
                  />
                )}
              </div>

              {simulation.ecoles.some((s) => s.heuresHebdoProposees != null && !s.netHourlyYieldReal) && (
                <p className="mt-4 text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Certaines écoles n'ont pas de taux horaire renseigné pour {schoolYear} — leur revenu estimé n'apparaît pas.
                  Ajoutez-le dans la fiche de chaque école.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
