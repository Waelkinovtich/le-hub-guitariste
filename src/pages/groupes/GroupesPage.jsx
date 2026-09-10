import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Plus, Users, Music2, Trash2, CalendarDays, AlertTriangle, Loader2 } from 'lucide-react'
import HelpTooltip from '../../components/HelpTooltip'
import CreateGroupModal from './CreateGroupModal'
import { usePeriod } from '../../context/PeriodContext'

const TYPE_LABELS = {
  cours_collectif: { label: 'Cours collectif', icon: '🎸', color: 'bg-blue-500/15 text-blue-400' },
  repetition: { label: 'Répétition', icon: '🎵', color: 'bg-purple-500/15 text-purple-400' },
  ensemble: { label: 'Ensemble', icon: '🎶', color: 'bg-green-500/15 text-green-400' },
}

export default function GroupesPage() {
  const { user } = useAuth()
  const { period: periodCtx } = usePeriod()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [counts, setCounts] = useState({})
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState('')

  useEffect(() => { fetchGroups() }, [])

  async function fetchGroups() {
    const { data, error } = await supabase
      .from('music_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) {
      setGroups(data || [])
      const ids = (data || []).map(g => g.id)
      if (ids.length > 0) {
        const { data: mem } = await supabase.from('group_members').select('group_id').in('group_id', ids)
        const c = {}
        ;(mem || []).forEach(m => { c[m.group_id] = (c[m.group_id] || 0) + 1 })
        setCounts(c)
      }
    }
    setLoading(false)
  }

  async function deleteGroup(e, id) {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce groupe ?')) return
    await supabase.from('music_groups').delete().eq('id', id)
    fetchGroups()
  }

  /**
   * Supprime TOUS les groupes de l'enseignant.
   * Ordre : group_sessions → group_members → music_groups (respect des FK).
   * Ne touche PAS aux survey_responses ni aux disponibilités des élèves.
   * Remet les survey_responses des membres à 'attente' pour qu'elles réapparaissent dans le planning.
   */
  async function deleteAllGroups() {
    // Confirmation forte : l'utilisateur doit taper "CONFIRMER"
    const saisie = window.prompt(
      `Supprimer les ${groups.length} groupe(s) et toutes leurs séances ?\n\n` +
      `Les disponibilités et réponses au sondage des élèves ne seront PAS supprimées.\n` +
      `Leurs statuts de planification seront remis à "en attente".\n\n` +
      `Tapez CONFIRMER pour valider :`
    )
    if (saisie?.trim() !== 'CONFIRMER') return

    setDeletingAll(true)
    setDeleteAllError('')
    try {
      const groupIds = groups.map((g) => g.id)
      if (groupIds.length === 0) return

      // 1. Récupérer les student_ids des membres avant suppression
      const { data: membersData } = await supabase
        .from('group_members')
        .select('student_id')
        .in('group_id', groupIds)
      const studentIds = [...new Set((membersData ?? []).map((m) => m.student_id).filter(Boolean))]

      // 2. Supprimer séances (group_sessions) — d'abord pour respecter la FK
      const { error: sessErr } = await supabase.from('group_sessions').delete().in('group_id', groupIds)
      if (sessErr) throw new Error('Erreur suppression séances : ' + sessErr.message)

      // 3. Supprimer les membres
      const { error: membErr } = await supabase.from('group_members').delete().in('group_id', groupIds)
      if (membErr) throw new Error('Erreur suppression membres : ' + membErr.message)

      // 4. Supprimer les groupes
      const { error: grpErr } = await supabase.from('music_groups').delete().in('id', groupIds)
      if (grpErr) throw new Error('Erreur suppression groupes : ' + grpErr.message)

      // 5. Remettre les réponses des membres à 'attente' (jamais 'confirme' — ça, c'est les cours individuels)
      // On ne touche que les réponses en status 'planifie' liées à ces élèves.
      if (studentIds.length > 0) {
        await supabase
          .from('survey_responses')
          .update({ status: 'attente', assigned_day: null, assigned_time: null })
          .in('student_id', studentIds)
          .eq('status', 'planifie')
      }

      fetchGroups()
    } catch (e) {
      setDeleteAllError(e.message)
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-display">Groupes et Répétitions</h1>
            <HelpTooltip texte="Regroupez vos élèves par cours collectif, répétition ou ensemble. Les absences sont enregistrées par séance et visibles dans la fiche de chaque élève." />
          </div>
          <p className="text-sm text-muted mt-1">Gérez vos cours collectifs, répétitions et ensembles</p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <button
              onClick={deleteAllGroups}
              disabled={deletingAll}
              title="Supprime tous les groupes et remet les élèves en attente"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 disabled:opacity-40 transition-all"
            >
              {deletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Supprimer tous les groupes
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 transition-all">
            <Plus className="w-4 h-4" />
            Nouveau groupe
          </button>
        </div>
      </div>

      {deleteAllError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          {deleteAllError}
        </div>
      )}

      {periodCtx.mode !== 'toutes' && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-xs text-guitar-400">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          Filtre temporel global actif — les séances de chaque groupe sont filtrées par la période sélectionnée dans la barre latérale.
        </div>
      )}

      {loading ? (
        <p className="text-muted text-sm">Chargement…</p>
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={"text-xs px-2 py-0.5 rounded-full " + t.color}>{t.label}</span>
                      {group.school_name ? <span className="text-xs text-muted">🏫 {group.school_name}</span> : null}
                      <span className="text-xs text-muted">👥 {counts[group.id] || 0} participant{(counts[group.id] || 0) > 1 ? 's' : ''}</span>
                    </div>
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
