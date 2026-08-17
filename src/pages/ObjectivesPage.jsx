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
  GAIN_MAX_REALISTE_HEBDO,
  PERTE_MAX_REALISTE_HEBDO,
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

  const ecoles = avecHeures.map((s) => {
    const tauxRetenu = s.netHourlyYieldReal ?? s.currentNetRate
    if (!tauxRetenu || s.heuresHebdoProposees == null || s.heuresHebdoProposees <= 0) {
      return { ...s, revenuMensuelEstime: null }
    }
    const zone        = s.vacation_zone_override ?? teacherZone ?? 'B'
    const typeLissage = determinerTypeLissage(s.payment_smoothing, s.payment_duration)
    const mensuel     = calculerRevenuMensuelEcole({
      heuresHebdo:   s.heuresHebdoProposees,
      tauxHoraire:   tauxRetenu,
      typeLissage,
      anneeScolaire: schoolYear,
      zone,
      primeAnnuelle: s.estimated_annual_bonus ?? 0,
    })
    return { ...s, revenuMensuelEstime: mensuel }
  })

  return { ecoles, heuresDistribuees, heuresMaxAtteignables, budgetNonDistribue }
}

// ─── Ligne école dans le tableau de simulation ────────────────────────────────

function SchoolRow({ school, plafond }) {
  const navigate = useNavigate()
  const {
    name, priorityScore, heuresHebdoProposees, revenuMensuelEstime,
    currentNetRate, netHourlyYieldReal, volumeFixe, weekly_presence_days,
    sousPlancherRealiste,
  } = school

  const pct = plafond && heuresHebdoProposees
    ? Math.round((heuresHebdoProposees / plafond) * 100) : 0
  const fiabiliteReduite = currentNetRate != null && netHourlyYieldReal != null
    && netHourlyYieldReal !== currentNetRate

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

  // ── Simulation (mémorisée sur les objectifs ENREGISTRÉS et le curseur) ───────
  // Le curseur de diversification réagit immédiatement, sans enregistrement.

  const simulation = useMemo(() => {
    const plafond = savedObjectives?.plafond_heures_hebdo
      ? parseFloat(savedObjectives.plafond_heures_hebdo) : null
    return simuler(schools, plafond, { schoolYear, teacherZone, diversification })
  }, [schools, savedObjectives, schoolYear, teacherZone, diversification])

  const totaux = useMemo(() => ({
    hTotal: simulation.ecoles.reduce((acc, s) => acc + (s.heuresHebdoProposees ?? 0), 0),
    rTotal: simulation.ecoles.reduce((acc, s) => acc + (s.revenuMensuelEstime  ?? 0), 0),
  }), [simulation])

  const plafond = savedObjectives?.plafond_heures_hebdo ? parseFloat(savedObjectives.plafond_heures_hebdo) : null
  const cible   = savedObjectives?.revenu_mensuel_cible  ? parseFloat(savedObjectives.revenu_mensuel_cible)  : null
  const manque  = cible && totaux.rTotal ? cible - totaux.rTotal : null

  // Heures que les bornes réalistes ne permettent pas d'absorber (toutes les écoles à plafond).
  const { budgetNonDistribue, heuresMaxAtteignables } = simulation

  // Nombre d'écoles flexibles éligibles (avec score) — pour la description du curseur.
  const nFlexiblesEligibles = simulation.ecoles.filter((s) => !s.volumeFixe && s.priorityScore != null).length
  const nbParTour = nFlexiblesEligibles === 0 ? 0
    : Math.max(1, Math.round(1 + (diversification / 100) * (nFlexiblesEligibles - 1)))

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
        ) : !plafond ? (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground space-y-2">
            <Target className="w-8 h-8 mx-auto text-muted opacity-50" />
            <p>Définissez un <strong>plafond d'heures hebdomadaire</strong> et enregistrez pour lancer la simulation.</p>
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

            {/* Avertissement : plafond non atteignable avec les bornes réalistes */}
            {budgetNonDistribue > 0.01 && (
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
                  Fixes figés · flexibles bornés (±{GAIN_MAX_REALISTE_HEBDO} h / −{PERTE_MAX_REALISTE_HEBDO} h max) · {fmt(plafond, 'h')} / semaine au total
                </p>
              </div>
              <div className="divide-y divide-border-subtle">
                {simulation.ecoles.map((s) => (
                  <SchoolRow key={s.id} school={s} plafond={plafond} />
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
