import { useCallback, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ClipboardCheck } from 'lucide-react'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchLessonsInRange, deleteLesson } from '../../services/lessons'
import { endOfWeek, formatWeekRange, startOfWeek, toISODate } from '../../utils/format'
import AddLessonModal from '../../components/AddLessonModal'
import LessonStatusModal, { getStatusInfo } from '../../components/LessonStatusModal'

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function PlanningPage() {
  const { user } = useAuth()
  const weekStart = useMemo(() => startOfWeek(), [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editLesson, setEditLesson] = useState(null)
  const [statusLesson, setStatusLesson] = useState(null)

  const load = useCallback(() => {
    const start = startOfWeek()
    const end = endOfWeek()
    return fetchLessonsInRange({ teacherId: user.id, from: toISODate(start), to: toISODate(end) })
  }, [user.id])

  const { data: lessons, loading, error, reload } = useFetch(load, [user.id])

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

  const handleDelete = async (lesson) => {
    if (!window.confirm('Supprimer ce cours ?')) return
    try {
      await deleteLesson(lesson.id)
      reload()
    } catch (err) {
      alert('Erreur : ' + err.message)
    }
  }

  if (loading) return <LoadingBlock label="Chargement du planning" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const weekLessons = lessons ?? []

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning</h1>
          <p className="text-muted-foreground mt-1">{formatWeekRange()}</p>
        </div>
        <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Ajouter un cours
        </button>
      </header>

      <div className="grid grid-cols-7 gap-2 mb-8">
        {weekDays.map(({ label, dayNum, isToday, count }) => (
          <div key={label} className={'text-center py-3 rounded-xl text-sm font-medium ' + (isToday ? 'guitar-gradient text-white' : 'glass-panel text-muted-foreground')}>
            {label}
            <span className="block text-lg mt-0.5 font-semibold">{dayNum}</span>
            {count > 0 && (
              <span className={'inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full ' + (isToday ? 'bg-white/20' : 'bg-guitar-600/20 text-guitar-400')}>
                {count} cours
              </span>
            )}
          </div>
        ))}
      </div>

      {weekLessons.length === 0 ? (
        <EmptyBlock message="Aucun cours cette semaine. Cliquez sur Ajouter un cours pour commencer." />
      ) : (
        <div className="space-y-3">
          {weekLessons.map((lesson) => {
            const statusInfo = getStatusInfo(lesson.status)
            return (
              <article key={lesson.id} className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderLeft: '4px solid ' + statusInfo.color }}>
                <div className="sm:w-32 shrink-0">
                  <p className="font-medium" style={{ color: statusInfo.color }}>{lesson.dateLabel}</p>
                  <p className="text-2xl font-semibold">{lesson.timeLabel}</p>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{lesson.studentName || 'Eleve'}</h3>
                  <p className="text-muted-foreground mt-1">{lesson.topic}</p>
                  {lesson.notes && <p className="text-xs text-muted-foreground mt-1 italic">{lesson.notes}</p>}
                  {lesson.absenceReason && <p className="text-xs mt-1 italic" style={{ color: statusInfo.color }}>Motif : {lesson.absenceReason}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: statusInfo.color + '20', borderColor: statusInfo.color + '50', color: statusInfo.color }}>
                    {statusInfo.emoji} {statusInfo.label}
                  </span>
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
                    {lesson.durationMinutes} min
                  </span>
                </div>
                <div className="flex gap-2 self-start sm:self-center">
                  <button onClick={() => setStatusLesson(lesson)} title="Emargement" className="p-2 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors text-guitar-400">
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditLesson(lesson)} title="Modifier" className="p-2 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(lesson)} title="Supprimer" className="p-2 rounded-lg border border-guitar-600/40 text-guitar-400 hover:bg-guitar-600/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showAddForm && <AddLessonModal teacherId={user.id} onClose={() => setShowAddForm(false)} onCreated={() => reload()} />}
      {editLesson && <AddLessonModal teacherId={user.id} lesson={editLesson} onClose={() => setEditLesson(null)} onCreated={() => { reload(); setEditLesson(null) }} />}
      {statusLesson && <LessonStatusModal lesson={statusLesson} onClose={() => setStatusLesson(null)} onUpdated={() => { reload(); setStatusLesson(null) }} />}
    </div>
  )
}
