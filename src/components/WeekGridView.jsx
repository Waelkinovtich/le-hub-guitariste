import { useMemo } from 'react'
import { ClipboardCheck, Pencil, Trash2 } from 'lucide-react'
import { toISODate } from '../utils/format'
import { getStatusInfo } from '../utils/lessonStatus'

const HOUR_START = 8
const HOUR_END = 21
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((HOUR_END - HOUR_START) * 60) / SLOT_MINUTES + 1
const SLOT_HEIGHT = 48

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function timeToSlot(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return ((h - HOUR_START) * 60 + m) / SLOT_MINUTES
}

function slotToLabel(slot) {
  const totalMin = HOUR_START * 60 + slot * SLOT_MINUTES
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return String(h).padStart(2, '0') + 'h' + (m === 0 ? '00' : String(m))
}

export default function WeekGridView({ weekStart, lessons, onStatus, onEdit, onDelete }) {
  const weekDays = useMemo(() => {
    return days.map((label, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const iso = toISODate(d)
      const isToday = iso === toISODate(new Date())
      return { label, dayNum: d.getDate(), iso, isToday }
    })
  }, [weekStart])

  const lessonsByDay = useMemo(() => {
    const map = {}
    weekDays.forEach(({ iso }) => { map[iso] = [] })
    ;(lessons ?? []).forEach((l) => {
      if (map[l.lessonDate] !== undefined) map[l.lessonDate].push(l)
    })
    return map
  }, [lessons, weekDays])

  const slots = useMemo(() => Array.from({ length: TOTAL_SLOTS }, (_, i) => i), [])

  const totalHeight = TOTAL_SLOTS * SLOT_HEIGHT

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">

        {/* En-tete des jours */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] mb-1">
          <div />
          {weekDays.map(({ label, dayNum, isToday }) => (
            <div key={label} className={'text-center py-2 rounded-xl text-sm font-medium mx-0.5 ' + (isToday ? 'guitar-gradient text-white' : 'glass-panel text-muted-foreground')}>
              <span className="block text-xs">{label}</span>
              <span className="block text-lg font-semibold">{dayNum}</span>
            </div>
          ))}
        </div>

        {/* Grille horaire */}
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: totalHeight }}>

          {/* Lignes horizontales + labels heures */}
          {slots.map((slot) => (
            <div key={slot} className="contents">
              <div className="relative" style={{ height: SLOT_HEIGHT }}>
                {slot % 2 === 0 && (
                  <span className="absolute -top-2.5 right-1 text-[11px] text-muted-foreground/60 select-none">
                    {slotToLabel(slot)}
                  </span>
                )}
              </div>
              {weekDays.map(({ iso }) => (
                <div key={iso} className={'border-t border-border-subtle/30 mx-0.5 ' + (slot % 2 === 0 ? 'border-border-subtle/50' : 'border-dashed')}
                  style={{ height: SLOT_HEIGHT }} />
              ))}
            </div>
          ))}

          {/* Cours positionnes en absolu */}
          {weekDays.map(({ iso }, colIndex) => (
            lessonsByDay[iso]?.map((lesson) => {
              const statusInfo = getStatusInfo(lesson.status)
              const topSlot = timeToSlot(lesson.lessonTime)
              const heightSlots = (lesson.durationMinutes ?? 30) / SLOT_MINUTES
              const top = topSlot * SLOT_HEIGHT
              const height = Math.max(heightSlots * SLOT_HEIGHT - 4, 28)
              const colWidth = 'calc((100% - 56px) / 7)'
              const left = 'calc(56px + ' + colIndex + ' * (100% - 56px) / 7 + 2px)'
              return (
                <div key={lesson.id}
                  className="absolute rounded-lg px-1.5 py-1 overflow-hidden cursor-pointer hover:brightness-110 transition-all"
                  style={{ top, left, width: 'calc((100% - 56px) / 7 - 4px)', height, backgroundColor: statusInfo.color + '25', borderLeft: '3px solid ' + statusInfo.color }}>
                  <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: statusInfo.color }}>
                    {lesson.lessonTime?.slice(0,5)}
                  </p>
                  <p className="text-[11px] leading-tight truncate text-foreground font-medium">
                    {lesson.studentName || 'Eleve'}
                  </p>
                  {height >= 60 && (
                    <p className="text-[10px] text-muted-foreground truncate">{lesson.topic}</p>
                  )}
                  {height >= 80 && (
                    <div className="flex gap-1 mt-1">
                      <button onClick={(e) => { e.stopPropagation(); onStatus(lesson) }} className="p-0.5 rounded hover:bg-white/10" title="Emargement">
                        <ClipboardCheck className="w-3 h-3" style={{ color: statusInfo.color }} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(lesson) }} className="p-0.5 rounded hover:bg-white/10" title="Modifier">
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(lesson) }} className="p-0.5 rounded hover:bg-white/10" title="Supprimer">
                        <Trash2 className="w-3 h-3 text-guitar-400" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          ))}
        </div>
      </div>
    </div>
  )
}
