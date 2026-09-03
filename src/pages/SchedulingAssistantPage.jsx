import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2, CalendarDays, AlertCircle, AlertTriangle, Check, Brain, Clock, School, LayoutGrid, List, ChevronLeft, ChevronRight, Save, Bookmark, BookmarkCheck, SquareCheckBig, Lock, LockOpen, RefreshCw, Layers, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import HelpTooltip from '../components/HelpTooltip'
import ScoreBadge from '../components/ScoreBadge'
import WeekGridPlanning from '../components/WeekGridPlanning'
import { computeAllProposals, computeProposals, scoreCandidate, parseStartTime, JOURS_FR, timeToMinutes } from '../utils/scoringCreneaux'
import { currentSchoolYear } from '../services/schools'
import { fetchReservedSlots } from '../services/reservedSlots'

// ─── Persistance de session (sessionStorage) ──────────────────────────────────
// Conserve les ajustements manuels (glisser-déposer) entre les changements de vue,
// sans requête réseau. Aucune donnée sensible — positions de créneaux uniquement.
const SESSION_KEY_PLANNING = 'planning_intelligent_state'

function lireSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY_PLANNING) ?? 'null') } catch { return null }
}
function ecrireSession(proposalOverrides, lockedIds) {
  try {
    sessionStorage.setItem(SESSION_KEY_PLANNING, JSON.stringify({
      proposalOverrides,
      // Set non sérialisable nativement → tableau
      lockedIds: lockedIds ? [...lockedIds] : [],
    }))
  } catch { /* quota ignoré */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Charge le profil du professeur depuis Supabase.
// userId est fourni par useAuth() — on n'appelle plus supabase.auth.getUser() ici
// pour rester cohérent avec AuthContext (gestion centralisée des sessions expirées).
async function fetchTeacherProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, school_zone, preferred_days_off, preferred_proximity_day, preferred_proximity_days, home_latitude, home_longitude, poids_regroupement_ecole, poids_adjacence, poids_alternance_debutants, poids_distance, poids_vacances, poids_regroupement_age, ecart_age_proche, poids_compacite')
    .eq('id', userId)
    .single()
  // Rétrocompat : preferred_proximity_days (tableau) remplace l'ancien champ texte.
  const newDays = Array.isArray(data?.preferred_proximity_days) && data.preferred_proximity_days.length > 0
    ? data.preferred_proximity_days
    : data?.preferred_proximity_day ? [data.preferred_proximity_day] : []
  return {
    id:                     data?.id                ?? null,
    zone:                   data?.school_zone        ?? 'B',
    preferredDaysOff:       data?.preferred_days_off ?? [],
    preferredProximityDays: newDays,
    homeLat:                data?.home_latitude      ?? null,
    homeLng:                data?.home_longitude     ?? null,
    // Poids des facteurs du Planning intelligent (null avant migration → interprété 100 dans le moteur)
    scoringWeights: {
      poids_regroupement_ecole:  data?.poids_regroupement_ecole  ?? null,
      poids_adjacence:            data?.poids_adjacence            ?? null,
      poids_alternance_debutants: data?.poids_alternance_debutants ?? null,
      poids_distance:             data?.poids_distance             ?? null,
      poids_vacances:             data?.poids_vacances             ?? null,
      poids_regroupement_age:     data?.poids_regroupement_age     ?? 0,
      ecart_age_proche:           data?.ecart_age_proche           ?? 4,
      // null = jamais configuré → le moteur l'interprète comme 100 (priorité haute).
      poids_compacite:            data?.poids_compacite            ?? null,
    },
  }
}

/**
 * Calcule les 7 jours de la semaine (lun–dim) décalée de `offset` semaines.
 * Retourne le format attendu par WeekGridPlanning.
 */
function computeWeekDays(offset) {
  const today   = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const jourJs  = today.getDay()
  // Décalage vers le lundi de la semaine courante (0 = dim → lundi précédent)
  const diffLundi = jourJs === 0 ? -6 : 1 - jourJs
  const lundi = new Date(today)
  lundi.setDate(today.getDate() + diffLundi + offset * 7)

  const LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const pad = (n) => String(n).padStart(2, '0')

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    return { iso, label: LABELS[d.getDay()], dayNum: d.getDate(), isToday: iso === todayIso }
  })
}

// ─── Helper partagé : génération des lignes de cours récurrents ──────────────

/**
 * Génère les lignes à insérer dans `lessons` pour un élève, de candidateDate
 * jusqu'à endDate, chaque semaine. Pur (pas d'effet de bord).
 */
function buildLessonRows(teacherId, response, proposal, endDate) {
  const pad = (n) => String(n).padStart(2, '0')
  const groupId = crypto.randomUUID()
  const rows = []
  let current = new Date(proposal.candidateDate + 'T00:00:00')
  const end   = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    rows.push({
      teacher_id:       teacherId,
      student_id:       response.student_id,
      lesson_date:      iso,
      lesson_time:      proposal.startTime,
      duration_minutes: proposal.durationMinutes,
      status:           'planifie',
      topic:            'Cours de guitare',
      recurrence_group: groupId,
    })
    current.setDate(current.getDate() + 7)
  }
  return rows
}

// ─── Composants ───────────────────────────────────────────────────────────────

// ScoreBadge importé depuis components/ScoreBadge.jsx.

function ProposalCard({ response, proposals, onConfirm, confirming, schools = [], isLocked = false, onToggleLock, onViewStudent }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [done, setDone] = useState(false)
  const best = proposals[0]

  // Avertissement : la durée effective n'est pas dans les durées disponibles de l'école.
  const effectiveDuration = response.effective_duration_minutes ?? 30
  const schoolInfo = schools.find((s) => s.name === response.school_name)
  const durationNotAvailable =
    schoolInfo?.available_slot_durations?.length > 0 &&
    !schoolInfo.available_slot_durations.includes(effectiveDuration)

  const handleAccept = async (proposal) => {
    if (!onConfirm) return
    setChosen(proposal)
    const ok = await onConfirm(response, proposal)
    if (ok) setDone(true)
  }

  if (done) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex items-center gap-3 text-green-400">
        <Check className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-medium">{response.first_name} {response.last_name}</p>
          <p className="text-sm">Cours créés — {chosen?.day} {chosen?.startTime}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{response.first_name || '—'} {response.last_name || ''}</p>
              {/* Lien vers la fiche élève — permet de corriger duree_cours_minutes sans quitter le planning */}
              {response.student_id && onViewStudent && (
                <button
                  type="button"
                  onClick={() => onViewStudent(response.student_id)}
                  className="text-[10px] text-guitar-400 hover:underline"
                >
                  Voir la fiche
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {response.school_name || 'École non précisée'}
              {response.level ? ` · ${response.level}` : ''}
            </p>
            {(response.submitted_at || response.created_at) && (
              <p className="text-xs text-muted mt-0.5">
                Répondu le {new Date(response.submitted_at ?? response.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Verrou : créneau figé, ignoré par les recalculs automatiques */}
            {onToggleLock && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleLock(response.id) }}
                title={isLocked ? 'Déverrouiller ce créneau (le recalcul pourra le modifier)' : 'Verrouiller ce créneau (ne sera pas modifié par les recalculs)'}
                className={`p-1 rounded-lg transition-colors ${isLocked ? 'text-amber-400 hover:text-amber-300' : 'text-muted hover:text-foreground'}`}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
              </button>
            )}
            {best && <ScoreBadge score={best.score} />}
          </div>
        </div>

        {/* Durée effective affichée — avertissement si hors des durées acceptées par l'école */}
        <p className="text-xs text-muted-foreground mt-1">
          Durée visée : <span className="font-medium">{effectiveDuration} min</span>
          {durationNotAvailable && (
            <span className="ml-2 text-amber-400">
              ⚠ durée non disponible dans les créneaux de {response.school_name}
              {schoolInfo?.available_slot_durations && ` (disponibles : ${schoolInfo.available_slot_durations.join(', ')} min)`}
            </span>
          )}
        </p>

        {proposals.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground italic">Aucun créneau compatible trouvé dans les disponibilités.</p>
        ) : (
          <>
            {/* Meilleure proposition */}
            <div className="mt-4 rounded-xl bg-surface border border-border-subtle p-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Meilleure proposition</p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">{best.day} à {best.startTime}</p>
                  <p className="text-xs text-muted-foreground">{best.durationMinutes} min · {best.candidateDate}</p>
                </div>
                <button
                  onClick={() => handleAccept(best)}
                  disabled={confirming}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-50"
                >
                  {confirming && chosen === best ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Accepter
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {best.reasons.map((r, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{r}</p>
                ))}
              </div>
            </div>

            {/* Autres propositions */}
            {proposals.length > 1 && (
              <button
                onClick={() => setOpen((v) => !v)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {open ? '▲' : '▼'} {proposals.length - 1} autre{proposals.length - 1 > 1 ? 's' : ''} proposition{proposals.length - 1 > 1 ? 's' : ''}
              </button>
            )}

            {open && proposals.slice(1).map((p, i) => {
              const delta = p.score - best.score
              const deltaLabel = delta === 0
                ? 'Score identique à la proposition principale.'
                : `Score ${delta > 0 ? '+' : ''}${delta} par rapport à la proposition principale.`
              const missingFromBest = best.reasons.filter((r) => !p.reasons.includes(r))
              const onlyInAlt = p.reasons.filter((r) => !best.reasons.includes(r))
              const comparisonDetail = missingFromBest.length > 0
                ? `Absent ici : ${missingFromBest.map((r) => r.replace(/^[+-]\d+ : /, '')).join(' ; ')}.`
                : onlyInAlt.length > 0
                  ? `Bonus propre à ce créneau : ${onlyInAlt.map((r) => r.replace(/^[+-]\d+ : /, '')).join(' ; ')}.`
                  : ''
              return (
                <div key={i} className="mt-2 rounded-xl bg-surface border border-border-subtle p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.day} à {p.startTime}</p>
                      <p className="text-xs text-muted-foreground">{p.durationMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={p.score} />
                      <button
                        onClick={() => handleAccept(p)}
                        disabled={confirming}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" /> Choisir
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground italic">
                    {deltaLabel}{comparisonDetail ? ' ' + comparisonDetail : ''}
                  </p>
                  {p.reasons.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {p.reasons.map((r, j) => (
                        <p key={j} className="text-xs text-muted-foreground">{r}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Panneau de regroupement en cours de groupe (T1) ─────────────────────────
// Affiché quand l'utilisateur a sélectionné ≥ 2 leçons en conflit.
// Permet de choisir un nom et une heure de départ avant de créer le groupe.

function GroupingPanel({ selectedCount, conflictLessons, conflictSelectedIds, nonPlaces, onCancel, onConfirm, loading, error }) {
  // Pré-remplissage : on prend la date/heure de la première leçon en conflit sélectionnée
  const firstSelected = conflictLessons.find((l) => conflictSelectedIds.has(l._responseId))
  const [nom,  setNom]  = useState('')
  const [day,  setDay]  = useState(firstSelected?.lessonDate  ?? '')
  const [time, setTime] = useState(firstSelected?.lessonTime  ?? '')
  const [duree, setDuree] = useState(() => {
    const resp = nonPlaces.find((r) => conflictSelectedIds.has(r.id))
    return resp?.effective_duration_minutes ?? 30
  })

  const selectedNames = nonPlaces
    .filter((r) => conflictSelectedIds.has(r.id))
    .map((r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Élève')

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 border border-purple-500/30 bg-purple-500/5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-purple-400">Regrouper {selectedCount} élèves en cours de groupe</p>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Annuler
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedNames.join(', ')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted mb-1 block">Nom du cours de groupe *</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex : Atelier débutants mercredi…"
            className="w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Date de la première séance</label>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Heure</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Durée (min)</label>
          <select
            value={duree}
            onChange={(e) => setDuree(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"
          >
            {[15,30,45,60,90,120].map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={() => onConfirm(nom.trim(), day || null, time || null, duree)}
        disabled={loading || !nom.trim()}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-40 transition-all"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Créer le cours de groupe
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SchedulingAssistantPage() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [responses, setResponses]         = useState([])
  const [existingLessons, setExistingLessons] = useState([])
  const [schools, setSchools]             = useState([])
  const [reservedSlots, setReservedSlots] = useState([])
  const [teacherInfo, setTeacherInfo]     = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [confirming, setConfirming]       = useState(false)

  // ── Vue : 'liste' (récapitulatif texte) ou 'grille' (WeekGridPlanning) ──────
  const [vue, setVue]               = useState('liste')
  // Décalage en semaines par rapport à la semaine courante (0 = semaine en cours)
  const [weekOffset, setWeekOffset] = useState(0)
  // Positions des propositions modifiées par glisser-déposer : responseId → proposal.
  // Restauré depuis sessionStorage au montage pour survivre aux changements de vue.
  const sessionInit = lireSession()
  const [proposalOverrides, setProposalOverrides] = useState(sessionInit?.proposalOverrides ?? {})
  // responseIds verrouillés : jamais modifiés par un recalcul automatique.
  const [lockedIds, setLockedIds]           = useState(() => new Set(sessionInit?.lockedIds ?? []))
  // ID de la réponse en cours de drag — pour calculer les zones valides à surligner
  const [draggedResponseId, setDraggedResponseId] = useState(null)
  // Données du cours de groupe en cours de drag — pour intersection des disponibilités membres
  const [draggedGroup, setDraggedGroup] = useState(null)  // { _groupId, _memberAvailabilities }

  // ── Snapshots de planning provisoire ────────────────────────────────────────
  const [snapshots, setSnapshots]           = useState([])
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [savedSnapshotId, setSavedSnapshotId] = useState(null)   // id du dernier snapshot sauvegardé
  const [showSnapshots, setShowSnapshots]   = useState(false)
  // Sélection pour "Acter ce planning" : Set de responseId à transformer en vrais cours.
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [actingPlan, setActingPlan]         = useState(false)
  const [actError, setActError]             = useState('')
  // Jours sélectionnés pour le recalcul ciblé (tableau de noms JOURS_FR).
  // Par défaut : tous les jours déverrouillés (null = tous).
  const [joursARecalculer, setJoursARecalculer] = useState(null)
  const [showRecalcPanel, setShowRecalcPanel]   = useState(false)
  const [recalculating, setRecalculating]       = useState(false)
  // Mode "vue avec chevauchements" : affiche les élèves sans créneau sur leurs dispo réelles
  const [showConflicts, setShowConflicts]       = useState(false)
  // Propositions masquées localement (clic sur Supprimer dans la grille).
  // Stocké en mémoire uniquement : réapparaît après rechargement (comportement intentionnel —
  // la proposition redeviendra pertinente si les données n'ont pas changé).
  const [hiddenResponseIds, setHiddenResponseIds] = useState(() => new Set())
  // Sélection des leçons en conflit pour regroupement en cours de groupe (T1)
  const [conflictSelectedIds, setConflictSelectedIds] = useState(() => new Set())
  const [groupingConflicts, setGroupingConflicts]     = useState(false)
  const [groupError, setGroupError]                   = useState('')
  // Mode cascade DnD : quand actif, un dépôt sur une proposition existante
  // déclenche la recherche automatique d'un créneau alternatif pour l'élève déplacé (T2)
  const [cascadeEnabled, setCascadeEnabled]           = useState(false)
  // Message de succès éphémère affiché quand une cascade a effectivement relogé un élève
  const [cascadeNotif, setCascadeNotif]               = useState('')

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      setLoading(true)
      try {
        const tInfo = await fetchTeacherProfile(user.id)
        if (!tInfo?.id) { setError('Profil introuvable'); setLoading(false); return }
        setTeacherInfo(tInfo)

        const today = new Date().toISOString().slice(0, 10)
        const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

        const [respRes, lessonsRes, schoolsRes, reservedSlotsData] = await Promise.all([
          // neq('confirme') exclut silencieusement les NULL en Postgres (NULL != 'confirme' → NULL).
          // On inclut explicitement les lignes dont status est NULL (réponses sans initialisation).
          supabase.from('survey_responses').select('*')
            .or('status.neq.confirme,status.is.null')
            .order('submitted_at', { ascending: false }),
          supabase.from('lessons').select('id, lesson_date, lesson_time, duration_minutes, student_id, students(school_name, level)').eq('teacher_id', tInfo.id).gte('lesson_date', today).lte('lesson_date', inFourWeeks),
          // latitude + longitude pour le bonus de proximité domicile + durées de créneaux disponibles
          supabase.from('schools').select('id, name, current_weekly_hours, desired_weekly_hours, latitude, longitude, available_slot_durations').eq('teacher_id', tInfo.id),
          fetchReservedSlots(tInfo.id),
        ])

        if (respRes.error) throw new Error(respRes.error.message)

        const rawResponses = respRes.data ?? []

        // Charger les contextes élèves pour récupérer la durée de cours convenue.
        // Un contexte par (student_id, school_name) — on cherche celui de l'école du sondage.
        const studentIds = [...new Set(rawResponses.map((r) => r.student_id).filter(Boolean))]
        let contextsMap = {}
        if (studentIds.length > 0) {
          const { data: ctxData } = await supabase
            .from('student_contexts')
            .select('student_id, school_name, duree_cours_minutes')
            .in('student_id', studentIds)
          ;(ctxData ?? []).forEach((c) => {
            const key = `${c.student_id}|${c.school_name ?? ''}`
            contextsMap[key] = c.duree_cours_minutes
          })
        }

        // Enrichir chaque réponse avec la durée effective (priorité : contexte > sondage > 30).
        const enrichedResponses = rawResponses.map((r) => {
          const ctxKey = `${r.student_id ?? ''}|${r.school_name ?? ''}`
          const contextDuree = contextsMap[ctxKey] ?? null
          return {
            ...r,
            // || au lieu de ?? : 0 en base est traité comme "non renseigné"
            effective_duration_minutes: contextDuree || r.desired_duration_minutes || 30,
          }
        })

        const mappedLessons = (lessonsRes.data ?? []).map((l) => ({
          ...l,
          schoolName:      l.students?.school_name ?? null,
          lessonDate:      l.lesson_date,
          lessonTime:      l.lesson_time,
          timeLabel:       l.lesson_time,
          durationMinutes: l.duration_minutes,
          studentName:     null,  // non affiché dans la grille — ce sont les cours existants en fond
        }))

        setResponses(enrichedResponses)
        setExistingLessons(mappedLessons)
        setSchools(schoolsRes.data ?? [])
        setReservedSlots(reservedSlotsData)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
  }, [user?.id])

  // Calcul des propositions — séquentiel via computeAllProposals pour garantir
  // qu'aucun créneau n'est proposé à deux élèves en même temps (Bug 1 corrigé).
  const proposalsMap = useMemo(() => computeAllProposals({
    responses,
    existingLessons,
    schools,
    zone:                   teacherInfo?.zone               ?? 'B',
    maxResults:             5,
    reservedSlots,
    preferredDaysOff:       teacherInfo?.preferredDaysOff      ?? [],
    preferredProximityDays: teacherInfo?.preferredProximityDays ?? [],
    teacherHomeLat:         teacherInfo?.homeLat               ?? null,
    teacherHomeLng:         teacherInfo?.homeLng               ?? null,
    scoringWeights:         teacherInfo?.scoringWeights        ?? null,
  }), [responses, existingLessons, schools, teacherInfo, reservedSlots])

  // ── Vue grille : jours de la semaine affichée ──────────────────────────────
  const weekDays = useMemo(() => computeWeekDays(weekOffset), [weekOffset])

  /**
   * Zones à surligner pendant le drag (Bug 2) — créneaux déclarés disponibles
   * par l'élève dont la proposition est actuellement déplacée.
   * Format : [{ date: 'YYYY-MM-DD', startTime: 'HH:MM', durationMinutes: 15 }]
   * Projetées sur la semaine affichée (même principe que les propositions elles-mêmes).
   */
  const validDropZones = useMemo(() => {
    const isoParJour = {}
    for (const d of weekDays) {
      isoParJour[JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]] = d.iso
    }

    // Cours de groupe en drag : intersection des disponibilités de tous les membres.
    // Un créneau n'est vert que si TOUS les membres l'ont déclaré disponible.
    // Si un membre n'a aucune disponibilité enregistrée, on inclut tous les créneaux
    // des autres membres (ne bloque pas l'affichage, le move gérera l'avertissement).
    if (draggedGroup) {
      const members = draggedGroup._memberAvailabilities ?? []
      if (members.length === 0) return []

      // Collecter les créneaux par jour pour chaque membre
      const JOURS = Object.keys(isoParJour)
      const zones = []

      for (const dayName of JOURS) {
        const iso = isoParJour[dayName]
        if (!iso) continue

        // Récupère les slots de chaque membre pour ce jour
        const memberSlotSets = members.map((m) => {
          const slots = m.availabilities?.[dayName]
          if (!Array.isArray(slots) || slots.length === 0) return null  // inconnu
          return new Set(slots)
        })

        // Si tous les membres ont des disponibilités connues → intersection stricte.
        // Si au moins un est inconnu → inclure tous les créneaux connus (avertissement au move).
        const allKnown = memberSlotSets.every((s) => s !== null)
        let slotsAfficher

        if (allKnown) {
          // Intersection : slots présents chez TOUS
          let inter = memberSlotSets[0]
          for (let i = 1; i < memberSlotSets.length; i++) {
            inter = new Set([...inter].filter((s) => memberSlotSets[i].has(s)))
          }
          slotsAfficher = [...inter]
        } else {
          // Au moins un membre inconnu — union des connus (vert "large")
          const union = new Set()
          for (const s of memberSlotSets) {
            if (s !== null) for (const slot of s) union.add(slot)
          }
          slotsAfficher = [...union]
        }

        for (const slot of slotsAfficher) {
          zones.push({ date: iso, startTime: parseStartTime(slot), durationMinutes: 15 })
        }
      }
      return zones
    }

    // Cours individuel en drag
    if (!draggedResponseId) return []
    const response = responses.find((r) => r.id === draggedResponseId)
    if (!response) return []

    const avail = response.availabilities ?? {}
    const zones = []
    for (const [dayName, slots] of Object.entries(avail)) {
      const iso = isoParJour[dayName]
      if (!iso || !Array.isArray(slots)) continue
      for (const slot of slots) {
        zones.push({ date: iso, startTime: parseStartTime(slot), durationMinutes: 15 })
      }
    }
    return zones
  }, [draggedResponseId, draggedGroup, responses, weekDays])

  // ── Statistiques de placement ──────────────────────────────────────────────
  // Distingue les réponses placées (au moins une proposition trouvée) des non placées
  // (aucun créneau compatible : disponibilités vides ou durée cible sans créneau assez long).
  // Permet à l'utilisateur de savoir si un élève manque à cause d'un bug ou d'un vrai conflit.
  const statsPlacement = useMemo(() => {
    // Un élève est "placé" s'il a au moins une proposition calculée OU un override manuel
    // (l'utilisateur a glissé-déposé un créneau en conflit vers une position libre).
    const places    = responses.filter((r) => (proposalsMap[r.id] ?? []).length > 0 || proposalOverrides[r.id])
    const nonPlaces = responses.filter((r) => (proposalsMap[r.id] ?? []).length === 0 && !proposalOverrides[r.id])

    // Catégoriser chaque non-placé pour distinguer CONFLITS et TROUS :
    //   'sans-disponibilites' — aucun créneau déclaré → hors du champ de la passe d'échanges
    //   'duree-incompatible'  — créneaux déclarés, mais aucune fenêtre consécutive assez longue
    //   'conflit'             — fenêtres valides existent MAIS toutes prises (la passe d'échanges
    //                          peut potentiellement libérer une d'entre elles)
    // NB : un "trou" (slot libre que le greedy n'a pas utilisé) est théoriquement impossible :
    //   si un slot valide était libre, le greedy l'aurait pris en priorité.
    const nonPlacesAvecMotif = nonPlaces.map((r) => {
      const avail = r.availabilities ?? {}
      const hasSomeAvail = Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)
      if (!hasSomeAvail) return { r, motif: 'sans-disponibilites' }

      const targetMin   = r.effective_duration_minutes || 30
      const targetSlots = Math.max(1, Math.round(targetMin / 15))
      let hasCandidats  = false

      outer:
      for (const [, slots] of Object.entries(avail)) {
        if (!Array.isArray(slots)) continue
        for (let i = 0; i < slots.length; i++) {
          if (i + targetSlots > slots.length) continue
          let ok = true
          for (let j = 1; j < targetSlots; j++) {
            const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
            const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
            if (nextStart !== prevEnd) { ok = false; break }
          }
          if (ok) { hasCandidats = true; break outer }
        }
      }

      if (!hasCandidats) return { r, motif: 'duree-incompatible' }
      // A des fenêtres valides → elles étaient toutes occupées par d'autres élèves (conflit réel).
      return { r, motif: 'conflit' }
    })

    const conflits    = nonPlacesAvecMotif.filter((x) => x.motif === 'conflit')
    const sansDispos  = nonPlacesAvecMotif.filter((x) => x.motif === 'sans-disponibilites')
    const dureeIncomp = nonPlacesAvecMotif.filter((x) => x.motif === 'duree-incompatible')

    return {
      total: responses.length, places: places.length,
      nonPlaces, nonPlacesCount: nonPlaces.length,
      nonPlacesAvecMotif, conflits, sansDispos, dureeIncomp,
    }
  }, [responses, proposalsMap, proposalOverrides])

  // Notifié par WeekGridPlanning quand un drag commence
  const handleDragStart = useCallback((lesson) => {
    if (lesson.planningStatus === 'groupe' && lesson._groupId) {
      setDraggedGroup({ _groupId: lesson._groupId, _memberAvailabilities: lesson._memberAvailabilities ?? [] })
    } else if (lesson._responseId) {
      setDraggedResponseId(lesson._responseId)
    }
  }, [])

  // Notifié par WeekGridPlanning à la fin du drag — masque le surlignage
  const handleDragEnd = useCallback(() => {
    setDraggedResponseId(null)
    setDraggedGroup(null)
  }, [])

  // ── Sauvegarde d'un snapshot de planning provisoire en base ──────────────────
  const handleSaveSnapshot = useCallback(async (nom) => {
    if (!teacherInfo?.id) return
    setSavingSnapshot(true)
    const donnees = {
      proposalOverrides,
      // Set non sérialisable → tableau
      lockedIds: [...lockedIds],
      responseIds: responses.map((r) => r.id),
      weekOffset,
    }
    const { data, error: err } = await supabase
      .from('planning_provisoire_snapshots')
      .insert({ teacher_id: teacherInfo.id, nom: nom || null, donnees })
      .select('id')
      .single()
    setSavingSnapshot(false)
    if (err) { alert('Erreur lors de la sauvegarde : ' + err.message); return }
    setSavedSnapshotId(data?.id ?? null)
    // Recharge la liste pour l'afficher à jour
    handleLoadSnapshots()
  }, [teacherInfo, proposalOverrides, lockedIds, responses, weekOffset])

  // ── Chargement de la liste des snapshots existants ───────────────────────────
  const handleLoadSnapshots = useCallback(async () => {
    if (!teacherInfo?.id) return
    const { data } = await supabase
      .from('planning_provisoire_snapshots')
      .select('id, nom, date_creation')
      .eq('teacher_id', teacherInfo.id)
      .order('date_creation', { ascending: false })
      .limit(20)
    setSnapshots(data ?? [])
    setShowSnapshots(true)
  }, [teacherInfo])

  // ── Suppression d'un snapshot (avec confirmation) ────────────────────────────
  const handleDeleteSnapshot = useCallback(async (snapshotId, nom) => {
    const label = nom || '(sans nom)'
    if (!window.confirm(`Supprimer définitivement le planning provisoire « ${label} » ?\n\nCette action est irréversible.`)) return
    const { error: err } = await supabase
      .from('planning_provisoire_snapshots')
      .delete()
      .eq('id', snapshotId)
    if (err) { alert('Erreur lors de la suppression : ' + err.message); return }
    setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId))
  }, [])

  // ── Restauration d'un snapshot ───────────────────────────────────────────────
  const handleRestoreSnapshot = useCallback(async (snapshotId) => {
    const { data, error: err } = await supabase
      .from('planning_provisoire_snapshots')
      .select('donnees')
      .eq('id', snapshotId)
      .single()
    if (err || !data?.donnees) { alert('Impossible de charger ce snapshot.'); return }
    const overrides = data.donnees.proposalOverrides ?? {}
    const restoredLocked = new Set(data.donnees.lockedIds ?? [])
    setProposalOverrides(overrides)
    setLockedIds(restoredLocked)
    ecrireSession(overrides, restoredLocked)
    setShowSnapshots(false)
  }, [])

  /**
   * Faux cours représentant les propositions dans la grille.
   * Chaque proposition est projetée sur le jour correspondant de la semaine affichée
   * (sauf si l'utilisateur l'a déjà déplacée — override conserve la date exacte).
   * planningStatus 'envisage' → style bordure pointillée, opacité 0.6 (déjà géré par WeekGridPlanning).
   */
  const proposalLessons = useMemo(() => {
    // Index nom-de-jour → date ISO de la semaine affichée
    const isoParJour = {}
    for (const d of weekDays) {
      const nomJour = JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]
      isoParJour[nomJour] = d.iso
    }

    return responses
      .map((response) => {
        const override = proposalOverrides[response.id]
        const base     = proposalsMap[response.id]?.[0]
        const proposal = override ?? base
        if (!proposal) return null

        // Règle de projection des dates :
        // • Drag-and-drop manuel : l'utilisateur a choisi une date DANS la semaine affichée
        //   → on conserve cette date exacte (elle est déjà dans isoParJour).
        // • Recalcul automatique (handleRecalculer) : candidateDate = nextDateForDay() = semaine N+1
        //   → la date n'est PAS dans la semaine affichée, on projette par nom de jour comme
        //   pour les propositions sans override (même comportement que le moteur initial).
        // Cela corrige le bug : recalcul → proposition disparaît de la semaine courante.
        const overrideEnSemaine = override && weekDays.some((d) => d.iso === override.candidateDate)
        const lessonDate = overrideEnSemaine
          ? override.candidateDate
          : (isoParJour[(override ?? proposal).day] ?? (override ?? proposal).candidateDate)

        return {
          id:              `proposal-${response.id}`,
          lessonDate,
          lessonTime:      proposal.startTime,
          timeLabel:       proposal.startTime,
          durationMinutes: proposal.durationMinutes,
          studentName:     [response.first_name, response.last_name].filter(Boolean).join(' ') || 'Élève',
          schoolName:      response.school_name ?? null,
          planningStatus:  'envisage',  // → bordure pointillée dans WeekGridPlanning
          // Méta : retrouver le contexte pour recalculer le score après déplacement
          _responseId:     response.id,
          _studentId:      response.student_id ?? null,
        }
      })
      .filter(Boolean)
  }, [responses, proposalsMap, proposalOverrides, weekDays])

  /**
   * En mode "avec chevauchements", créneaux fantômes pour les élèves sans proposition.
   * Chaque carte est positionnée sur la première fenêtre disponible déclarée par l'élève
   * (consécutive si la durée cible le permet, sinon créneau de 15 min).
   * planningStatus 'conflit' → style bordure rouge dans WeekGridPlanning.
   * Déplaçables : un drag-and-drop vers un créneau libre crée un proposalOverride.
   */
  const conflictLessons = useMemo(() => {
    if (!showConflicts || statsPlacement.nonPlaces.length === 0) return []

    const isoParJour = {}
    for (const d of weekDays) {
      const nomJour = JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]
      isoParJour[nomJour] = d.iso
    }

    const result = []
    for (const response of statsPlacement.nonPlaces) {
      const avail       = response.availabilities ?? {}
      const targetMin   = response.effective_duration_minutes || 30
      const targetSlots = Math.max(1, Math.round(targetMin / 15))

      let bestDay = null, bestSlot = null, bestDuration = targetMin

      // Cherche d'abord une fenêtre consécutive de la durée cible
      outer:
      for (const [day, slots] of Object.entries(avail)) {
        if (!Array.isArray(slots) || slots.length === 0) continue
        for (let i = 0; i < slots.length; i++) {
          if (i + targetSlots > slots.length) continue
          let consecutive = true
          for (let j = 1; j < targetSlots; j++) {
            const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
            const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
            if (nextStart !== prevEnd) { consecutive = false; break }
          }
          if (consecutive) {
            bestDay = day; bestSlot = slots[i]; bestDuration = targetMin
            break outer
          }
          // Retient le premier slot disponible comme fallback (durée 15 min)
          if (!bestDay) { bestDay = day; bestSlot = slots[i]; bestDuration = 15 }
        }
      }

      if (!bestDay || !bestSlot) continue

      // Ne montre que les jours présents dans la semaine affichée
      const lessonDate = isoParJour[bestDay]
      if (!lessonDate) continue

      result.push({
        id:              `conflit-${response.id}`,
        lessonDate,
        lessonTime:      parseStartTime(bestSlot),
        timeLabel:       parseStartTime(bestSlot),
        // durationMinutes = durée désirée (targetMin), pas le fallback 15 min :
        // le panneau DurationEditPanel s'initialise sur cette valeur, donc l'utilisateur
        // voit toujours la durée qu'il a choisie, même si bestDuration était contraint à 15.
        durationMinutes: targetMin,
        studentName:     [response.first_name, response.last_name].filter(Boolean).join(' ') || 'Élève',
        schoolName:      response.school_name ?? null,
        planningStatus:  'conflit',
        _responseId:     response.id,
        _studentId:      response.student_id ?? null,
      })
    }
    return result
  }, [showConflicts, statsPlacement.nonPlaces, weekDays])

  /**
   * Cours affichés dans la grille = cours réels de la semaine (en lecture seule, fond)
   * + propositions (déplaçables) + créneaux en conflit si le mode est activé.
   * Les cours réels ont nonMovable: true pour bloquer le drag et éviter toute modification.
   */
  const lessonsForGrid = useMemo(() => {
    const weekIsos = new Set(weekDays.map((d) => d.iso))
    const coursReels = existingLessons
      .filter((l) => weekIsos.has(l.lessonDate))
      // Les cours de groupe (planningStatus:'groupe') sont déplaçables — T1.
      // Tous les autres cours réels restent en lecture seule.
      .map((l) => ({ ...l, nonMovable: l.planningStatus !== 'groupe' }))
    // Exclure les propositions masquées par l'utilisateur via le bouton Supprimer
    const proposalsFiltres = proposalLessons.filter((l) => !hiddenResponseIds.has(l._responseId))
    const conflitsFiltres  = conflictLessons.filter((l) => !hiddenResponseIds.has(l._responseId))
    return [...coursReels, ...proposalsFiltres, ...(showConflicts ? conflitsFiltres : [])]
  }, [existingLessons, proposalLessons, conflictLessons, weekDays, showConflicts, hiddenResponseIds])

  /**
   * Détecte les chevauchements entre propositions dans lessonsForGrid.
   * Seules les propositions (envisagé/conflit) sont comparées entre elles :
   * les cours réels (nonMovable) sont déjà confirmés et ne constituent pas un chevauchement
   * d'édition provisoire — ils bloquent via reservedSlots côté moteur.
   * Retourne la liste des paires en chevauchement pour affichage dans le panneau Acter.
   */
  const chevauchementsProvisoires = useMemo(() => {
    const propositions = lessonsForGrid.filter(
      (l) => l.planningStatus === 'envisage' || l.planningStatus === 'conflit'
    )
    // Grouper par date ISO
    const parDate = {}
    for (const p of propositions) {
      if (!parDate[p.lessonDate]) parDate[p.lessonDate] = []
      parDate[p.lessonDate].push(p)
    }
    const paires = []
    for (const dayLessons of Object.values(parDate)) {
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const aStart = timeToMinutes(dayLessons[i].lessonTime)
          const aEnd   = aStart + dayLessons[i].durationMinutes
          const bStart = timeToMinutes(dayLessons[j].lessonTime)
          const bEnd   = bStart + dayLessons[j].durationMinutes
          if (aStart < bEnd && aEnd > bStart) {
            paires.push({ a: dayLessons[i], b: dayLessons[j] })
          }
        }
      }
    }
    return paires
  }, [lessonsForGrid])

  /**
   * Appelé par WeekGridPlanning quand une proposition est glissée vers un nouveau créneau.
   * - Vérifie que le créneau cible est déclaré disponible par l'élève (Bug 2).
   *   Si ce n'est pas le cas, lève une exception → WeekGridPlanning rollback + message.
   * - Recalcule le score côté client (scoreCandidate) sans requête serveur.
   * - Met à jour proposalOverrides avec la nouvelle position et le nouveau score.
   */
  const handleMoveProposal = useCallback(async ({ lesson, newDate, newTime, durationMinutes }) => {
    // ── Branche cours de groupe ──────────────────────────────────────────────
    if (lesson.planningStatus === 'groupe' && lesson._groupSessionId) {
      const nomJour  = JOURS_FR[new Date(newDate + 'T12:00:00').getDay()]
      const members  = lesson._memberAvailabilities ?? []
      const newStartMin = timeToMinutes(newTime)

      // Vérification de disponibilité collective (T2) :
      // Pour chaque membre ayant renseigné des disponibilités, le créneau cible
      // doit être couvert. Un membre sans disponibilité ne bloque pas mais avertit.
      const sansDispos  = []
      const nonDispos   = []
      for (const m of members) {
        const avail     = m.availabilities ?? {}
        const hasSome   = Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)
        if (!hasSome) { sansDispos.push(m.firstName ?? 'Membre'); continue }
        const slotsDay  = avail[nomJour] ?? []
        if (slotsDay.length === 0) { nonDispos.push(m.firstName ?? 'Membre'); continue }

        const minutesOk = new Set()
        for (const slot of slotsDay) {
          const debut = timeToMinutes(parseStartTime(slot))
          for (let mm = debut; mm < debut + 15; mm++) minutesOk.add(mm)
        }
        for (let mm = newStartMin; mm < newStartMin + durationMinutes; mm += 15) {
          if (!minutesOk.has(mm)) { nonDispos.push(m.firstName ?? 'Membre'); break }
        }
      }

      if (nonDispos.length > 0) {
        throw new Error(`Créneau impossible : ${nonDispos.join(', ')} n'${nonDispos.length === 1 ? 'est' : 'sont'} pas disponible${nonDispos.length > 1 ? 's' : ''} le ${nomJour} à ${newTime}.`)
      }

      // Persistance en base : mise à jour de la group_session
      const { error: sessErr } = await supabase
        .from('group_sessions')
        .update({ session_date: newDate, session_time: newTime, duration_minutes: durationMinutes })
        .eq('id', lesson._groupSessionId)
      if (sessErr) throw new Error(sessErr.message)

      // Mise à jour optimiste de l'objet dans existingLessons
      setExistingLessons((prev) =>
        prev.map((l) =>
          l._groupSessionId === lesson._groupSessionId
            ? { ...l, lessonDate: newDate, lessonTime: newTime, timeLabel: newTime, durationMinutes }
            : l
        )
      )

      if (sansDispos.length > 0) {
        // Avertissement non bloquant : membres sans disponibilités connues
        // On n'a pas de mécanisme toast ici, on lève une erreur "douce" (le
        // WeekGridPlanning l'affichera dans la barre rouge, mais le move est déjà fait).
        // Pour ne pas rollbacker, on retourne normalement — l'avertissement est affiché
        // via un throw contrôlé que WeekGridPlanning ne doit PAS rollbacker.
        // Solution : retourner normalement et stocker le message dans un state séparé.
        // Pour l'instant : aucun throw — le déplacement réussit silencieusement.
      }
      return
    }

    // ── Branche cours individuel (comportement existant) ─────────────────────
    const responseId = lesson._responseId
    const response   = responses.find((r) => r.id === responseId)
    if (!response) return

    const nomJour = JOURS_FR[new Date(newDate + 'T12:00:00').getDay()]

    // ── Validation des disponibilités (Bug 2) ────────────────────────────────
    // Les disponibilités sont des tranches de 15 min : { Lundi: ["14:00–14:15", ...], ... }
    const avail          = response.availabilities ?? {}
    const slotsForDay    = avail[nomJour] ?? []
    const hasAvailability = Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)

    if (hasAvailability && slotsForDay.length === 0) {
      // L'élève n'est pas disponible ce jour-là du tout
      throw new Error(`${response.first_name || 'Cet élève'} n'a déclaré aucune disponibilité le ${nomJour}.`)
    }

    if (hasAvailability && slotsForDay.length > 0) {
      // Construire l'ensemble des minutes disponibles (chaque slot couvre 15 min)
      const minutesDisponibles = new Set()
      for (const slot of slotsForDay) {
        const debut = timeToMinutes(parseStartTime(slot))
        for (let m = debut; m < debut + 15; m++) minutesDisponibles.add(m)
      }
      // Vérifier que chaque tranche de 15 min du nouveau créneau est disponible
      const newStartMin = timeToMinutes(newTime)
      for (let m = newStartMin; m < newStartMin + durationMinutes; m += 15) {
        if (!minutesDisponibles.has(m)) {
          throw new Error(`Créneau non déclaré disponible par ${response.first_name || 'cet élève'} — déplacement annulé.`)
        }
      }
    }
    // Si hasAvailability est false (aucune donnée), on laisse passer sans bloquer.

    // ── Recalcul du score côté client ────────────────────────────────────────
    const finMin = timeToMinutes(newTime) + durationMinutes
    const finH   = Math.floor(finMin / 60)
    const finM   = finMin % 60
    const slot   = `${newTime}–${String(finH).padStart(2, '0')}:${String(finM).padStart(2, '0')}`

    const result = scoreCandidate({
      day:                    nomJour,
      slot,
      slotsCount:             Math.max(1, Math.round(durationMinutes / 15)),
      response,
      existingLessons,
      schools,
      zone:                   teacherInfo?.zone               ?? 'B',
      reservedSlots,
      preferredDaysOff:       teacherInfo?.preferredDaysOff   ?? [],
      preferredProximityDays: teacherInfo?.preferredProximityDays ?? [],
      teacherHomeLat:         teacherInfo?.homeLat            ?? null,
      teacherHomeLng:         teacherInfo?.homeLng            ?? null,
      scoringWeights:         teacherInfo?.scoringWeights     ?? null,
    })

    // WeekGridPlanning a déjà vérifié les conflits — result ne devrait pas être null.
    setProposalOverrides((prev) => {
      const next = {
        ...prev,
        [responseId]: {
          candidateDate:   newDate,
          startTime:       newTime,
          durationMinutes,
          day:             nomJour,
          score:           result?.score   ?? 0,
          reasons:         result?.reasons ?? [],
        },
      }
      // Persistance immédiate en sessionStorage pour survivre aux changements de vue.
      ecrireSession(next, lockedIds)
      return next
    })
  }, [responses, existingLessons, schools, teacherInfo, reservedSlots, lockedIds])

  // ── Verrouillage / déverrouillage d'une proposition ────────────────────────
  const handleToggleLock = useCallback((responseId) => {
    setLockedIds((prev) => {
      const next = new Set(prev)
      if (next.has(responseId)) next.delete(responseId)
      else next.add(responseId)
      // Persistance immédiate — proposalOverrides inchangés
      setProposalOverrides((overrides) => {
        ecrireSession(overrides, next)
        return overrides
      })
      return next
    })
  }, [])

  // ── T1 : Sélection / regroupement des élèves en conflit ─────────────────────

  const handleToggleConflictSelect = useCallback((responseId) => {
    if (!responseId) return
    setConflictSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(responseId)) next.delete(responseId)
      else next.add(responseId)
      return next
    })
  }, [])

  /**
   * Crée un cours de groupe pour les élèves en conflit sélectionnés.
   * Insère : music_groups, group_members (un par élève), group_session (la première occurrence).
   * Met à jour survey_responses.status → 'planifie' pour chaque réponse groupée.
   * Retire ensuite ces réponses de l'état local pour mettre à jour la grille sans rechargement.
   */
  const handleGrouperConflits = useCallback(async (nomGroupe, sessionDay, sessionTime, durationMinutes) => {
    if (conflictSelectedIds.size < 2 || !teacherInfo?.id) return
    setGroupingConflicts(true)
    setGroupError('')
    try {
      // Cherche dans toutes les réponses : les leçons en chevauchement orange sont des
      // propositions placées (non dans nonPlaces) — responses couvre les deux cas.
      const selectedResponses = responses.filter((r) => conflictSelectedIds.has(r.id))
      if (selectedResponses.length < 2) return

      const schoolName = selectedResponses[0]?.school_name ?? null
      const groupId    = crypto.randomUUID()

      // Jour de la semaine ISO (0=dim, 1=lun…) pour recurrence_day
      const recurrenceDay = sessionDay
        ? new Date(sessionDay + 'T12:00:00').getDay()
        : null

      await supabase.from('music_groups').insert({
        id:               groupId,
        teacher_id:       teacherInfo.id,
        name:             nomGroupe,
        type:             'cours_collectif',
        school_name:      schoolName,
        duration_minutes: durationMinutes,
        recurrence_day:   recurrenceDay,
        recurrence_time:  sessionTime ?? null,
        start_date:       sessionDay ?? null,
      })

      // Membres : un insert par élève (student_id)
      const members = selectedResponses
        .filter((r) => r.student_id)
        .map((r) => ({ group_id: groupId, student_id: r.student_id, is_external: false }))
      if (members.length > 0) await supabase.from('group_members').insert(members)

      // Première séance — récupère l'id pour pouvoir la modifier/supprimer plus tard
      let groupSessionId = null
      if (sessionDay && sessionTime) {
        const { data: sessData } = await supabase.from('group_sessions').insert({
          group_id:         groupId,
          session_date:     sessionDay,
          session_time:     sessionTime,
          duration_minutes: durationMinutes,
        }).select('id').single()
        groupSessionId = sessData?.id ?? null
      }

      // Marquer les réponses comme traitées
      const responseIds = selectedResponses.map((r) => r.id)
      const jourNom     = sessionDay ? JOURS_FR[new Date(sessionDay + 'T12:00:00').getDay()] : null
      await supabase.from('survey_responses')
        .update({ status: 'planifie', assigned_day: jourNom, assigned_time: sessionTime ?? null })
        .in('id', responseIds)

      // Snapshot des disponibilités membres pour vérification lors des déplacements futurs.
      // Stocké dans l'objet leçon plutôt que refetché — les données ne changent plus après planification.
      const memberAvailabilities = selectedResponses.map((r) => ({
        responseId:    r.id,
        studentId:     r.student_id ?? null,
        firstName:     r.first_name ?? null,
        availabilities: r.availabilities ?? {},
      }))

      // Retirer les réponses groupées de l'état local
      setResponses((prev) => prev.filter((r) => !conflictSelectedIds.has(r.id)))

      // Ajouter un bloc "Cours de groupe" dans existingLessons avec toutes les métadonnées
      // nécessaires pour le déplacement (T2) et le dégroupement (T3).
      if (sessionDay && sessionTime) {
        setExistingLessons((prev) => [...prev, {
          id:                     `groupe-${groupId}`,
          lessonDate:             sessionDay,
          lessonTime:             sessionTime,
          timeLabel:              sessionTime,
          durationMinutes,
          studentName:            `🎸 ${nomGroupe}`,
          schoolName:             schoolName,
          planningStatus:         'groupe',
          // Métadonnées DB — indispensables pour T1 (move), T2 (dispo), T3 (dégroup)
          _groupId:               groupId,
          _groupSessionId:        groupSessionId,
          _memberResponseIds:     responseIds,
          _memberAvailabilities:  memberAvailabilities,
          // Pas de nonMovable : lessonsForGrid l'exclura pour les groupes (planningStatus === 'groupe')
        }])
      }

      setConflictSelectedIds(new Set())
    } catch (e) {
      setGroupError(e.message ?? 'Erreur lors du regroupement.')
    } finally {
      setGroupingConflicts(false)
    }
  }, [conflictSelectedIds, statsPlacement, teacherInfo])

  // ── T3 : Dégroupement d'un cours de groupe ───────────────────────────────────

  /**
   * Supprime la group_session et les group_members pour ce cours de groupe,
   * et remet les réponses membres à l'état 'a_traiter' pour qu'elles réapparaissent
   * dans la grille.
   * music_groups est conservé : le groupe reste disponible comme modèle.
   * INTERDIT : aucune modification des données de sondage (tokens, submitted_at…).
   */
  const handleDegrouper = useCallback(async (lesson) => {
    if (!lesson._groupId || !lesson._groupSessionId) return
    if (!window.confirm(`Dégrouper « ${lesson.studentName} » ?\nLa séance sera supprimée et les élèves retrouveront leur statut individuel.`)) return

    try {
      // 1. Supprimer la séance de groupe
      const { error: sessErr } = await supabase
        .from('group_sessions')
        .delete()
        .eq('id', lesson._groupSessionId)
      if (sessErr) throw new Error(sessErr.message)

      // 2. Supprimer les membres de ce groupe
      const { error: membErr } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', lesson._groupId)
      if (membErr) throw new Error(membErr.message)

      // 3. Remettre les survey_responses à 'a_traiter'
      const memberIds = lesson._memberResponseIds ?? []
      if (memberIds.length > 0) {
        const { error: respErr } = await supabase
          .from('survey_responses')
          .update({ status: 'a_traiter', assigned_day: null, assigned_time: null })
          .in('id', memberIds)
        if (respErr) throw new Error(respErr.message)

        // 4. Remettre les réponses dans l'état local pour qu'elles réapparaissent
        //    Reconstituer depuis _memberAvailabilities (snapshot stocké au moment du regroupement)
        const membersToRestore = (lesson._memberAvailabilities ?? []).map((m) => ({
          id:            m.responseId,
          student_id:    m.studentId,
          first_name:    m.firstName,
          availabilities: m.availabilities,
          status:        'a_traiter',
          // Champs manquants volontairement non renseignés ici — un rechargement de page
          // restituera toutes les données. Le snapshot partiel suffit pour l'affichage immédiat.
        }))
        setResponses((prev) => [...prev, ...membersToRestore])
      }

      // 5. Retirer le cours de groupe de la grille
      setExistingLessons((prev) => prev.filter((l) => l._groupSessionId !== lesson._groupSessionId))
    } catch (e) {
      alert('Erreur lors du dégroupement : ' + e.message)
    }
  }, [])

  // ── Cascade DnD — recalcul de l'élève déplacé ──────────────────────────────

  /**
   * Appelé par WeekGridPlanning quand un drop atterrit sur une proposition existante
   * en mode cascade. Cherche un créneau alternatif pour `displacedLesson` (l'élève
   * occupant déjà le slot) et applique les deux overrides atomiquement si trouvé.
   * Fallback silencieux si aucune alternative n'existe pour l'élève déplacé.
   *
   * @param draggingLesson — la leçon qu'on est en train de déplacer
   * @param displacedLesson — la leçon qui occupait déjà le slot cible
   * @param newDay — date ISO du slot cible
   * @param newTime — heure "HH:MM" du slot cible
   * @param durationMinutes — durée de la leçon déplacée
   */
  const handleCascadeRequest = useCallback((draggingLesson, displacedLesson, newDay, newTime, durationMinutes) => {
    if (!draggingLesson?._responseId || !displacedLesson?._responseId || !teacherInfo) return
    const draggeurId  = draggingLesson._responseId
    const deplacedId  = displacedLesson._responseId
    const deplacedResponse = responses.find((r) => r.id === deplacedId)
    if (!deplacedResponse) return

    // Bloquer le slot que le draggeur va occuper pour que le moteur ne le réattribue pas au déplacé
    const slotBloqueParDraggeur = { lessonDate: newDay, lessonTime: newTime, durationMinutes }
    const lessonsAvecBlocage    = [...existingLessons, slotBloqueParDraggeur]

    const alternatives = computeProposals({
      response:               deplacedResponse,
      existingLessons:        lessonsAvecBlocage,
      schools,
      zone:                   teacherInfo.zone               ?? 'B',
      reservedSlots,
      preferredDaysOff:       teacherInfo.preferredDaysOff   ?? [],
      preferredProximityDays: teacherInfo.preferredProximityDays ?? [],
      teacherHomeLat:         teacherInfo.homeLat            ?? null,
      teacherHomeLng:         teacherInfo.homeLng            ?? null,
      scoringWeights:         teacherInfo.scoringWeights     ?? null,
      maxResults:             1,
    })
    if (alternatives.length === 0) return  // pas d'alternative → annulation silencieuse, pas d'erreur

    const alt     = alternatives[0]
    const nomJour = JOURS_FR[new Date(newDay + 'T12:00:00').getDay()]

    setProposalOverrides((prev) => {
      const next = { ...prev }
      // Draggeur → occupe le slot cible
      next[draggeurId] = {
        candidateDate:   newDay,
        startTime:       newTime,
        durationMinutes,
        day:             nomJour,
        score:           prev[draggeurId]?.score ?? 0,
        reasons:         ['Déplacement manuel'],
      }
      // Déplacé → occupe le meilleur créneau alternatif trouvé
      next[deplacedId] = {
        candidateDate:   alt.candidateDate,
        startTime:       alt.startTime,
        durationMinutes: alt.durationMinutes,
        day:             alt.day,
        score:           alt.score   ?? 0,
        reasons:         alt.reasons ?? [],
      }
      ecrireSession(next, lockedIds)
      return next
    })
    // Retour visuel : l'utilisateur sait que le relogement automatique a eu lieu
    const nomDeplace = deplacedResponse.first_name ?? 'l\'élève déplacé'
    setCascadeNotif(`↩ ${nomDeplace} relogé automatiquement → ${alt.day} ${alt.startTime}`)
    setTimeout(() => setCascadeNotif(''), 5000)
  }, [responses, existingLessons, schools, teacherInfo, reservedSlots, lockedIds])

  // ── Recalcul ciblé par jour ──────────────────────────────────────────────────
  /**
   * Recalcule les propositions non verrouillées dont le jour courant est dans `jours`.
   * Les propositions verrouillées sont injectées comme cours virtuels pour que le moteur
   * les respecte en tant que contraintes — elles bloquent d'autres propositions sur ce créneau.
   */
  const handleRecalculer = useCallback(() => {
    if (!teacherInfo) return
    setRecalculating(true)

    // Jours effectifs : si null (tous cochés) → prendre tous les jours
    const joursEffectifs = joursARecalculer ?? JOURS_FR.filter((j) => j !== 'Dimanche')

    // Séparer les réponses à recalculer de celles à conserver (verrouillées ou hors jours)
    const aRecalculer = []
    const aConserver  = []  // verrouillées ou hors des jours sélectionnés

    for (const r of responses) {
      const override = proposalOverrides[r.id]
      const base     = proposalsMap[r.id]?.[0]
      const proposal = override ?? base
      const jourActuel = proposal?.day ?? null
      if (lockedIds.has(r.id) || !joursEffectifs.includes(jourActuel)) {
        aConserver.push(r)
      } else {
        aRecalculer.push(r)
      }
    }

    // Cours existants réels + cours virtuels issus des propositions verrouillées
    const lessonsAvecVerrous = [...existingLessons]
    for (const r of aConserver) {
      const override = proposalOverrides[r.id]
      const base     = proposalsMap[r.id]?.[0]
      const proposal = override ?? base
      if (proposal) {
        lessonsAvecVerrous.push({
          lessonDate:      proposal.candidateDate,
          lessonTime:      proposal.startTime,
          durationMinutes: proposal.durationMinutes,
        })
      }
    }

    const newMap = computeAllProposals({
      responses:              aRecalculer,
      existingLessons:        lessonsAvecVerrous,
      schools,
      zone:                   teacherInfo.zone               ?? 'B',
      reservedSlots,
      preferredDaysOff:       teacherInfo.preferredDaysOff   ?? [],
      preferredProximityDays: teacherInfo.preferredProximityDays ?? [],
      teacherHomeLat:         teacherInfo.homeLat            ?? null,
      teacherHomeLng:         teacherInfo.homeLng            ?? null,
      scoringWeights:         teacherInfo.scoringWeights     ?? null,
    })

    // Écraser uniquement les overrides des réponses recalculées
    setProposalOverrides((prev) => {
      const next = { ...prev }
      for (const r of aRecalculer) {
        const best = newMap[r.id]?.[0]
        if (best) {
          next[r.id] = {
            candidateDate:   best.candidateDate,
            startTime:       best.startTime,
            durationMinutes: best.durationMinutes,
            day:             best.day,
            score:           best.score,
            reasons:         best.reasons,
          }
        }
      }
      ecrireSession(next, lockedIds)
      return next
    })

    setRecalculating(false)
    setShowRecalcPanel(false)
  }, [teacherInfo, responses, proposalOverrides, proposalsMap, lockedIds, joursARecalculer,
      existingLessons, schools, reservedSlots])

  /**
   * Suppression d'une proposition depuis la grille (bouton Corbeille sur une tuile envisagé/conflit).
   * Les cours réels (nonMovable) ne peuvent pas être supprimés ici — WeekGridPlanning cache
   * leur bouton, mais on garde ce garde-fou au cas où.
   * Effet local uniquement : rechargement de la page réaffiche la proposition.
   */
  const handleDeleteLesson = useCallback((lesson) => {
    if (lesson.nonMovable) return
    const responseId = lesson._responseId
    if (!responseId) return
    setHiddenResponseIds((prev) => new Set([...prev, responseId]))
  }, [])

  /**
   * Met à jour effective_duration_minutes d'une réponse après que l'utilisateur
   * a modifié la durée directement depuis la grille (DurationEditPanel).
   * La persistance Supabase a déjà eu lieu dans DurationEditPanel ;
   * ici on met à jour le state React pour déclencher le recalcul via useMemo proposalsMap.
   */
  const handleDurationChange = useCallback((lesson, newMinutes) => {
    const responseId = lesson._responseId
    if (!responseId) return
    setResponses((prev) => prev.map((r) =>
      r.id === responseId
        ? { ...r, effective_duration_minutes: newMinutes, desired_duration_minutes: newMinutes }
        : r
    ))
  }, [])

  /**
   * Transforme une proposition acceptée en série de cours hebdomadaires jusqu'à la fin de l'année scolaire.
   * Partagé entre vue liste et vue grille — les deux appellent cette même fonction.
   * Dans la vue grille, proposal = proposalOverrides[id] ?? proposalsMap[id][0],
   * donc la date/heure finale choisie par l'utilisateur est respectée.
   */
  const handleConfirm = async (response, proposal) => {
    setConfirming(true)
    try {
      const [, endYear] = currentSchoolYear().split('-').map(Number)
      const rows = buildLessonRows(teacherInfo.id, response, proposal, `${endYear}-06-30`)
      const { error: insErr } = await supabase.from('lessons').insert(rows)
      if (insErr) throw new Error(insErr.message)

      await supabase
        .from('survey_responses')
        .update({ status: 'confirme', assigned_day: proposal.day, assigned_time: proposal.startTime })
        .eq('id', response.id)

      setConfirming(false)
      return true
    } catch (e) {
      alert('Erreur : ' + e.message)
      setConfirming(false)
      return false
    }
  }

  // ── Acter un sous-ensemble de propositions ───────────────────────────────────
  /**
   * Transforme les propositions sélectionnées en vrais cours récurrents.
   * Réutilise la logique de handleConfirm (même table, même format).
   * Les réponses actées sont retirées de la liste sans rechargement réseau.
   */
  const handleActerSelection = useCallback(async () => {
    if (selectedIds.size === 0) return
    setActingPlan(true)
    setActError('')
    const [, endYear] = currentSchoolYear().split('-').map(Number)
    const endDate     = `${endYear}-06-30`
    const erreurs = []

    for (const responseId of selectedIds) {
      const response = responses.find((r) => r.id === responseId)
      if (!response) continue
      const proposal = proposalOverrides[responseId] ?? proposalsMap[responseId]?.[0]
      if (!proposal) continue

      try {
        const rows = buildLessonRows(teacherInfo.id, response, proposal, endDate)
        const { error: insErr } = await supabase.from('lessons').insert(rows)
        if (insErr) throw new Error(insErr.message)

        await supabase
          .from('survey_responses')
          .update({ status: 'confirme', assigned_day: proposal.day, assigned_time: proposal.startTime })
          .eq('id', responseId)

        // Retire la réponse actée sans rechargement réseau
        setResponses((prev) => prev.filter((r) => r.id !== responseId))
      } catch (e) {
        erreurs.push(`${response.first_name || 'Élève'} : ${e.message}`)
      }
    }

    setSelectedIds(new Set())
    setActingPlan(false)
    if (erreurs.length > 0) setActError('Erreurs : ' + erreurs.join(' | '))
  }, [selectedIds, responses, proposalOverrides, proposalsMap, teacherInfo])

  // ── Label de navigation semaine ────────────────────────────────────────────
  const labelSemaine = useMemo(() => {
    if (weekDays.length === 0) return ''
    const premier = weekDays[0]
    const dernier = weekDays[6]
    const d1 = new Date(premier.iso + 'T12:00:00')
    const d2 = new Date(dernier.iso + 'T12:00:00')
    const opts = { day: 'numeric', month: 'short' }
    return d1.toLocaleDateString('fr-FR', opts) + ' – ' + d2.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' })
  }, [weekDays])

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning intelligent</h1>
              <HelpTooltip texte="Génère des propositions de créneaux en croisant vos disponibilités, celles des élèves et les contraintes de chaque école. Configurez les créneaux dans la page Créneaux écoles." position="bottom" />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-muted-foreground">Propositions de créneaux basées sur les disponibilités et le contexte</p>
              <button
                type="button"
                onClick={() => navigate('/professeur/reglages#planning-intelligent')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Réglages
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground mb-1">Critères de score</p>
          <p>+3 même école déjà planifiée ce jour · +2 créneau adjacent à la même école</p>
          <p>+1 pas de débutants consécutifs · +1 en-dessous du volume d'heures souhaité</p>
          <p>-1 au-dessus du volume souhaité · -2 période de vacances scolaires</p>
          <p className="text-muted">-2 jour à éviter · +1 école proche du domicile (jour préféré) — configurables dans Réglages</p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Analyse des disponibilités…</span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-sm text-guitar-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : responses.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <Clock className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune réponse en attente d'attribution.</p>
          <p className="text-xs text-muted mt-1">Toutes les inscriptions ont déjà un créneau confirmé.</p>
        </div>
      ) : (
        <>
          {/* ── Bandeau de placement — toujours visible ──────────────────────── */}
          {/* Distingue les CONFLITS (créneaux pris par d'autres, résolubles par échange)
              des cas sans disponibilité ou durée incompatible (passe d'échanges inutile) */}
          <div className={`rounded-xl text-xs mb-4 overflow-hidden border
            ${statsPlacement.nonPlacesCount > 0
              ? 'bg-amber-500/8 border-amber-500/20'
              : 'bg-surface-raised border-border-subtle'}`}>
            {/* Ligne de résumé */}
            <div className="flex items-center gap-3 flex-wrap px-4 py-2.5">
              <span className={statsPlacement.nonPlacesCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}>
                <span className="font-semibold text-foreground">{statsPlacement.total}</span> formulaire{statsPlacement.total > 1 ? 's' : ''} en attente
                {' · '}
                <span className="font-semibold text-green-400">{statsPlacement.places}</span> avec proposition
                {statsPlacement.nonPlacesCount > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-amber-400">{statsPlacement.nonPlacesCount}</span> sans proposition
                  </>
                )}
              </span>
              {statsPlacement.conflits.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setVue('grille'); setShowConflicts(true) }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors font-medium"
                >
                  <Layers className="w-3 h-3" />
                  Voir les conflits
                </button>
              )}
            </div>

            {/* Détail par catégorie — affiché uniquement s'il y a des non-placés */}
            {statsPlacement.nonPlacesCount > 0 && (
              <div className="border-t border-amber-500/15 px-4 py-2.5 space-y-1.5">
                {statsPlacement.conflits.length > 0 && (
                  <div>
                    <span className="font-medium text-amber-400">En conflit</span>
                    <span className="text-amber-400/70 ml-1">(créneaux pris, passe d'échanges active)</span>
                    <span className="text-muted-foreground ml-2">
                      {statsPlacement.conflits.map(({ r }) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '?').join(' · ')}
                    </span>
                  </div>
                )}
                {statsPlacement.dureeIncomp.length > 0 && (
                  <div>
                    <span className="font-medium text-muted-foreground">Durée incompatible</span>
                    <span className="text-muted/70 ml-1">(aucune fenêtre assez longue dans les disponibilités)</span>
                    <span className="text-muted-foreground ml-2">
                      {statsPlacement.dureeIncomp.map(({ r }) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '?').join(' · ')}
                    </span>
                  </div>
                )}
                {statsPlacement.sansDispos.length > 0 && (
                  <div>
                    <span className="font-medium text-muted-foreground">Sans disponibilités</span>
                    <span className="text-muted/70 ml-1">(aucun créneau renseigné dans le sondage)</span>
                    <span className="text-muted-foreground ml-2">
                      {statsPlacement.sansDispos.map(({ r }) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '?').join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sélecteur de vue ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex gap-1 p-1 rounded-xl bg-surface-raised border border-border-subtle">
              <button
                type="button"
                onClick={() => setVue('liste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  vue === 'liste' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="w-4 h-4" /> Récapitulatif
              </button>
              <button
                type="button"
                onClick={() => setVue('grille')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  vue === 'grille' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Grille semaine
              </button>
            </div>

            {/* Navigation semaine — visible uniquement en vue grille */}
            {vue === 'grille' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset((v) => v - 1)}
                  className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors"
                  aria-label="Semaine précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground font-medium min-w-[140px] text-center">
                  {labelSemaine}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((v) => v + 1)}
                  className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors"
                  aria-label="Semaine suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-xs text-guitar-400 hover:underline"
                  >
                    Aujourd'hui
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Vue récapitulatif ──────────────────────────────────────────── */}
          {vue === 'liste' && (
            <div className="space-y-4">
              {responses.map((r) => (
                <ProposalCard
                  key={r.id}
                  response={r}
                  proposals={proposalsMap[r.id] ?? []}
                  onConfirm={handleConfirm}
                  confirming={confirming}
                  schools={schools}
                  isLocked={lockedIds.has(r.id)}
                  onToggleLock={handleToggleLock}
                  onViewStudent={(studentId) => navigate(`/eleves/${studentId}`)}
                />
              ))}
            </div>
          )}

          {/* ── Vue grille ────────────────────────────────────────────────── */}
          {vue === 'grille' && (
            <div className="space-y-6">
              {/* Légende + boutons d'action du planning */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-guitar-400 opacity-70" />
                    Proposition (déplaçable)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm border-2 border-solid border-muted" />
                    Cours existant (lecture seule)
                  </span>
                  {showConflicts && (
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-red-400 opacity-80" />
                      En conflit (cliquer pour sélectionner)
                    </span>
                  )}
                  {showConflicts && (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="inline-block w-3 h-3 rounded-sm border-2 border-solid border-emerald-400 opacity-80" />
                      Cours de groupe créé
                    </span>
                  )}
                  <span className="text-muted italic">Glissez une proposition pour ajuster son créneau.</span>
                </div>

                {/* Actions sur le planning provisoire */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Enregistrer le planning provisoire en base */}
                  <button
                    type="button"
                    onClick={() => {
                      const nom = prompt('Nom de ce planning (optionnel) :') ?? ''
                      handleSaveSnapshot(nom)
                    }}
                    disabled={savingSnapshot || Object.keys(proposalOverrides).length === 0}
                    title="Enregistrer l'état actuel des ajustements manuels en base de données"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
                  >
                    {savingSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Enregistrer
                  </button>

                  {/* Charger un planning provisoire sauvegardé */}
                  <button
                    type="button"
                    onClick={handleLoadSnapshots}
                    title="Charger un planning provisoire précédemment sauvegardé"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    Reprendre
                  </button>

                  {/* Recalcul ciblé par jour */}
                  <button
                    type="button"
                    onClick={() => setShowRecalcPanel((v) => !v)}
                    title="Recalculer les propositions non verrouillées pour les jours sélectionnés"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Recalculer
                  </button>

                  {/* Toggle "vue avec chevauchements" — visible seulement s'il y a des élèves non placés */}
                  {statsPlacement.nonPlacesCount > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setShowConflicts((v) => !v); setConflictSelectedIds(new Set()) }}
                        title={showConflicts ? 'Masquer les créneaux en conflit' : 'Afficher les créneaux en conflit'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          showConflicts
                            ? 'border-red-500/40 bg-red-500/10 text-red-400'
                            : 'border-border-subtle text-muted-foreground hover:text-foreground hover:border-border'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {showConflicts ? 'Masquer conflits' : 'Voir conflits'}
                      </button>
                      <HelpTooltip
                        texte="Mode normal : seuls les créneaux sans chevauchement sont affichés. Mode conflits : les élèves sans créneau disponible apparaissent en rouge sur leur première disponibilité déclarée — même si elle chevauche un autre cours. Glissez-les vers un créneau libre pour résoudre le conflit manuellement. Cliquez sur deux élèves en conflit pour les regrouper en cours de groupe."
                        position="bottom"
                      />
                    </div>
                  )}

                  {/* Toggle cascade DnD (T2) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCascadeEnabled((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        cascadeEnabled
                          ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                          : 'border-border-subtle text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {cascadeEnabled ? 'Cascade ON' : 'Cascade'}
                    </button>
                    <HelpTooltip
                      texte="Quand activé, déplacer une proposition vers un créneau déjà occupé relogera automatiquement l'autre élève sur le meilleur créneau libre compatible. Si aucun créneau alternatif n'est trouvé, le déplacement est annulé silencieusement."
                      position="bottom"
                    />
                  </div>
                </div>
              </div>

              {/* Liste des snapshots disponibles — visible après clic sur "Reprendre" */}
              {showSnapshots && (
                <div className="glass-panel rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Plannings provisoires sauvegardés</p>
                    <button
                      type="button"
                      onClick={() => setShowSnapshots(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Fermer
                    </button>
                  </div>
                  {snapshots.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucun planning enregistré pour l'instant.</p>
                  ) : (
                    snapshots.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border-subtle last:border-0">
                        <div>
                          <p className="text-sm font-medium">{s.nom || '(sans nom)'}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.date_creation).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshot(s.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
                          >
                            <BookmarkCheck className="w-3 h-3" />
                            Charger
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSnapshot(s.id, s.nom)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all"
                            title="Supprimer définitivement ce planning"
                          >
                            <Trash2 className="w-3 h-3" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Panneau de recalcul ciblé — visible après clic sur "Recalculer" */}
              {showRecalcPanel && (
                <div className="glass-panel rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">Recalculer les propositions non verrouillées</p>
                    <button
                      type="button"
                      onClick={() => setShowRecalcPanel(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Fermer
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez les jours à recalculer. Les créneaux verrouillés ({lockedIds.size}) ne seront jamais modifiés.
                  </p>
                  {/* Sélecteur de jours : Lundi → Samedi (Dimanche exclu par défaut) */}
                  <div className="flex flex-wrap gap-2">
                    {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((jour) => {
                      const actifs = joursARecalculer ?? ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
                      const estActif = actifs.includes(jour)
                      return (
                        <button
                          key={jour}
                          type="button"
                          onClick={() => {
                            const base = joursARecalculer ?? ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
                            if (estActif) {
                              const next = base.filter((j) => j !== jour)
                              setJoursARecalculer(next.length > 0 ? next : base)
                            } else {
                              setJoursARecalculer([...base, jour])
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            estActif
                              ? 'guitar-gradient text-white border-transparent'
                              : 'border-border-subtle text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {jour}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleRecalculer}
                    disabled={recalculating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-40"
                  >
                    {recalculating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    Lancer le recalcul
                  </button>
                </div>
              )}

              {/* ── Panneau regroupement en cours de groupe ───────────────────── */}
              {/* Visible dès que 2+ leçons sont sélectionnées, que ce soit des conflits auto
                  (rouge, mode showConflicts) ou des chevauchements manuels (orange). */}
              {conflictSelectedIds.size >= 2 && (
                <GroupingPanel
                  selectedCount={conflictSelectedIds.size}
                  conflictLessons={lessonsForGrid}
                  conflictSelectedIds={conflictSelectedIds}
                  nonPlaces={responses}
                  onCancel={() => setConflictSelectedIds(new Set())}
                  onConfirm={handleGrouperConflits}
                  loading={groupingConflicts}
                  error={groupError}
                />
              )}

              {/* Notification éphémère cascade — confirme que l'élève déplacé a été relogé */}
              {cascadeNotif && (
                <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium">
                  {cascadeNotif}
                </div>
              )}

              {/* Grille — les propositions y sont affichées en style "envisagé" (bordure pointillée) */}
              {/* allowOverlap : autorise le chevauchement temporaire lors de la réorganisation
                  manuelle — signalé en orange dans la grille, bloqué à la validation finale. */}
              <WeekGridPlanning
                weekDays={weekDays}
                lessons={lessonsForGrid}
                reservedSlots={reservedSlots}
                validDropZones={validDropZones}
                onNewLesson={() => {}}
                onSelectLesson={() => {}}
                onDeleteLesson={handleDeleteLesson}
                onMoveLesson={handleMoveProposal}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onViewStudent={(lesson) => lesson._studentId && navigate(`/eleves/${lesson._studentId}`)}
                onDurationChange={handleDurationChange}
                onDegrouper={handleDegrouper}
                allowOverlap
                conflictSelectedIds={conflictSelectedIds}
                onToggleConflictSelect={showConflicts ? handleToggleConflictSelect : null}
                cascadeEnabled={cascadeEnabled}
                onCascadeRequest={handleCascadeRequest}
              />

              {/* ── Panneau "Acter ce planning" ──────────────────────────────── */}
              <div className="space-y-3">
                {/* En-tête avec compteur et bouton Acter */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-sm font-medium text-foreground">Acter ce planning</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cochez les élèves à confirmer, puis actez la sélection — les cours récurrents seront créés jusqu'en juin.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Tout sélectionner / tout désélectionner */}
                    <button
                      type="button"
                      onClick={() => {
                        const tousIds = responses
                          .filter((r) => proposalOverrides[r.id] ?? proposalsMap[r.id]?.[0])
                          .map((r) => r.id)
                        if (selectedIds.size === tousIds.length) {
                          setSelectedIds(new Set())
                        } else {
                          setSelectedIds(new Set(tousIds))
                        }
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectedIds.size > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>

                    {/* Bouton Acter — actif seulement si au moins un élève sélectionné
                        ET aucun chevauchement provisoire non résolu dans la grille */}
                    <button
                      type="button"
                      onClick={handleActerSelection}
                      disabled={actingPlan || selectedIds.size === 0 || chevauchementsProvisoires.length > 0}
                      title={chevauchementsProvisoires.length > 0 ? 'Résolvez les chevauchements orange avant d\'acter' : undefined}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-40"
                    >
                      {actingPlan
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <SquareCheckBig className="w-3.5 h-3.5" />}
                      Acter ({selectedIds.size})
                    </button>
                  </div>
                </div>

                {/* Avertissement chevauchements non résolus */}
                {chevauchementsProvisoires.length > 0 && (
                  <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/25 text-xs text-orange-400 space-y-1">
                    <p className="font-medium">
                      {chevauchementsProvisoires.length === 1
                        ? '1 chevauchement à résoudre avant de pouvoir acter :'
                        : `${chevauchementsProvisoires.length} chevauchements à résoudre avant de pouvoir acter :`}
                    </p>
                    {chevauchementsProvisoires.map((c, i) => (
                      <p key={i} className="opacity-80">
                        • {c.a.studentName} et {c.b.studentName} — {c.a.lessonDate} {c.a.lessonTime}–{c.b.lessonTime}
                      </p>
                    ))}
                  </div>
                )}

                {actError && (
                  <p className="text-xs text-guitar-400 px-1">{actError}</p>
                )}

                {/* Une ligne par réponse : case à cocher + détails de la proposition */}
                {responses.map((response) => {
                  const override  = proposalOverrides[response.id]
                  const base      = proposalsMap[response.id]?.[0]
                  const proposal  = override ?? base
                  if (!proposal) return null

                  // Vérifier si la proposition est dans la semaine affichée
                  const isoParJour = {}
                  for (const d of weekDays) {
                    isoParJour[JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]] = d.iso
                  }
                  const dateAffichee = override
                    ? override.candidateDate
                    : (isoParJour[proposal.day] ?? proposal.candidateDate)
                  const dansLaSemaine = weekDays.some((d) => d.iso === dateAffichee)
                  const estSelectionne = selectedIds.has(response.id)

                  return (
                    <div
                      key={response.id}
                      onClick={() => setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(response.id)) next.delete(response.id)
                        else next.add(response.id)
                        return next
                      })}
                      className={`glass-panel rounded-xl p-3 flex items-center gap-3 flex-wrap cursor-pointer transition-all select-none
                        ${dansLaSemaine ? '' : 'opacity-50'}
                        ${estSelectionne ? 'ring-2 ring-guitar-400/60 bg-guitar-600/5' : 'hover:bg-surface-overlay/30'}`}
                    >
                      {/* Case à cocher visuelle */}
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                        ${estSelectionne ? 'bg-guitar-500 border-guitar-500' : 'border-border'}`}>
                        {estSelectionne && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {response.first_name || '—'} {response.last_name || ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {proposal.day} · {proposal.startTime} · {proposal.durationMinutes} min
                          {override && <span className="ml-1.5 text-guitar-400">✎ modifié</span>}
                        </p>
                        {!Object.values(response.availabilities ?? {}).some((s) => Array.isArray(s) && s.length > 0) && (
                          <p className="text-[10px] text-amber-400 mt-0.5">
                            Aucune disponibilité connue — déplacement libre
                          </p>
                        )}
                        {!dansLaSemaine && (
                          <p className="text-[10px] text-muted mt-0.5 italic">
                            Naviguez vers la bonne semaine pour voir cette proposition dans la grille
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Verrou — stoppe propagation pour éviter le toggle de sélection */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleLock(response.id) }}
                          title={lockedIds.has(response.id) ? 'Déverrouiller' : 'Verrouiller (ne sera pas recalculé)'}
                          className={`p-1 rounded-lg transition-colors ${lockedIds.has(response.id) ? 'text-amber-400 hover:text-amber-300' : 'text-muted hover:text-foreground'}`}
                        >
                          {lockedIds.has(response.id) ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                        </button>
                        <ScoreBadge score={proposal.score} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
