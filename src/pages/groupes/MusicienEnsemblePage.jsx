import { useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useFetch } from '../../hooks/useFetch'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import BackToDashboard from '../../components/BackToDashboard'
import { Music2, ChevronDown, ChevronUp, AlertTriangle, Check, X, Loader2, UserMinus, Info } from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dateLabel(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABELS = {
  present:  { label: 'Présent',  cls: 'bg-emerald-500/15 text-emerald-400' },
  absent:   { label: 'Absent',   cls: 'bg-orange-500/15 text-orange-400' },
  excuse:   { label: 'Excusé',   cls: 'bg-yellow-500/15 text-yellow-400' },
  planifie: { label: 'Planifié', cls: 'bg-surface-overlay text-muted-foreground' },
}

// ─── composant éditeur inline ──────────────────────────────────────────────────

function InlineEdit({ value, onSave, placeholder = '' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  async function commit() {
    if (val.trim() === (value ?? '').trim()) { setEditing(false); return }
    setSaving(true)
    await onSave(val.trim())
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ?? ''); setEditing(true) }}
        className="text-left hover:underline underline-offset-2 decoration-dashed decoration-muted-foreground/40"
      >
        {value || <span className="text-muted-foreground italic">{placeholder}</span>}
      </button>
    )
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); commit() }} className="flex items-center gap-1.5">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="px-2 py-0.5 rounded-lg bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 w-36"
      />
      <button type="submit" disabled={saving} className="p-1 rounded hover:bg-surface-overlay text-emerald-400">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="p-1 rounded hover:bg-surface-overlay text-muted-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </form>
  )
}

// ─── sous-composant : historique de présence ──────────────────────────────────

function AttendanceHistory({ records }) {
  if (!records) return <p className="text-xs text-muted-foreground py-2">Chargement…</p>

  const sorted = [...records].sort((a, b) => {
    const da = a.group_sessions?.session_date ?? ''
    const db = b.group_sessions?.session_date ?? ''
    return db.localeCompare(da)
  })

  const emargees = sorted.filter((a) => a.status !== 'planifie')
  const presences = emargees.filter((a) => a.status === 'present')

  return (
    <div>
      {emargees.length > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {presences.length} présence{presences.length > 1 ? 's' : ''} sur {emargees.length} séance{emargees.length > 1 ? 's' : ''} émargée{emargees.length > 1 ? 's' : ''}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune présence enregistrée</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((a) => {
            const sess = a.group_sessions
            const st = STATUS_LABELS[a.status] ?? { label: a.status, cls: 'bg-surface-overlay text-muted-foreground' }
            return (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">{dateLabel(sess?.session_date)}</span>
                <span className="text-xs truncate flex-1 text-muted-foreground">{sess?.music_groups?.name ?? '—'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── sous-composant : groupes du musicien + retrait ───────────────────────────

function GroupMemberships({ memberships, onRetired }) {
  const [removing, setRemoving] = useState(null)

  if (!memberships?.length) {
    return <p className="text-xs text-muted-foreground">Aucun groupe actif.</p>
  }

  async function handleRetire(gm) {
    const groupName = gm.music_groups?.name ?? '?'
    if (!window.confirm(
      `Retirer ce musicien du groupe « ${groupName} » ?\n\nSa fiche et ses présences sont conservées. Seule son appartenance au groupe est supprimée.`
    )) return
    setRemoving(gm.id)
    const { error } = await supabase.from('group_members').delete().eq('id', gm.id)
    setRemoving(null)
    if (error) { alert(error.message); return }
    onRetired(gm.id)
  }

  return (
    <ul className="space-y-1.5">
      {memberships.map((gm) => (
        <li key={gm.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground truncate">{gm.music_groups?.name ?? '—'}</span>
          <button
            onClick={() => handleRetire(gm)}
            disabled={removing === gm.id}
            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 shrink-0 disabled:opacity-50"
          >
            {removing === gm.id
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <UserMinus className="w-3 h-3" />}
            Retirer du groupe
          </button>
        </li>
      ))}
    </ul>
  )
}

// ─── sous-composant : carte musicien ──────────────────────────────────────────

function MusicienCard({ musicien, memberships, attendance, prenomConflicts, onUpdate, onRetired }) {
  const [expanded, setExpanded] = useState(false)

  async function save(field, val) {
    const { error } = await supabase
      .from('ensemble_participants')
      .update({ [field]: val })
      .eq('id', musicien.id)
    if (error) throw new Error(error.message)
    onUpdate(musicien.id, { [field]: val })
  }

  function handleRetiredMembership(membershipId) {
    onRetired(musicien.id, membershipId)
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-guitar-600/20 flex items-center justify-center text-sm font-medium text-guitar-400 shrink-0">
          {(musicien.prenom ?? '?')[0]}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <InlineEdit value={musicien.prenom} onSave={(v) => save('prenom', v)} placeholder="Prénom" />
            <InlineEdit value={musicien.nom} onSave={(v) => save('nom', v)} placeholder="Nom" />
          </div>
          <InlineEdit value={musicien.instrument} onSave={(v) => save('instrument', v)} placeholder="Instrument" />
          {musicien.est_eleve && musicien.student_id && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> Lié à un élève
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded-lg hover:bg-surface-overlay text-muted-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {musicien._isDoublon && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300">
            <span className="font-medium">Doublon probable</span> — un autre musicien a le même nom. Vérifiez avant de modifier.
          </p>
        </div>
      )}

      {prenomConflicts?.length > 0 && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            Même prénom qu&apos;un élève du groupe
            {prenomConflicts.length === 1 ? ` « ${prenomConflicts[0]} »` : ` (${prenomConflicts.join(', ')})`} : à vérifier.
          </p>
        </div>
      )}

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-5">
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Groupes</p>
            <GroupMemberships
              memberships={memberships}
              onRetired={handleRetiredMembership}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Historique de présence</p>
            <AttendanceHistory records={attendance} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── page principale ──────────────────────────────────────────────────────────

export default function MusicienEnsemblePage() {
  const { user } = useAuth()

  const load = useCallback(async () => {
    // 1. Fiches musiciens
    const { data: partData, error: partErr } = await supabase
      .from('ensemble_participants')
      .select('id, prenom, nom, instrument, niveau, est_eleve, student_id')
      .eq('teacher_id', user.id)
      .order('nom', { ascending: true })
    if (partErr) throw new Error(partErr.message)
    const participants = partData ?? []
    const partIds = participants.map((p) => p.id)

    if (partIds.length === 0) return { participants: [], memberships: [], attendance: [], studentPrenoms: {} }

    // 2. Appartenances aux groupes
    const { data: membData } = await supabase
      .from('group_members')
      .select('id, group_id, participant_id, music_groups(id, name)')
      .in('participant_id', partIds)
    const memberships = membData ?? []

    // 3. Élèves des mêmes groupes (pour détection conflit prénom)
    const groupIds = [...new Set(memberships.map((gm) => gm.group_id))]
    let studentMembData = []
    if (groupIds.length > 0) {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, students(first_name)')
        .in('group_id', groupIds)
        .not('student_id', 'is', null)
      studentMembData = data ?? []
    }
    // Map groupId → Set<prénom normalisé>
    const studentPrenomsByGroup = {}
    for (const sm of studentMembData) {
      const fn = sm.students?.first_name?.trim().toLowerCase()
      if (!fn) continue
      if (!studentPrenomsByGroup[sm.group_id]) studentPrenomsByGroup[sm.group_id] = new Set()
      studentPrenomsByGroup[sm.group_id].add(fn)
    }

    // 4. Présences
    const { data: attData } = await supabase
      .from('group_session_attendance')
      .select('id, participant_id, status, session_id, group_sessions(session_date, group_id, music_groups(name))')
      .in('participant_id', partIds)
    const attendance = attData ?? []

    // 5. Doublons prénom+nom
    const byNom = new Map()
    for (const m of participants) {
      const key = `${(m.prenom ?? '').trim().toLowerCase()}|${(m.nom ?? '').trim().toLowerCase()}`
      if (!byNom.has(key)) byNom.set(key, [])
      byNom.get(key).push(m.id)
    }
    const doublonIds = new Set()
    for (const ids of byNom.values()) {
      if (ids.length > 1) ids.forEach((id) => doublonIds.add(id))
    }

    // 6. Conflits de prénom par musicien : liste des noms de groupe où le conflit existe
    const prenomConflicts = {}
    for (const p of participants) {
      const pPrenom = (p.prenom ?? '').trim().toLowerCase()
      if (!pPrenom) continue
      const pMemberships = memberships.filter((gm) => gm.participant_id === p.id)
      const conflictGroups = []
      for (const gm of pMemberships) {
        if (studentPrenomsByGroup[gm.group_id]?.has(pPrenom)) {
          conflictGroups.push(gm.music_groups?.name ?? '?')
        }
      }
      if (conflictGroups.length > 0) prenomConflicts[p.id] = conflictGroups
    }

    return {
      participants: participants.map((m) => ({ ...m, _isDoublon: doublonIds.has(m.id) })),
      memberships,
      attendance,
      prenomConflicts,
    }
  }, [user.id])

  const { data, loading, error, reload } = useFetch(load, [user.id])
  const [localMemberships, setLocalMemberships] = useState(null)

  const participants = data?.participants ?? []
  const memberships = localMemberships ?? data?.memberships ?? []
  const attendance = data?.attendance ?? []
  const prenomConflicts = data?.prenomConflicts ?? {}

  function getMembershipsFor(participantId) {
    return memberships.filter((gm) => gm.participant_id === participantId)
  }

  function getAttendanceFor(participantId) {
    return attendance.filter((a) => a.participant_id === participantId)
  }

  function handleRetired(participantId, membershipId) {
    void participantId
    setLocalMemberships((prev) => (prev ?? data?.memberships ?? []).filter((gm) => gm.id !== membershipId))
  }

  function handleUpdate(id, patch) {
    void id; void patch
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const doublons = participants.filter((m) => m._isDoublon)

  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <BackToDashboard />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
          <Music2 className="w-4 h-4 text-guitar-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Musiciens d&apos;ensemble</h1>
          <p className="text-sm text-muted-foreground">{participants.length} participant{participants.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {doublons.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-300">
            {doublons.length} doublon{doublons.length > 1 ? 's' : ''} détecté{doublons.length > 1 ? 's' : ''} — les entrées concernées sont signalées ci-dessous.
          </p>
        </div>
      )}

      {participants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Aucun musicien enregistré. Ajoutez des membres externes dans un groupe pour qu&apos;ils apparaissent ici.
        </p>
      ) : (
        <div className="space-y-4">
          {participants.map((m) => (
            <MusicienCard
              key={m.id}
              musicien={m}
              memberships={getMembershipsFor(m.id)}
              attendance={getAttendanceFor(m.id)}
              prenomConflicts={prenomConflicts[m.id] ?? null}
              onUpdate={handleUpdate}
              onRetired={handleRetired}
            />
          ))}
        </div>
      )}
    </div>
  )
}
