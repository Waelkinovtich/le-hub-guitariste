import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getStatusInfo } from '../../utils/lessonStatus'

export default function StudentGroupHistory({ studentId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (studentId) load()
  }, [studentId])

  async function load() {
    setLoading(true)
    const { data: mem } = await supabase
      .from('group_members')
      .select('id, group_id, music_groups(name, type)')
      .eq('student_id', studentId)
    if (!mem || mem.length === 0) { setRows([]); setLoading(false); return }

    const memberIds = mem.map(m => m.id)
    const groupByMember = {}
    mem.forEach(m => { groupByMember[m.id] = m.music_groups })

    const { data: att } = await supabase
      .from('group_attendances')
      .select('member_id, status, group_sessions(session_date)')
      .in('member_id', memberIds)

    const list = (att || []).map(a => ({
      group: groupByMember[a.member_id],
      date: a.group_sessions?.session_date,
      status: a.status,
    })).filter(r => r.date)
    list.sort((a, b) => (a.date < b.date ? 1 : -1))
    setRows(list)
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement...</p>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Aucune participation a un groupe pour le moment.</p>

  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const st = getStatusInfo(r.status)
        const dateLabel = new Date(r.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
        return (
          <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-surface-overlay/50">
            <div>
              <p className="text-sm font-medium">{r.group?.name || 'Groupe'}</p>
              <p className="text-xs text-muted-foreground">{dateLabel}</p>
            </div>
            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium border"
              style={{ backgroundColor: (st?.color || '#7f8c8d') + '20', borderColor: (st?.color || '#7f8c8d') + '50', color: st?.color || '#7f8c8d' }}>
              {st?.emoji} {st?.label || r.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}
