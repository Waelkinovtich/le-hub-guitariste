import { useMemo } from 'react'
import { getStatusInfo } from '../utils/lessonStatus'
import { toISODate } from '../utils/format'

const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
]

function buildMonthGrid(year, month, lessons) {
  const first = new Date(year, month, 1)
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1
  const start = new Date(first)
  start.setDate(first.getDate() - startDay)
  const today = toISODate(new Date())
  const cells = []
  const current = new Date(start)
  for (let i = 0; i < 42; i++) {
    const iso = toISODate(current)
    cells.push({
      iso,
      dayNum: current.getDate(),
      inMonth: current.getMonth() === month,
      isToday: iso === today,
      lessons: (lessons ?? []).filter((l) => l.lessonDate === iso),
    })
    current.setDate(current.getDate() + 1)
  }
  return cells
}

function MiniMonth({ year, month, lessons, onSelectDay }) {
  const cells = useMemo(
    () => buildMonthGrid(year, month, lessons),
    [year, month, lessons]
  )

  return (
    <div className="glass-panel rounded-xl p-3">
      <h3 className="text-xs font-semibold text-center mb-2 text-foreground">
        {MONTH_NAMES[month]}
      </h3>
      <div className="grid grid-cols-7 gap-0 mb-1">
        {dayLabels.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-muted-foreground/60 py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {cells.map((cell) => {
          const hasLesson = cell.lessons.length > 0
          const firstStatus = hasLesson ? getStatusInfo(cell.lessons[0].status) : null
          return (
            <button
              key={cell.iso}
              onClick={() => hasLesson && onSelectDay(cell.iso)}
              className={
                'relative flex flex-col items-center justify-start pt-0.5 h-8 rounded text-[10px] transition-colors ' +
                (cell.inMonth ? '' : 'opacity-20 pointer-events-none ') +
                (cell.isToday ? 'ring-1 ring-guitar-400 ' : '') +
                (hasLesson ? 'cursor-pointer hover:bg-surface-overlay ' : 'cursor-default ')
              }
            >
              <span className={'font-medium ' + (cell.isToday ? 'text-guitar-400' : 'text-muted-foreground')}>
                {cell.dayNum}
              </span>
              {hasLesson && (
                <span
                  className="w-1 h-1 rounded-full mt-0.5"
                  style={{ backgroundColor: firstStatus?.color ?? '#a855f7' }}
                />
              )}
              {cell.lessons.length > 1 && (
                <span className="text-[8px] text-muted-foreground leading-none">
                  {cell.lessons.length}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function YearView({ lessons, onSelectDay }) {
  const schoolYear = useMemo(() => {
    const today = new Date()
    const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
    const months = []
    for (let i = 0; i < 12; i++) {
      const monthIndex = (8 + i) % 12
      const y = i < 4 ? year : year + 1
      months.push({ year: y, month: monthIndex })
    }
    return months
  }, [])

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Cliquez sur un jour avec un cours pour voir le detail.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {schoolYear.map(({ year, month }) => (
          <MiniMonth
            key={year + '-' + month}
            year={year}
            month={month}
            lessons={lessons}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
    </div>
  )
}
