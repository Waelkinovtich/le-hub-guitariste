import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Plus, Users, Music2, Trash2 } from 'lucide-react'
import CreateGroupModal from './CreateGroupModal'

const TYPE_LABELS = {
  cours_collectif: { label: 'Cours collectif', icon: '🎸', color: 'bg-blue-500/15 text-blue-400' },
  repetition: { label: 'Repetition', icon: '🎵', color: 'bg-purple-500/15 text-purple-400' },
  ensemble: { label: 'Ensemble', icon: '🎶', color: 'bg-green-500/15 text-green-400' },
}

export default function GroupesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { fetchGroups() }, [])

  async function fetchGroups() {
    const { data, error } = await supabase
      .from('music_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setGroups(data || [])
    setLoading(false)
  }

  async function deleteGroup(e, id) {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce groupe ?')) return
    await supabase.from('music_groups').delete().eq('id', id)
    fetchGroups()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display">Groupes et Repetitions</h1>
          <p className="text-sm text-muted mt-1">Gerez vos cours collectifs, repetitions et ensembles</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 transition-all">
          <Plus className="w-4 h-4" />
          Nouveau groupe
        </button>
      </div>

      {loading ? (
        <p className="text-muted text-sm">Chargement...</p>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <Music2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun groupe pour le moment</p>
          <p className="text-sm mt-1">Cliquez sur Nouveau groupe pour commencer</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map(group => {
            const t = TYPE_LABELS[group.type]
            return (
              <div key={group.id}
                onClick={() => navigate('/professeur/groupes/' + group.id)}
                className="flex items-center justify-between p-4 rounded-xl border border-border-subtle bg-surface/50 hover:bg-surface-overlay transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <span className={"text-xs px-2 py-0.5 rounded-full " + t.color}>{t.label}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteGroup(e, group.id)}
                  className="p-2 rounded-lg hover:bg-red-500/15 hover:text-red-400 text-muted transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={fetchGroups} userId={user.id} />}
    </div>
  )
}
