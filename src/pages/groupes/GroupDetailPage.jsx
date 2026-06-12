import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Users, Plus, Trash2, Calendar } from 'lucide-react'
import AddMemberModal from './AddMemberModal'
import AddSessionModal from './AddSessionModal'
import GroupAttendanceModal from './GroupAttendanceModal'

const TYPES = {
  cours_collectif: { label: 'Cours collectif', icon: '🎸', color: 'bg-blue-500/15 text-blue-400' },
  repetition: { label: 'Repetition', icon: '🎵', color: 'bg-purple-500/15 text-purple-400' },
  ensemble: { label: 'Ensemble', icon: '🎶', color: 'bg-green-500/15 text-green-400' },
}

const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function fmt(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return m + ' min'
  if (m === 0) return h + 'h'
  return h + 'h' + m
}

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMember, setShowMember] = useState(false)
  const [showSession, setShowSession] = useState(false)
  const [attendanceSession, setAttendanceSession] = useState(null)

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const g = await supabase.from('music_groups').select('*').eq('id', id).single()
    const m = await supabase.from('group_members').select('*, students(first_name, last_name, instrument, school_name)').eq('group_id', id)
    const s = await supabase.from('group_sessions').select('*').eq('group_id', id).order('session_date', { ascending: true })
    if (g.data) setGroup(g.data)
    setMembers(m.data || [])
    setSessions(s.data || [])
    setLoading(false)
  }

  async function removeMember(mid) {
    if (!window.confirm('Retirer ce membre ?')) return
    await supabase.from('group_members').delete().eq('id', mid)
    loadData()
  }

  if (loading) return <div className="p-6 text-muted text-sm">Chargement...</div>
  if (!group) return <div className="p-6 text-muted text-sm">Groupe introuvable</div>

  const t = TYPES[group.type] || TYPES.cours_collectif

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/professeur/groupes')}
          className="p-2 rounded-xl hover:bg-surface-overlay transition-all">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl">{t.icon}</span>
            <h1 className="text-2xl font-display">{group.name}</h1>
            <span className={"text-xs px-2 py-0.5 rounded-full " + t.color}>{t.label}</span>
          </div>
          {group.recurrence_day !== null && group.recurrence_day !== undefined && (
            <p className="text-sm text-muted mt-1">
              Chaque {DAYS[group.recurrence_day]} a {group.recurrence_time} - {fmt(group.duration_minutes)}
            </p>
          )}
          {group.description ? <p className="text-sm text-muted mt-1">{group.description}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border-subtle bg-surface/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2">
              <Users className="w-4 h-4" /> Membres ({members.length})
            </h2>
            <button onClick={() => setShowMember(true)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-guitar-600 text-white hover:bg-guitar-700 transition-all">
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {members.length === 0 && <p className="text-xs text-muted">Aucun membre</p>}
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-overlay">
                <div>
                  <p className="text-sm font-medium">
                    {m.is_external ? m.free_first_name + ' ' + m.free_last_name : (m.students ? m.students.first_name + ' ' + m.students.last_name : 'Eleve')}
                  </p>
                  <p className="text-xs text-muted">
                    {m.is_external ? m.free_instrument : (m.students ? m.students.instrument : '')}
                    {m.is_external ? ' - exterieur' : ''}
                  </p>
                </div>
                <button onClick={() => removeMember(m.id)} className="p-1 hover:text-red-400 text-muted transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Seances ({sessions.length})
            </h2>
            <button onClick={() => setShowSession(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-guitar-600 text-white hover:bg-guitar-700 transition-all">
              <Plus className="w-3 h-3" /> Nouvelle seance
            </button>
          </div>
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-xs text-muted">Aucune seance</p>}
            {sessions.map(s => (
              <div key={s.id} onClick={() => setAttendanceSession(s)} className="py-1.5 px-2 rounded-lg hover:bg-surface-overlay cursor-pointer">
                <p className="text-sm font-medium">{new Date(s.session_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="text-xs text-muted">{s.session_time} - {fmt(s.duration_minutes || group.duration_minutes)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showMember && <AddMemberModal groupId={id} onClose={() => setShowMember(false)} onAdded={loadData} />}
      {showSession && <AddSessionModal groupId={id} defaultDuration={group.duration_minutes} onClose={() => setShowSession(false)} onAdded={loadData} />}
      {attendanceSession && <GroupAttendanceModal session={attendanceSession} members={members} onClose={() => setAttendanceSession(null)} />}
    </div>
  )
}
