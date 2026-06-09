import { useMemo } from 'react'
import { getStatusInfo } from '../utils/lessonStatus'

const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function toISO(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

export default function MonthView({ monthDate, lessons, onSelectDay, onSelectLesson }) {
  const grid = useMemo(() => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const first = new Date(year, month, 1)
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1
    const start = new Date(first)
    start.setDate(first.getDate() - startDay)

    const weeks = []
    let current = new Date(start)
    for (let w = 0; w < 6; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const iso = toISO(current)
        week.push({
          date: new Date(current),
          iso,
          dayNum: current.getDate(),
          inMonth: current.getMonth() === month,
          isToday: iso === toISO(new Date()),
          lessons: (lessons ?? []).filter((l) => l.lessonDate === iso),
        })
        current.setDate(current.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }, [monthDate, lessons])

  return (
    <div className="glass-panel rounded-2xl p-4 overflow-x-auto">
      <div className="grid grid-cols-7 gap-1 mb-2 min-w-[640px]">
        {dayLabels.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="space-y-1 min-w-[640px]">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((cell) => (
              <button key={cell.iso} onClick={() => onSelectDay(cell.iso)}
                className={'min-h-[80px] p-1.5 rounded-lg text-left transition-colors border ' + (cell.inMonth ? 'border-border-subtle hover:bg-surface-overlay' : 'border-transparent opacity-40') + (cell.isToday ? ' ring-2 ring-guitar-400' : '')}>
                <span className={'text-xs font-medium ' + (cell.isToday ? 'text-guitar-400' : 'text-muted-foreground')}>{cell.dayNum}</span>
                <div className="mt-1 space-y-0.5">
                  {cell.lessons.slice(0, 3).map((l) => {
                    const info = getStatusInfo(l.status)
                    return (
                      <div key={l.id} onClick={(e) => { e.stopPropagation(); onSelectLesson(l) }}
                        className="text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: info.color + '25', color: info.color }}>
                        {l.timeLabel} {l.studentName}
                      </div>
                    )
                  })}
                  {cell.lessons.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{cell.lessons.length - 3}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
