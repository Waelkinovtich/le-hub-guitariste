import { useCallback, useEffect, useState } from 'react'
import { FileDown, CalendarDays, Pencil, Trash2, EyeOff, Eye, Users, ChevronDown, ChevronUp } from 'lucide-react'
import AttendanceQuickActions from '../../components/AttendanceQuickActions'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useRegisterRefresh } from '../../contexts/RefreshContext'
import { useUndoRedo } from '../../contexts/UndoRedoContext'
import { fetchLessonsInRange, updateLessonStatus } from '../../services/lessons'
import GroupMembresPanel from '../../components/GroupMembresPanel'
import { supabase } from '../../lib/supabase'
import { fetchSchoolNames } from '../../services/students'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { exportÉmargementPDF } from '../../utils/exportPDF'
import { usePeriod, filterLessonsByPeriod } from '../../context/PeriodContext'
import { LESSON_STATUSES } from '../../utils/lessonStatus'
import { minutesToLabel } from '../../utils/format'
import LessonStatusModal from '../../components/LessonStatusModal'
import AddLessonModal from '../../components/AddLessonModal'
import DeleteLessonModal from '../../components/DeleteLessonModal'
import HelpTooltip from '../../components/HelpTooltip'

const PERIODS = [
  { value: 'aujourd_hui', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois' },
  { value: 'trimestre', label: 'Ce trimestre' },
  { value: 'année', label: 'Cette année' },
]

// Reconstruits depuis lessonStatus.js — source unique de vérité.
const STATUS_COLORS = LESSON_STATUSES.reduce((acc, s) => { acc[s.value] = s.color; return acc }, {})
const STATUS_LABELS = LESSON_STATUSES.reduce((acc, s) => {
  // Raccourci "Annulé" pour l'affichage compact du tableau d'émargement.
  acc[s.value] = s.value === 'annule_prof' ? 'Annulé' : s.label.replace('Absent (non excusé)', 'Absent')
  return acc
}, {})

function getRange(period) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

  if (period === 'aujourd_hui') {
    const today = fmt(now)
    return { from: today, to: today, label: "Aujourd'hui — " + now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) }
  }
  if (period === 'semaine') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const start = new Date(now); start.setDate(now.getDate() - day)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return { from: fmt(start), to: fmt(end), label: 'Semaine du ' + start.toLocaleDateString('fr-FR') }
  }
  if (period === 'mois') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: fmt(start), to: fmt(end), label: new Date(now.getFullYear(), now.getMonth()).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
  }
  if (period === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3)
    const start = new Date(now.getFullYear(), q * 3, 1)
    const end = new Date(now.getFullYear(), q * 3 + 3, 0)
    return { from: fmt(start), to: fmt(end), label: 'T' + (q + 1) + ' ' + now.getFullYear() }
  }
  const start = new Date(now.getFullYear(), 0, 1)
  const end = new Date(now.getFullYear(), 11, 31)
  return { from: fmt(start), to: fmt(end), label: String(now.getFullYear()) }
}

// fmtDuree : utiliser minutesToLabel importé depuis utils/format.js
const fmtDuree = minutesToLabel


export default function ÉmargementPage() {
  const { user } = useAuth()
  const { period: periodCtx } = usePeriod()
  const [period, setPeriod] = useState('mois')
  const [filterSchool, setFilterSchool] = useState('')
  const [statusOverrides, setStatusOverrides] = useState({})         // group sessions
  const [lessonStatusOverrides, setLessonStatusOverrides] = useState({}) // cours individuels
  const [showOnlyUnemarged, setShowOnlyUnemarged] = useState(false)
  const [statusLesson, setStatusLesson] = useState(null)
  const [editLesson, setEditLesson]     = useState(null)
  const [deleteLesson, setDeleteLesson] = useState(null)
  // Séances de groupe dont le panneau membres est ouvert (Set de sessionId)
  const [openGroupPanels, setOpenGroupPanels] = useState(new Set())

  const range = getRange(period)

  const load = useCallback(async () => {
    const [lessons, schools] = await Promise.all([
      fetchLessonsInRange({ teacherId: user.id, from: range.from, to: range.to }),
      fetchSchoolNames(user.id),
    ])
    return { lessons, schools }
  }, [user.id, range.from, range.to])

  const { data, loading, error, reload } = useFetch(load, [user.id, period])
  useRegisterRefresh(reload)
  const { pushAction } = useUndoRedo() ?? {}

  // T3 — Applique les déclarations d'absence actives sur les cours "planifié" du prof.
  // Exécuté après chaque chargement (data change). Ne touche que les cours dont le statut
  // est encore 'planifié' (ni déjà émargé manuellement ni overridé dans cette session).
  useEffect(() => {
    if (!data?.lessons?.length) return
    const lessons = data.lessons.filter((l) => !l.isGroup && l.status === 'planifie')
    if (lessons.length === 0) return

    ;(async () => {
      const { data: decls, error: dErr } = await supabase
        .from('absence_declarations')
        .select('student_id,lesson_date,lesson_time,excused,cancelled_at')
        .eq('teacher_id', user.id)
        .gte('lesson_date', range.from)
        .lte('lesson_date', range.to)
        .is('cancelled_at', null)
      if (dErr || !decls?.length) return

      // Normalise HH:MM:SS → HH:MM pour comparer avec lesson.lesson_time
      const toHHMM = (t) => (t ?? '').slice(0, 5)
      const declMap = new Map()
      for (const d of decls) {
        declMap.set(`${d.student_id}|${d.lesson_date}|${toHHMM(d.lesson_time)}`, d)
      }

      for (const lesson of lessons) {
        const key = `${lesson.studentId}|${lesson.lessonDate}|${toHHMM(lesson.lessonTime)}`
        const decl = declMap.get(key)
        if (!decl) continue
        const newStatus = decl.excused ? 'excuse' : 'absent'
        // Mise à jour optimiste
        setLessonStatusOverrides((prev) => ({ ...prev, [lesson.id]: newStatus }))
        try {
          await updateLessonStatus(lesson.id, newStatus, null, null)
        } catch {
          setLessonStatusOverrides((prev) => { const n = { ...prev }; delete n[lesson.id]; return n })
        }
      }
    })()
  }, [data, user.id, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const periodFiltered = filterLessonsByPeriod(data?.lessons ?? [], periodCtx)
  const allItems = periodFiltered.filter((l) => !filterSchool || l.schoolName === filterSchool || l.student?.school_name === filterSchool || (filterSchool === 'particulier' && !l.student?.school_name && !l.isGroup))
  const allLessons = allItems.filter((l) => !l.isGroup)
  // Filtre "non émargés" : status === 'planifie' (jamais modifié depuis la création)
  const lessons = showOnlyUnemarged
    ? allLessons.filter((l) => (lessonStatusOverrides[l.id] ?? l.status) === 'planifie')
    : allLessons
  const groupSessions = allItems.filter((l) => l.isGroup)
  const schools = data?.schools ?? []

  const handleExport = () => {
    exportÉmargementPDF({
      lessons,
      school: filterSchool || 'Tous',
      period: range.label,
      teacherName:    user.name,
      teacherAddress: user.address,
      teacherPhone:   user.phone,
      teacherEmail:   user.email,
    })
  }

  // Marque immédiatement "présent" sans ouvrir la modale — clic unique pour l'action la plus fréquente.
  // Mise à jour optimiste : l'UI répond instantanément, pas de rechargement.
  const handleQuickPresent = useCallback(async (lesson) => {
    const previousStatus = lesson.status  // statut avant le clic pour l'undo
    setLessonStatusOverrides((prev) => ({ ...prev, [lesson.id]: 'present' }))
    try {
      await updateLessonStatus(lesson.id, 'present', null, null)
      // Enregistre l'action dans le stack undo/redo
      pushAction?.({
        label: `Présent — ${lesson.studentName ?? 'cours'}`,
        undo: async () => {
          setLessonStatusOverrides((prev) => ({ ...prev, [lesson.id]: previousStatus }))
          await updateLessonStatus(lesson.id, previousStatus, null, null)
        },
        redo: async () => {
          setLessonStatusOverrides((prev) => ({ ...prev, [lesson.id]: 'present' }))
          await updateLessonStatus(lesson.id, 'present', null, null)
        },
      })
    } catch (e) {
      // Annule l'override si l'appel échoue
      setLessonStatusOverrides((prev) => { const n = { ...prev }; delete n[lesson.id]; return n })
      alert('Erreur : ' + e.message)
    }
  }, [pushAction])

  const presents = allLessons.filter((l) => (lessonStatusOverrides[l.id] ?? l.status) === 'present').length
  const absents = allLessons.filter((l) => (lessonStatusOverrides[l.id] ?? l.status) === 'absent').length
  const excuses = allLessons.filter((l) => (lessonStatusOverrides[l.id] ?? l.status) === 'excuse').length
  const annulés = allLessons.filter((l) => (lessonStatusOverrides[l.id] ?? l.status) === 'annule_prof').length
  const taux = allLessons.length > 0 ? Math.round((presents / allLessons.length) * 100) : 0

  return (
    <>
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Émargement</h1>
            <HelpTooltip texte="Validez chaque cours : présence de l'élève, annulation, absence. Les cours marqués « Annulé par le professeur » alimentent la page Heures à rattraper." />
          </div>
          <p className="text-muted-foreground mt-1">Feuilles de présence et exports PDF</p>
        </div>
        <button type="button" onClick={handleExport} disabled={lessons.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          <FileDown className="w-4 h-4" />
          Exporter en PDF
        </button>
      </header>

      {periodCtx.mode !== 'toutes' && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-xs text-guitar-400">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          Filtre temporel global actif — seuls les cours correspondant à la période sélectionnée dans la barre latérale sont affichés.
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" onClick={() => setPeriod(p.value)}
              className={'px-3 py-2 rounded-xl border text-sm font-medium transition-colors ' + (period === p.value ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay')}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)} className="px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
          <option value="">Toutes écoles</option>
          <option value="particulier">Cours particuliers</option>
          {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Filtre "non encore émargés" — pour enchaîner rapidement les présences */}
        <button
          type="button"
          onClick={() => setShowOnlyUnemarged((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
            showOnlyUnemarged
              ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
              : 'border-border-subtle hover:bg-surface-overlay'
          }`}
          title={showOnlyUnemarged ? 'Afficher tous les cours' : 'Afficher uniquement les cours non encore émargés'}
        >
          {showOnlyUnemarged ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          Non émargés
        </button>
      </div>

      {loading ? <LoadingBlock label="Chargement..." /> : error ? <ErrorBlock message={error} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total', value: lessons.length, color: '#7f8c8d' },
              { label: 'Présents', value: presents, color: '#27ae60' },
              { label: 'Absents', value: absents, color: '#e74c3c' },
              { label: 'Excusés', value: excuses, color: '#e67e22' },
              { label: 'Taux', value: taux + '%', color: '#3498db' },
            ].map((stat) => (
              <div key={stat.label} className="glass-panel rounded-xl p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {lessons.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-muted-foreground">Aucun cours sur cette période.</div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Heure</th>
                    <th className="px-4 py-3 font-medium">Élève</th>
                    <th className="px-4 py-3 font-medium">Thème</th>
                    <th className="px-4 py-3 font-medium">Durée</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((lesson) => {
                    const effectiveStatus = lessonStatusOverrides[lesson.id] ?? lesson.status
                    const color = STATUS_COLORS[effectiveStatus] ?? '#7f8c8d'
                    const isPresent = effectiveStatus === 'present'
                    const isPlanifie = effectiveStatus === 'planifie'
                    return (
                      <tr key={lesson.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3">{lesson.dateLabel}</td>
                        <td className="px-4 py-3">{lesson.timeLabel}</td>
                        <td className="px-4 py-3 font-medium">{lesson.studentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lesson.topic}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDuree(lesson.durationMinutes)}</td>
                        <td className="px-4 py-3">
                          <AttendanceQuickActions
                            variant="row"
                            effectiveStatus={effectiveStatus}
                            onPresent={() => handleQuickPresent(lesson)}
                            onOpenModal={() => setStatusLesson(lesson)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditLesson(lesson)}
                              title="Modifier ce cours"
                              className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-muted hover:text-foreground hover:bg-surface-overlay transition-colors"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {/* Suppression uniquement si le cours n'a jamais eu lieu (planifié) */}
                            {isPlanifie && (
                              <button
                                type="button"
                                onClick={() => setDeleteLesson(lesson)}
                                title="Supprimer ce cours (jamais donné)"
                                className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {groupSessions.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">Séances de groupe</h2>
                <HelpTooltip texte="Les séances de groupe regroupent plusieurs élèves sur un même créneau. Elles s'émargent comme les cours individuels." position="right" />
              </div>
              <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Heure</th>
                      <th className="px-4 py-3 font-medium">Groupe</th>
                      <th className="px-4 py-3 font-medium">Durée</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupSessions.map((g) => {
                      const gColors = { prevue: '#7f8c8d', effectuee: '#27ae60', annulee: '#9b59b6' }
                      const gStatus = statusOverrides[g.sessionId] || g.sessionStatus || 'prevue'
                      const color = gColors[gStatus] ?? '#7f8c8d'
                      const panelOpen = openGroupPanels.has(g.sessionId)
                      return (
                        <>
                        <tr key={g.id} className="border-b border-border-subtle">
                          <td className="px-4 py-3">{g.dateLabel}</td>
                          <td className="px-4 py-3">{g.timeLabel}</td>
                          <td className="px-4 py-3 font-medium">
                            <button
                              type="button"
                              onClick={() => setOpenGroupPanels(prev => {
                                const n = new Set(prev)
                                panelOpen ? n.delete(g.sessionId) : n.add(g.sessionId)
                                return n
                              })}
                              className="flex items-center gap-1.5 hover:text-guitar-400 transition-colors"
                              title="Émarger les membres"
                            >
                              <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              {g.topic}
                              {panelOpen
                                ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDuree(g.durationMinutes)}</td>
                          <td className="px-4 py-3">
                            <select value={gStatus} onChange={async (e) => { const v = e.target.value; setStatusOverrides((prev) => ({ ...prev, [g.sessionId]: v })); await supabase.from('group_sessions').update({ status: v }).eq('id', g.sessionId) }}
                              className="px-2 py-1 rounded-lg text-xs font-medium border bg-surface-raised outline-none" style={{ borderColor: color + '50', color }}>
                              <option value="prevue">Prévue</option>
                              <option value="effectuee">Effectuée</option>
                              <option value="annulee">Annulée</option>
                            </select>
                          </td>
                        </tr>
                        {panelOpen && g.sessionId && g._groupId && (
                          <tr key={g.id + '-members'} className="border-b border-border-subtle bg-surface-overlay/30">
                            <td colSpan={5} className="px-6 pb-3 pt-1">
                              <GroupMembresPanel
                                sessionId={g.sessionId}
                                groupId={g._groupId}
                                teacherId={user.id}
                              />
                            </td>
                          </tr>
                        )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    {statusLesson && (
      <LessonStatusModal
        lesson={statusLesson}
        onClose={() => setStatusLesson(null)}
        onUpdated={(newStatus) => {
          if (newStatus && statusLesson) {
            const prev = statusLesson.status
            const lid = statusLesson.id
            // Mise à jour optimiste — préserve la position de défilement
            setLessonStatusOverrides((o) => ({ ...o, [lid]: newStatus }))
            pushAction?.({
              label: `Émargement — ${statusLesson.studentName ?? 'cours'}`,
              undo: async () => {
                setLessonStatusOverrides((o) => ({ ...o, [lid]: prev }))
                await updateLessonStatus(lid, prev, null, null)
              },
              redo: async () => {
                setLessonStatusOverrides((o) => ({ ...o, [lid]: newStatus }))
                await updateLessonStatus(lid, newStatus, null, null)
              },
            })
          }
          setStatusLesson(null)
        }}
      />
    )}
    {editLesson && (
      <AddLessonModal
        teacherId={user.id}
        lesson={editLesson}
        onClose={() => setEditLesson(null)}
        onCreated={() => { reload(); setEditLesson(null) }}
      />
    )}
    {deleteLesson && (
      <DeleteLessonModal
        lesson={deleteLesson}
        onClose={() => setDeleteLesson(null)}
        onDeleted={() => { reload(); setDeleteLesson(null) }}
      />
    )}
    </>
  )
}
