import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'
import { LESSON_STATUSES } from '../../utils/lessonStatus'

export default function GroupAttendanceModal({ session, members, onClose }) {
  const [attendances, setAttendances] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAttendances() }, [session.id])

  async function loadAttendances() {
    setLoading(true)
    const { data } = await supabase
      .from('group_attendances')
      .select('*')
      .eq('session_id', session.id)
    const map = {}
    ;(data || []).forEach(a => { map[a.member_id] = a.status })
    setAttendances(map)
    setLoading(false)
  }

  async function setStatus(memberId, status) {
    setAttendances(prev => ({ ...prev, [memberId]: status }))
    setSaving(true)
    const { data: existing } = await supabase
      .from('group_attendances')
      .select('id')
      .eq('session_id', session.id)
      .eq('member_id', memberId)
      .maybeSingle()
    if (existing) {
      await supabase.from('group_attendances').update({ status }).eq('id', existing.id)
    } else {
      await supabase.from('group_attendances').insert({ session_id: session.id, member_id: memberId, status })
    }
    setSaving(false)
  }

  function memberName(m) {
    if (m.is_external) return m.free_first_name + ' ' + m.free_last_name
    if (m.students) return m.students.first_name + ' ' + m.students.last_name
    return 'Eleve'
  }

  const dateLabel = new Date(session.session_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display">Emargement</h2>
            <p className="text-xs text-muted capitalize">{dateLabel}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>

        {loading ? (
          <p className="text-muted text-sm">Chargement...</p>
        ) : members.length === 0 ? (
          <p className="text-muted text-sm">Aucun membre dans ce groupe. Ajoutez des membres d'abord.</p>
        ) : (
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.id} className="p-3 rounded-xl border border-border-subtle bg-surface/50">
                <p className="text-sm font-medium mb-2">{memberName(m)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {LESSON_STATUSES.map(st => {
                    const active = attendances[m.id] === st.value
                    return (
                      <button key={st.value} onClick={() => setStatus(m.id, st.value)}
                        className={"text-xs px-2 py-1 rounded-lg transition-all " + (active ? 'text-white' : 'text-muted hover:bg-surface-overlay')}
                        style={active ? { backgroundColor: st.color } : {}}>
                        {st.emoji} {st.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 transition-all">
            {saving ? 'Enregistrement...' : 'Termine'}
          </button>
        </div>
      </div>
    </div>
  )
}
