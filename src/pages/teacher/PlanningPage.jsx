import { useCallback, useMemo, useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ClipboardCheck, ChevronLeft, ChevronRight, Download, HelpCircle, Eye, EyeOff, Navigation } from 'lucide-react'
import { downloadIcs } from '../../utils/icsExport'
import { currentSchoolYear } from '../../services/schools'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchLessonsInRange, updateLessonPlanningStatus } from '../../services/lessons'
import { fetchTeacherSchools } from '../../services/schools'
import { startOfWeek, toISODate } from '../../utils/format'
import { getPériodes, getCurrentPériode } from '../../utils/vacances'
import AddLessonModal from '../../components/AddLessonModal'
import LessonStatusModal from '../../components/LessonStatusModal'
import { getStatusInfo } from '../../utils/lessonStatus'
import DeleteLessonModal from '../../components/DeleteLessonModal'
import YearView from "../../components/YearView"
import WeekGridView from "../../components/WeekGridView"
import MonthView from '../../components/MonthView'
import WeekGridPlanning from '../../components/WeekGridPlanning'

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const VIEWS = [{ value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' }, { value: 'période', label: 'Période scolaire' }, { value: 'année', label: 'Année' }]

export default function PlanningPage() {
  const { user } = useAuth()
  const zone = user.schoolZone ?? 'B'
  const [view, setView] = useState('semaine')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [périodeIndex, setPériodeIndex] = useState(() => {
    const périodes = getPériodes(zone)
    const current = getCurrentPériode(zone)
    return périodes.findIndex((p) => p.nom === current.nom)
  })
  const [selectedDay, setSelectedDay] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editLesson, setEditLesson] = useState(null)
  const [statusLesson, setStatusLesson] = useState(null)
  const [deleteLessonItem, setDeleteLessonItem] = useState(null)
  const [showIcsPanel, setShowIcsPanel] = useState(false)
  const [newLessonDraft, setNewLessonDraft] = useState(null)
  const [hideEnvisages, setHideEnvisages] = useState(false)
  const [togglingId, setTogglingId] = useState(null)
  // Coordonnées GPS des écoles indexées par nom (pour les boutons de navigation)
  const [schoolCoords, setSchoolCoords] = useState({})

  useEffect(() => {
    fetchTeacherSchools(user.id).then((schools) => {
      const map = {}
      schools.forEach((s) => { if (s.name) map[s.name] = { lat: s.latitude, lng: s.longitude, address: s.address } })
      setSchoolCoords(map)
    }).catch(() => {})
  }, [user.id])

  const [icsRange, setIcsRange] = useState(() => {
    const yr = currentSchoolYear()
    const [y1, y2] = yr.split('-').map(Number)
    return { from: `${y1}-09-01`, to: `${y2}-07-31` }
  })

  const périodes = useMemo(() => getPériodes(zone), [zone])

  const weekStart = useMemo(() => {
    const base = startOfWeek()
    base.setDate(base.getDate() + weekOffset * 7)
    return base
  }, [weekOffset])

  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(e.getDate() + 6)
    return e
  }, [weekStart])

  const monthDate = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const range = useMemo(() => {
    if (view === 'mois') {
      const year = monthDate.getFullYear()
      const month = monthDate.getMonth()
      const from = new Date(year, month, 1); from.setDate(from.getDate() - 7)
      const to = new Date(year, month + 1, 0); to.setDate(to.getDate() + 7)
      return { from: toISODate(from), to: toISODate(to) }
    }
    if (view === 'période') {
      const p = périodes[périodeIndex] ?? périodes[0]
      return { from: p.debut, to: p.fin }
    }
    if (view === 'année') {
      return { from: périodes[0].debut, to: périodes[périodes.length - 1].fin }
    }
    return { from: toISODate(weekStart), to: toISODate(weekEnd) }
  }, [view, monthDate, weekStart, weekEnd, périodes, périodeIndex])

  const load = useCallback(() => {
    return fetchLessonsInRange({ teacherId: user.id, from: range.from, to: range.to })
  }, [user.id, range.from, range.to])

  const { data: lessons, loading, error, reload } = useFetch(load, [user.id, range.from, range.to])

  const weekLabel = useMemo(() => {
    const opts = { day: 'numeric', month: 'long' }
    return 'Semaine du ' + weekStart.toLocaleDateString('fr-FR', opts) + ' au ' + weekEnd.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' })
  }, [weekStart, weekEnd])

  const monthLabel = useMemo(() => monthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), [monthDate])

  const headerLabel = useMemo(() => {
    if (view === 'mois') return monthLabel
    if (view === 'période') return (périodes[périodeIndex] ?? périodes[0]).nom
    if (view === 'année') return 'Année scolaire 2025-2026'
    return weekLabel
  }, [view, monthLabel, périodes, périodeIndex, weekLabel])

  const weekDays = useMemo(() => {
    return days.map((label, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const iso = toISODate(d)
      const isToday = iso === toISODate(new Date())
      const count = (lessons ?? []).filter((l) => l.lessonDate === iso).length
      return { label, dayNum: d.getDate(), iso, isToday, count }
    })
  }, [weekStart, lessons])

  const displayedLessons = useMemo(() => {
    let all = lessons ?? []
    if (hideEnvisages) all = all.filter((l) => l.planningStatus !== 'envisage')
    if (selectedDay) return all.filter((l) => l.lessonDate === selectedDay)
    if (view === 'semaine') {
      const from = toISODate(weekStart), to = toISODate(weekEnd)
      return all.filter((l) => l.lessonDate >= from && l.lessonDate <= to)
    }
    return all
  }, [lessons, selectedDay, view, weekStart, weekEnd, hideEnvisages])

  // Génère l'URL de navigation GPS selon la préférence du prof et la disponibilité des coordonnées
  const buildGpsUrl = (schoolName) => {
    if (!schoolName) return null
    const coords = schoolCoords[schoolName]
    const navApp = user.navApp ?? 'google_maps'
    if (coords?.lat && coords?.lng) {
      return navApp === 'waze'
        ? `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`
        : `https://maps.google.com/?daddr=${coords.lat},${coords.lng}`
    }
    // Fallback : recherche par nom d'école
    const encoded = encodeURIComponent(schoolName)
    return navApp === 'waze'
      ? `https://waze.com/ul?q=${encoded}`
      : `https://maps.google.com/?q=${encoded}`
  }

  const togglePlanningStatus = async (lesson) => {
    const next = lesson.planningStatus === 'envisage' ? 'confirme' : 'envisage'
    setTogglingId(lesson.id)
    try {
      await updateLessonPlanningStatus(lesson.id, next)
      reload()
    } finally {
      setTogglingId(null)
    }
  }

  const showNav = view === 'semaine' || view === 'mois'

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning</h1>
          <p className="text-muted-foreground mt-1">{headerLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            Ajouter un cours
          </button>
          <button
            type="button"
            onClick={() => setHideEnvisages((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              hideEnvisages
                ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                : 'border-border-subtle hover:bg-surface-overlay'
            }`}
            title={hideEnvisages ? 'Afficher les cours envisagés' : 'Masquer les cours envisagés'}
          >
            {hideEnvisages ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {hideEnvisages ? 'Envisagés masqués' : 'Envisagés visibles'}
          </button>
          <button type="button" onClick={() => setShowIcsPanel((v) => !v)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">
            <Download className="w-4 h-4" />
            Exporter .ics
          </button>
        </div>
      </header>

      {showIcsPanel && (
        <div className="glass-panel rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Exporter mon planning (.ics)</p>
          <p className="text-xs text-muted-foreground mb-3">
            Génère un fichier importable directement dans Calendrier (macOS/iOS) par double-clic. Les cours annulés sont inclus.
          </p>
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Du</label>
              <input type="date" value={icsRange.from} onChange={(e) => setIcsRange((r) => ({ ...r, from: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Au</label>
              <input type="date" value={icsRange.to} onChange={(e) => setIcsRange((r) => ({ ...r, to: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
            </div>
            <button
              type="button"
              onClick={() => {
                const filtered = (lessons ?? []).filter((l) => l.lessonDate >= icsRange.from && l.lessonDate <= icsRange.to)
                const yr = currentSchoolYear()
                downloadIcs(filtered, `planning-guitare-${yr}.ics`)
              }}
              disabled={!(lessons ?? []).length}
              className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Télécharger ({(lessons ?? []).filter((l) => l.lessonDate >= icsRange.from && l.lessonDate <= icsRange.to).length} cours)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sur iPhone ou iPad : ouvrez le fichier depuis Mail ou Fichiers — Calendrier proposera de l'importer directement.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {VIEWS.map((v) => (
          <button key={v.value} onClick={() => { setView(v.value); setSelectedDay(null) }}
            className={'px-4 py-2 rounded-xl border text-sm font-medium transition-colors ' + (view === v.value ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay')}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'période' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {périodes.map((p, i) => (
            <button key={p.nom} onClick={() => { setPériodeIndex(i); setSelectedDay(null) }}
              className={'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ' + (périodeIndex === i ? 'bg-guitar-600/20 text-guitar-400 border-guitar-600/40' : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}>
              {p.nom}
            </button>
          ))}
        </div>
      )}

      {showNav && (
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => { view === 'mois' ? setMonthOffset((m) => m - 1) : setWeekOffset((w) => w - 1); setSelectedDay(null) }} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Précédent
          </button>
          {(weekOffset !== 0 || monthOffset !== 0 || selectedDay) && (
            <button onClick={() => { setWeekOffset(0); setMonthOffset(0); setSelectedDay(null) }} className="px-3 py-2 rounded-xl border border-guitar-600/40 text-guitar-400 text-sm hover:bg-guitar-600/10 transition-colors">
              Aujourd'hui
            </button>
          )}
          <button onClick={() => { view === 'mois' ? setMonthOffset((m) => m + 1) : setWeekOffset((w) => w + 1); setSelectedDay(null) }} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors">
            Suivant
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Vue Semaine : grille interactive 08h–22h */}
      {view === 'semaine' && !loading && !error && (
        <WeekGridPlanning
          weekDays={weekDays}
          lessons={displayedLessons}
          onNewLesson={(draft) => setNewLessonDraft(draft)}
          onSelectLesson={(lesson) => setEditLesson(lesson)}
        />
      )}
      {view === 'semaine' && loading && <LoadingBlock label="Chargement du planning" />}
      {view === 'semaine' && error && <ErrorBlock message={error} onRetry={reload} />}

      {view === 'année' && !selectedDay && (
        loading ? null : (
          <YearView
            lessons={lessons ?? []}
            onSelectDay={(iso) => { setSelectedDay(iso); }}
          />
        )
      )}

      {view === 'mois' && !selectedDay ? (
        loading ? <LoadingBlock label="Chargement" /> : error ? <ErrorBlock message={error} onRetry={reload} /> : (
          <MonthView monthDate={monthDate} lessons={lessons ?? []} zone={zone} onSelectDay={(iso) => setSelectedDay(iso)} onSelectLesson={(l) => setStatusLesson(l)} />
        )
      ) : view !== 'semaine' ? (
        <>
          {selectedDay && (
            <button onClick={() => setSelectedDay(null)} className="text-sm text-guitar-400 mb-4 hover:underline">
              ← Retour
            </button>
          )}
          {loading ? <LoadingBlock label="Chargement du planning" /> : error ? <ErrorBlock message={error} onRetry={reload} /> : displayedLessons.length === 0 ? (
            <EmptyBlock message="Aucun cours sur cette période." />
          ) : (
            <div className="space-y-3">
              {displayedLessons.map((lesson) => {
                const statusInfo  = getStatusInfo(lesson.status)
                const isEnvisage  = lesson.planningStatus === 'envisage'
                const toggling    = togglingId === lesson.id
                return (
                  <article
                    key={lesson.id}
                    className={`glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-opacity ${isEnvisage ? 'opacity-70' : ''}`}
                    style={{
                      borderLeft: `4px ${isEnvisage ? 'dashed' : 'solid'} ${isEnvisage ? '#9ca3af' : statusInfo.color}`,
                    }}
                  >
                    <div className="sm:w-32 shrink-0">
                      <p className="font-medium" style={{ color: isEnvisage ? '#9ca3af' : statusInfo.color }}>{lesson.dateLabel}</p>
                      <p className={`text-2xl font-semibold ${isEnvisage ? 'text-muted-foreground' : ''}`}>{lesson.timeLabel}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-semibold text-lg ${isEnvisage ? 'italic text-muted-foreground' : ''}`}>{lesson.studentName || 'Élève'}</h3>
                        {isEnvisage && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                            <HelpCircle className="w-2.5 h-2.5" />
                            Envisagé
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1">{lesson.topic}</p>
                      {lesson.notes && <p className="text-xs text-muted-foreground mt-1 italic">{lesson.notes}</p>}
                      {lesson.absenceReason && <p className="text-xs mt-1 italic" style={{ color: statusInfo.color }}>Motif : {lesson.absenceReason}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!isEnvisage && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: statusInfo.color + '20', borderColor: statusInfo.color + '50', color: statusInfo.color }}>
                          {statusInfo.emoji} {statusInfo.label}
                        </span>
                      )}
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
                        {lesson.durationMinutes} min
                      </span>
                      {lesson.recurrenceGroup && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25">
                          Récurrent
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 self-start sm:self-center flex-wrap">
                      {lesson.schoolName && buildGpsUrl(lesson.schoolName) && (
                        <a
                          href={buildGpsUrl(lesson.schoolName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Naviguer vers ${lesson.schoolName}`}
                          className="p-2 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Navigation className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => togglePlanningStatus(lesson)}
                        disabled={toggling}
                        title={isEnvisage ? 'Confirmer ce cours' : 'Marquer comme envisagé'}
                        className={`p-2 rounded-lg border transition-colors ${
                          isEnvisage
                            ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                            : 'border-border-subtle text-muted hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                      {!isEnvisage && (
                        <button onClick={() => setStatusLesson(lesson)} title="Émargement" className="p-2 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors text-guitar-400">
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setEditLesson(lesson)} title="Modifier" className="p-2 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteLessonItem(lesson)} title="Supprimer" className="p-2 rounded-lg border border-guitar-600/40 text-guitar-400 hover:bg-guitar-600/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : null}

      {showAddForm && <AddLessonModal teacherId={user.id} onClose={() => setShowAddForm(false)} onCreated={() => reload()} />}
      {newLessonDraft && <AddLessonModal teacherId={user.id} lesson={newLessonDraft} onClose={() => setNewLessonDraft(null)} onCreated={() => { reload(); setNewLessonDraft(null) }} />}
      {editLesson && <AddLessonModal teacherId={user.id} lesson={editLesson} onClose={() => setEditLesson(null)} onCreated={() => { reload(); setEditLesson(null) }} />}
      {statusLesson && <LessonStatusModal lesson={statusLesson} onClose={() => setStatusLesson(null)} onUpdated={() => { reload(); setStatusLesson(null) }} />}
      {deleteLessonItem && <DeleteLessonModal lesson={deleteLessonItem} onClose={() => setDeleteLessonItem(null)} onDeleted={() => { reload(); setDeleteLessonItem(null) }} />}
    </div>
  )
}
