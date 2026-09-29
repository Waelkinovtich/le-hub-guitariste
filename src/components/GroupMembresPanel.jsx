// Panneau de présence par membre pour une séance de groupe.
// Utilisé dans EmargementPage (table pliante) et GroupAttendanceModal (Planning).
// Appelle group_session_attendance via les fonctions du service lessons.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchGroupSessionAttendance, upsertGroupAttendance } from '../services/lessons'
import { Check } from 'lucide-react'

// Statuts disponibles pour l'émargement des membres de groupe
const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'Présent', color: '#22c55e' },
  { value: 'absent',  label: 'Absent',  color: '#ef4444' },
  { value: 'excuse',  label: 'Excusé',  color: '#3b82f6' },
]

/**
 * Panneau de présence par membre.
 * @param {string}   sessionId        UUID de la séance (group_sessions.id)
 * @param {string}   groupId          UUID du groupe (music_groups.id)
 * @param {string}   teacherId        UUID de l'enseignant connecté
 * @param {Function} onSummaryChange  ({ present, total }) → appelé après chaque modification
 */
export default function GroupMembresPanel({ sessionId, groupId, teacherId, onSummaryChange }) {
  const [membres, setMembres]           = useState([])
  const [attendance, setAttendance]     = useState({})  // student_id → status
  const [loading, setLoading]           = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: membresData } = await supabase
        .from('group_members')
        .select('id, student_id, is_external, free_first_name, free_last_name, free_instrument, students:student_id(id, first_name, last_name)')
        .eq('group_id', groupId)
      if (cancelled) return

      // Inclure tous les membres : élèves liés (student_id) et musiciens externes (is_external)
      const m = (membresData ?? []).filter(r => r.student_id || r.is_external)
      setMembres(m)

      try {
        const rows = await fetchGroupSessionAttendance(sessionId)
        if (cancelled) return
        const map = {}
        // Clé : student_id pour les élèves liés, member.id (participant_id) pour les externes
        rows.forEach(r => {
          if (r.student_id) map[r.student_id] = r.status
          else if (r.participant_id) map['ext-' + r.participant_id] = r.status
        })
        setAttendance(map)
        // Résumé initial
        const present = rows.filter(r => r.status === 'present').length
        onSummaryChange?.({ present, total: m.length })
      } catch (e) {
        if (cancelled) return
        if (e.message.includes('42P01') || e.message.includes('does not exist')) setTableMissing(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, groupId])

  // Clé d'attendance locale : student_id pour les élèves liés, 'ext-{member.id}' pour les externes
  function attendanceKey(m) {
    return m.student_id ? m.student_id : 'ext-' + m.id
  }
  // memberKey pour upsertGroupAttendance : { student_id } ou { participant_id }
  function memberKey(m) {
    return m.student_id ? { student_id: m.student_id } : { participant_id: m.id }
  }

  async function handleMemberStatus(m, status) {
    const key = attendanceKey(m)
    const prev = attendance[key]
    const next = { ...attendance, [key]: status }
    setAttendance(next)
    const present = Object.values(next).filter(s => s === 'present').length
    onSummaryChange?.({ present, total: membres.length })
    try {
      await upsertGroupAttendance({ teacherId, sessionId, memberKey: memberKey(m), status })
    } catch (e) {
      const reverted = { ...attendance, [key]: prev }
      setAttendance(reverted)
      const rPresent = Object.values(reverted).filter(s => s === 'present').length
      onSummaryChange?.({ present: rPresent, total: membres.length })
      alert('Erreur : ' + e.message)
    }
  }

  async function handleTousPresents() {
    const next = {}
    membres.forEach(m => { next[attendanceKey(m)] = 'present' })
    setAttendance(next)
    onSummaryChange?.({ present: membres.length, total: membres.length })
    try {
      await Promise.all(
        membres.map(m =>
          upsertGroupAttendance({ teacherId, sessionId, memberKey: memberKey(m), status: 'present' })
        )
      )
    } catch (e) {
      // Rechargement en cas d'erreur partielle
      const rows = await fetchGroupSessionAttendance(sessionId).catch(() => [])
      const map = {}
      rows.forEach(r => { if (r.student_id) map[r.student_id] = r.status })
      setAttendance(map)
      const present = rows.filter(r => r.status === 'present').length
      onSummaryChange?.({ present, total: membres.length })
      alert('Erreur partielle : ' + e.message)
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground px-2 py-1">Chargement…</p>
  if (tableMissing) return (
    <p className="text-xs text-amber-400 px-2 py-1">
      Table group_session_attendance manquante — exécutez le BLOC T4 de la migration.
    </p>
  )
  if (membres.length === 0) return <p className="text-xs text-muted-foreground px-2 py-1">Aucun membre lié.</p>

  const presentCount = Object.values(attendance).filter(s => s === 'present').length

  return (
    <div className="flex flex-col gap-1 pt-1">
      {/* Bouton "Tout le monde présent" */}
      {presentCount < membres.length && (
        <button
          type="button"
          onClick={handleTousPresents}
          className="flex items-center gap-1.5 self-start mb-1 px-2 py-1 rounded-md text-xs font-medium
                     bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
        >
          <Check className="w-3 h-3" />
          Tout le monde présent
        </button>
      )}

      {membres.map(m => {
        const nom = m.student_id
          ? [m.students?.first_name, m.students?.last_name].filter(Boolean).join(' ') || m.student_id.slice(0, 8)
          : [m.free_first_name, m.free_last_name].filter(Boolean).join(' ') + (m.free_instrument ? ` (${m.free_instrument})` : '') || 'Externe'
        const key    = attendanceKey(m)
        const status = attendance[key] ?? null
        return (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="w-32 truncate text-foreground font-medium">{nom}</span>
            <div className="flex gap-1">
              {ATTENDANCE_STATUSES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleMemberStatus(m, s.value)}
                  title={s.label}
                  className="px-2 py-0.5 rounded-md border text-[10px] font-medium transition-all"
                  style={{
                    borderColor: s.color + (status === s.value ? 'CC' : '40'),
                    color:       status === s.value ? s.color : s.color + '80',
                    background:  status === s.value ? s.color + '20' : 'transparent',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
