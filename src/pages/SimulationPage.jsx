import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Target, Loader2, AlertCircle, Star, Clock, Euro, TrendingUp, Info, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fetchSchoolsOverview, currentSchoolYear, SEMAINES_PAR_MOIS } from '../services/schools'
import { allSchoolYears } from '../context/PeriodContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCHOOL_YEARS = allSchoolYears()

// Granularité des créneaux de cours : 15 minutes = 0,25 heure.
// Toute proposition du simulateur est arrondie à ce multiple pour rester
// directement traduisible en créneaux réels (ex : 2,5h → 2h30, jamais 2,37h).
const GRANULARITE_HEURES = 0.25

/** Convertit un nombre d'heures décimal en libellé "Xh" ou "XhYY" (ex: 2.5 → "2h30"). */
function fmtHeures(h) {
  if (h == null || isNaN(h)) return '—'
  const heures  = Math.floor(h)
  const minutes = Math.round((h - heures) * 60)
  if (minutes === 0) return `${heures}h`
  return `${heures}h${String(minutes).padStart(2, '0')}`
}

function fmt(v, suffix = '', digits = 0) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (suffix ? ' ' + suffix : '')
}

function ScoreDots({ score }) {
  if (score == null) return <span className="text-xs text-muted italic">Non évalué</span>
  const full = Math.floor(score)
  const partial = score - full
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
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

// ─── Moteur de simulation ─────────────────────────────────────────────────────

/**
 * Répartit les heures hebdomadaires entre les écoles selon leur score de priorité
 * pondéré (priorityScore, voir services/schools.js — 5 catégories, poids réglables
 * dans Réglages > Priorisation des écoles). Les écoles sans score sont exclues de
 * la simulation mais affichées en bas.
 *
 * Le revenu mensuel estimé est calculé à partir de netHourlyYieldReal (rendement
 * horaire net réel, déjà ajusté par la fiabilité de la structure — voir
 * calculerRendementHoraireNetReel) plutôt que du taux saisi brut (currentNetRate) :
 * c'est la même logique que celle affichée sur SchoolsPage.jsx et
 * SchoolsComparativePage.jsx, pour que la projection de revenu ne surestime pas
 * silencieusement ce qu'une structure peu fiable (CESU, annulations non
 * rattrapées) rapporte réellement. netHourlyYieldReal couvre aussi le cas d'un
 * salaire mensuel fixe lissé sans taux horaire saisi, que currentNetRate seul
 * manquerait — currentNetRate reste un repli défensif si jamais l'un est
 * disponible sans l'autre.
 *
 * @param {Array}  schools            — tableau d'écoles (voir fetchSchoolsOverview)
 * @param {number} plafondHebdo       — heures max par semaine
 * @param {number} revenuMensuelCible — revenu net mensuel visé
 * @returns {Array} écoles enrichies de { heuresHebdoProposees, revenuMensuelEstime }
 */
function simuler(schools, plafondHebdo, revenuMensuelCible) {
  const evaluees  = schools.filter(s => s.priorityScore != null)
  const nonNotees = schools.filter(s => s.priorityScore == null)

  if (!evaluees.length || !plafondHebdo) {
    return schools.map(s => ({ ...s, heuresHebdoProposees: null, revenuMensuelEstime: null }))
  }

  const totalScore = evaluees.reduce((acc, s) => acc + s.priorityScore, 0)

  const resultats = evaluees.map(s => {
    const ratio     = s.priorityScore / totalScore
    const hebdo     = Math.round(ratio * plafondHebdo / GRANULARITE_HEURES) * GRANULARITE_HEURES
    const tauxRetenu = s.netHourlyYieldReal ?? s.currentNetRate
    const mensuel   = tauxRetenu ? hebdo * SEMAINES_PAR_MOIS * tauxRetenu : null
    return { ...s, heuresHebdoProposees: hebdo, revenuMensuelEstime: mensuel }
  })

  return [
    ...resultats,
    ...nonNotees.map(s => ({ ...s, heuresHebdoProposees: null, revenuMensuelEstime: null })),
  ]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const { user } = useAuth()
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear())

  const [schools,    setSchools]    = useState([])
  const [objectives, setObjectives] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    setError('')

    Promise.all([
      fetchSchoolsOverview(user.id),
      supabase
        .from('objectives')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('school_year', schoolYear)
        .maybeSingle(),
    ])
      .then(([schoolData, { data: obj, error: objErr }]) => {
        if (objErr) throw new Error(objErr.message)
        setSchools(schoolData)
        setObjectives(obj)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.id, schoolYear])

  const simulation = useMemo(() => {
    if (!schools.length) return []
    return simuler(
      schools,
      objectives?.plafond_heures_hebdo ? parseFloat(objectives.plafond_heures_hebdo) : null,
      objectives?.revenu_mensuel_cible  ? parseFloat(objectives.revenu_mensuel_cible)  : null,
    )
  }, [schools, objectives])

  const totaux = useMemo(() => {
    const hTotal = simulation.reduce((acc, s) => acc + (s.heuresHebdoProposees ?? 0), 0)
    const rTotal = simulation.reduce((acc, s) => acc + (s.revenuMensuelEstime  ?? 0), 0)
    return { hTotal, rTotal }
  }, [simulation])

  const plafond = objectives?.plafond_heures_hebdo ? parseFloat(objectives.plafond_heures_hebdo) : null
  const cible   = objectives?.revenu_mensuel_cible  ? parseFloat(objectives.revenu_mensuel_cible)  : null

  const manque = cible && totaux.rTotal ? cible - totaux.rTotal : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-1">Simulateur de répartition</h1>
        <p className="text-sm text-muted-foreground">
          Estimation consultative de la répartition d'heures par école selon le score de priorité et vos objectifs.
          Aucun créneau n'est attribué automatiquement.
        </p>
      </div>

      {/* ── Sélecteur d'année ── */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-muted-foreground shrink-0">Année scolaire :</label>
        <div className="relative">
          <select
            value={schoolYear}
            onChange={e => setSchoolYear(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-xl bg-surface border border-border-subtle text-sm outline-none focus:border-guitar-600 appearance-none cursor-pointer"
          >
            {SCHOOL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
        </div>
      </div>

      {/* ── Bandeau objectifs ── */}
      <div className="glass-panel rounded-2xl p-4 mb-6">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Objectifs {schoolYear}</p>
        {objectives ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={Euro}     label="Revenu mensuel cible"  value={fmt(objectives.revenu_mensuel_cible, '€')} />
            <Stat icon={Clock}    label="Plafond hebdomadaire"  value={fmt(objectives.plafond_heures_hebdo, 'h')} />
            <Stat icon={BarChart2} label="Budget km/mois"       value={fmt(objectives.budget_km_mensuel, 'km')} />
            <Stat icon={TrendingUp} label="Budget carburant"    value={fmt(objectives.budget_carburant_mensuel, '€')} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="w-4 h-4 shrink-0" />
            Aucun objectif défini pour {schoolYear}.{' '}
            <a href="/admin/objectifs" className="text-guitar-400 underline underline-offset-2 hover:opacity-80">
              Définir mes objectifs →
            </a>
          </div>
        )}
      </div>

      {/* ── Contenu principal ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
          Calcul en cours…
        </div>
      ) : error ? (
        <div className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : schools.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune école enregistrée.</p>
      ) : !plafond ? (
        <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground space-y-2">
          <Target className="w-8 h-8 mx-auto text-muted opacity-50" />
          <p>Définissez un <strong>plafond d'heures hebdomadaire</strong> dans vos objectifs pour lancer la simulation.</p>
        </div>
      ) : (
        <>
          {/* Tableau des écoles */}
          <div className="glass-panel rounded-2xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-border-subtle">
              <p className="text-sm font-semibold text-foreground">Répartition simulée par école</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Proportionnelle au score de priorité · {fmt(plafond, 'h')} / semaine au total
              </p>
            </div>

            <div className="divide-y divide-border-subtle">
              {simulation.map(s => (
                <SchoolRow key={s.id} school={s} plafond={plafond} />
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Récapitulatif</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat icon={Clock} label="Heures / semaine (total simulé)" value={fmt(totaux.hTotal, 'h', 2)} />
              <Stat icon={Euro}  label="Revenu mensuel estimé"           value={fmt(totaux.rTotal, '€')} />
              {cible != null && (
                <Stat
                  icon={Target}
                  label="Écart vs cible"
                  value={manque != null ? `${manque > 0 ? '-' : '+'}${fmt(Math.abs(manque), '€')}` : '—'}
                  highlight={manque != null && manque > 0 ? 'warn' : 'ok'}
                />
              )}
            </div>

            {simulation.some(s => s.heuresHebdoProposees != null && !s.netHourlyYieldReal) && (
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
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, highlight }) {
  const valueColor = highlight === 'warn' ? 'text-amber-400'
    : highlight === 'ok' ? 'text-green-400'
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

function SchoolRow({ school, plafond }) {
  const navigate = useNavigate()
  const { name, priorityScore, heuresHebdoProposees, revenuMensuelEstime, currentNetRate, netHourlyYieldReal } = school
  const pct = plafond && heuresHebdoProposees ? Math.round((heuresHebdoProposees / plafond) * 100) : 0
  // Fiabilité réduite (CESU par défaut, ou correction manuelle à la baisse) : le
  // revenu estimé ci-dessus tient déjà compte de la décote — cette ligne rend
  // l'ajustement visible plutôt que de le laisser implicite dans le total,
  // cohérent avec l'affichage "taux saisi / taux réel" de SchoolsPage.jsx.
  const fiabiliteReduite = currentNetRate != null && netHourlyYieldReal != null && netHourlyYieldReal !== currentNetRate

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
          <p className="text-sm font-medium text-foreground truncate hover:text-guitar-400 transition-colors">{name}</p>
          <ScoreDots score={priorityScore} />
        </div>
        <div className="text-right shrink-0">
          {heuresHebdoProposees != null ? (
            <p className="text-sm font-semibold text-foreground">
              {revenuMensuelEstime != null
                ? `${fmtHeures(heuresHebdoProposees)} / sem. → ${fmt(revenuMensuelEstime, '€ / mois')}`
                : `${fmtHeures(heuresHebdoProposees)} / sem.`}
            </p>
          ) : (
            <span className="text-muted italic text-xs">Non évalué</span>
          )}
          {fiabiliteReduite && (
            <p className="text-xs text-muted italic" title="Revenu déjà réduit du risque d'annulation non rattrapée pour cette structure">
              ≈ {fmt(netHourlyYieldReal, '€/h réel', 2)} (saisi : {fmt(currentNetRate, '€/h', 2)})
            </p>
          )}
          {heuresHebdoProposees != null && !netHourlyYieldReal && (
            <p className="text-xs text-muted italic">Taux inconnu</p>
          )}
        </div>
      </div>

      {heuresHebdoProposees != null && (
        <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
          <div
            className="h-full rounded-full guitar-gradient"
            style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
          />
        </div>
      )}
    </div>
  )
}
