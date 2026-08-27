import { useState, useEffect, useRef, useMemo } from 'react'
import { StickyNote, CalendarDays, Plus, Trash2, Pencil, Check, Loader2, AlertCircle, X, ChevronDown, ChevronUp, Mic, MicOff, Square, Users, FileDown, Download, Music2, ListMusic, Settings2, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import HelpTooltip from '../components/HelpTooltip'
import DicteeAudio from '../components/DicteeAudio'
import { exportEventRoutePDF, exportFicheTechniquePDF, exportProgrammeConcertPDF } from '../utils/exportPDF'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Extension de fichier réelle à partir du type MIME du blob audio : le
// navigateur choisit lui-même le codec (webm/opus sur Chrome, mp4/AAC sur
// Safari) — on ne doit jamais coder une extension en dur.
function extensionFromMimeType(mimeType) {
  const base = (mimeType || '').split(';')[0].trim()
  const extensionsByMimeType = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  }
  return extensionsByMimeType[base] ?? 'webm'
}

// Horodatage compact et sans caractères interdits dans un nom de fichier
// (ni "/" ni ":"), utilisé pour nommer l'audio téléchargé.
function fmtTimestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}h${pad(date.getMinutes())}`
  return `${datePart}-${timePart}`
}

// Noms de jours en français, indexés par Date.getDay() (0=dimanche).
const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// DicteeAudio est importé depuis src/components/DicteeAudio.jsx (composant partagé).
// ─── Formulaire d'ajout / d'édition ──────────────────────────────────────────

function NoteForm({ schools, selectedSchool, onSaved, onCancel, initial }) {
  const isEdit = Boolean(initial)
  const [type, setType] = useState(initial?.type ?? 'note')
  const [school, setSchool] = useState(initial?.school_name ?? selectedSchool ?? schools[0] ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [eventDate, setEventDate] = useState(initial?.event_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // dicteeActive remonte l'état "micro ouvert" depuis DicteeAudio : permet de
  // désactiver le toggle note/événement pendant un enregistrement en cours.
  const [dicteeActive, setDicteeActive] = useState(false)

  const save = async () => {
    setError('')
    if (!title.trim()) { setError('Le titre est obligatoire.'); return }
    if (!school) { setError('Veuillez sélectionner une école.'); return }
    if (type === 'evenement' && !eventDate) { setError("La date de l’événement est obligatoire."); return }

    setSaving(true)

    const payload = {
      school_name: school,
      type,
      title: title.trim(),
      content: content.trim() || null,
      event_date: type === 'evenement' ? eventDate : null,
    }

    let result
    if (isEdit) {
      result = await supabase
        .from('school_notes_events')
        .update(payload)
        .eq('id', initial.id)
        .select('*')
        .single()
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      result = await supabase
        .from('school_notes_events')
        .insert({ ...payload, teacher_id: user.id })
        .select('*')
        .single()
    }

    const { data, error: err } = result
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data, isEdit)
    setSaving(false)
  }

  return (
    <div className="glass-panel rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          {isEdit ? "Modifier l'élément" : 'Nouvel élément'}
        </h2>
        <button onClick={onCancel} className="text-muted hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toggle note / événement */}
      <div className="flex gap-2 mb-4">
        {[
          { val: 'note', label: 'Note', icon: StickyNote },
          { val: 'evenement', label: 'Événement', icon: CalendarDays },
        ].map(({ val, label, icon: Icon }) => (
          <button
            key={val}
            type="button"
            onClick={() => setType(val)}
            disabled={dicteeActive}
            title={dicteeActive ? 'Arrêtez la dictée en cours avant de changer de type' : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
              type === val
                ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
            } ${dicteeActive ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {/* École */}
        {schools.length > 1 && (
          <select
            value={school}
            onChange={e => setSchool(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-guitar-600/60 transition-colors"
          >
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Titre */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={type === 'note' ? 'Titre de la note' : "Intitulé de l'événement"}
          className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
        />

        {/* Date (événement uniquement) */}
        {type === 'evenement' && (
          <input
            type="date"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-guitar-600/60 transition-colors"
          />
        )}

        {/* Contenu */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Contenu, remarques, détails… (facultatif)"
          rows={3}
          className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors resize-none"
        />

        {/* Dictée vocale — disponible sur notes ET événements, audio strictement local */}
        <DicteeAudio
          onTranscription={(text) => setContent((prev) => prev ? prev + ' ' + text : text)}
          onActiveChange={setDicteeActive}
        />

        {error && (
          <p className="text-xs text-guitar-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isEdit ? 'Enregistrer les modifications' : 'Ajouter'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Carte note ───────────────────────────────────────────────────────────────

function NoteCard({ item, onEdit, onDelete }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
          {item.content && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">{item.content}</p>
          )}
          <p className="text-xs text-muted mt-2">
            Ajoutée le {fmtDateShort(item.created_at?.slice(0, 10))}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-overlay transition-all"
            title="Modifier"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Supprimer la note « ${item.title} » ? Cette action est irréversible.`)) {
                onDelete(item)
              }
            }}
            className="p-1.5 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/8 transition-all"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Carte événement ──────────────────────────────────────────────────────────

/**
 * Carte d'événement avec panel de participants pliable.
 * Les participants sont chargés à la demande (lazy) pour ne pas surcharger
 * le chargement initial de la page quand il y a beaucoup d'événements.
 *
 * allStudents : liste pré-chargée depuis la page parente, filtrée par école
 * teacherId   : nécessaire pour écrire dans event_participants (RLS)
 */
function EventCard({ item, isPast, onEdit, onDelete, allStudents, teacherId }) {
  // Nom + contact du professeur pour l'en-tête professionnel du PDF exporté
  const { user } = useAuth()
  const [showPanel, setShowPanel] = useState(false)
  // null = non chargé, [] = chargé mais vide, [uuid, …] = chargé avec données
  const [participantIds, setParticipantIds] = useState(null)
  const [saving, setSaving] = useState(false)

  // ── Programme de concert ────────────────────────────────────────────────────
  const [showProgramPanel, setShowProgramPanel] = useState(false)
  // null = non chargé, [] = vide, [...] = chargé avec données
  const [programItems, setProgramItems] = useState(null)
  const [savingProgram, setSavingProgram] = useState(false)
  // Formulaire d'ajout d'un item
  const [newItem, setNewItem] = useState({ titre_piece: '', compositeur: '', student_id: '', duree_minutes: '', note: '' })

  // ── Propositions de créneaux de répétition ─────────────────────────────────
  const [showRepetitionPanel, setShowRepetitionPanel] = useState(false)
  // null = non calculé, [] = calculé sans résultat, [...] = propositions triées
  const [repetitionProposals, setRepetitionProposals] = useState(null)
  const [loadingProposals, setLoadingProposals] = useState(false)
  // Clés des créneaux marqués "noté" par l'utilisateur (consultatif, jamais en DB)
  const [confirmedSlots, setConfirmedSlots] = useState(new Set())

  // Élèves de l'école concernée (filtre par school_name si renseigné)
  const schoolStudents = useMemo(() => {
    if (!item.school_name || allStudents.length === 0) return allStudents
    const filtered = allStudents.filter((s) => s.school_name === item.school_name)
    // Si aucun élève de cette école : afficher tous les élèves (l'école n'a peut-être
    // pas d'élèves en base avec ce school_name exactement)
    return filtered.length > 0 ? filtered : allStudents
  }, [allStudents, item.school_name])

  const loadParticipants = async () => {
    const { data } = await supabase
      .from('event_participants')
      .select('student_id')
      .eq('event_id', item.id)
    setParticipantIds((data ?? []).map((r) => r.student_id))
  }

  const handleTogglePanel = async () => {
    // Chargement paresseux : une seule requête à la première ouverture
    if (!showPanel && participantIds === null) await loadParticipants()
    setShowPanel((v) => !v)
  }

  const toggleParticipant = async (studentId) => {
    if (!teacherId || participantIds === null) return
    const isIn = participantIds.includes(studentId)
    setSaving(true)
    if (isIn) {
      await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', item.id)
        .eq('student_id', studentId)
      setParticipantIds((prev) => prev.filter((id) => id !== studentId))
    } else {
      await supabase
        .from('event_participants')
        .insert({ teacher_id: teacherId, event_id: item.id, student_id: studentId })
      setParticipantIds((prev) => [...prev, studentId])
    }
    setSaving(false)
  }

  /**
   * Récupère les leçons des participants dans les 6 prochaines semaines,
   * groupe par (jour_semaine, heure_début) et retient les créneaux où
   * au moins 2 participants sont déjà présents.
   * Consultatif uniquement — aucune écriture en base.
   */
  const fetchRepetitionProposals = async () => {
    if (!participantIds || participantIds.length < 2) return
    setLoadingProposals(true)

    const todayDate = new Date()
    const endDate   = new Date(todayDate.getTime() + 42 * 86400000) // 6 semaines
    const todayISO  = todayDate.toISOString().slice(0, 10)
    const endISO    = endDate.toISOString().slice(0, 10)

    const { data: lessons } = await supabase
      .from('lessons')
      .select('student_id, lesson_date, lesson_time, duration_minutes')
      .in('student_id', participantIds)
      .gte('lesson_date', todayISO)
      .lte('lesson_date', endISO)

    // Regroupement par (jour_semaine | heure_début)
    const groups = {}
    for (const l of lessons ?? []) {
      const d   = new Date(l.lesson_date + 'T00:00:00')
      const dow = d.getDay()
      // Heure arrondie à l'heure (les répétitions se planifient à l'heure pile)
      const heure = (l.lesson_time ?? '').slice(0, 5)
      const key   = `${dow}|${heure}`
      if (!groups[key]) groups[key] = { dow, heure, studentIds: new Set(), occurrences: 0 }
      groups[key].studentIds.add(l.student_id)
      groups[key].occurrences++
    }

    // Sélection des créneaux avec >= 2 participants, triés par couverture décroissante
    const proposals = Object.values(groups)
      .filter(g => g.studentIds.size >= 2)
      .sort((a, b) => b.studentIds.size - a.studentIds.size || b.occurrences - a.occurrences)
      .slice(0, 8)
      .map(g => {
        const prenoms = schoolStudents
          .filter(s => g.studentIds.has(s.id))
          .map(s => s.first_name)
        return {
          key:       `${g.dow}|${g.heure}`,
          label:     `${JOURS_SEMAINE[g.dow]} à ${g.heure}`,
          prenoms,
          count:     g.studentIds.size,
        }
      })

    setRepetitionProposals(proposals)
    setLoadingProposals(false)
  }

  const handleProposerRepetitions = async () => {
    // Première ouverture : charger les propositions
    if (!showRepetitionPanel && repetitionProposals === null) {
      await fetchRepetitionProposals()
    }
    setShowRepetitionPanel(v => !v)
  }

  // ── Handlers programme de concert ──────────────────────────────────────────

  const loadProgram = async () => {
    const { data } = await supabase
      .from('event_program_items')
      .select('id, ordre, titre_piece, compositeur, student_id, duree_minutes, note')
      .eq('event_id', item.id)
      .order('ordre')
    setProgramItems(data ?? [])
  }

  const handleToggleProgramPanel = async () => {
    if (!showProgramPanel && programItems === null) await loadProgram()
    setShowProgramPanel((v) => !v)
  }

  const handleAddProgramItem = async () => {
    if (!newItem.titre_piece.trim()) return
    setSavingProgram(true)
    const ordre = (programItems?.length ?? 0) + 1
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: inserted } = await supabase
      .from('event_program_items')
      .insert({
        event_id:      item.id,
        teacher_id:    authUser.id,
        ordre,
        titre_piece:   newItem.titre_piece.trim(),
        compositeur:   newItem.compositeur.trim() || null,
        student_id:    newItem.student_id || null,
        duree_minutes: newItem.duree_minutes ? Number(newItem.duree_minutes) : null,
        note:          newItem.note.trim() || null,
      })
      .select('id, ordre, titre_piece, compositeur, student_id, duree_minutes, note')
      .single()
    if (inserted) setProgramItems((prev) => [...(prev ?? []), inserted])
    setNewItem({ titre_piece: '', compositeur: '', student_id: '', duree_minutes: '', note: '' })
    setSavingProgram(false)
  }

  const handleDeleteProgramItem = async (id) => {
    await supabase.from('event_program_items').delete().eq('id', id)
    setProgramItems((prev) => {
      const filtered = prev.filter((i) => i.id !== id)
      // Renormaliser les ordres
      return filtered.map((it, idx) => ({ ...it, ordre: idx + 1 }))
    })
  }

  const handleMoveProgramItem = async (index, direction) => {
    if (!programItems) return
    const newList = [...programItems]
    const swapIdx = index + direction
    if (swapIdx < 0 || swapIdx >= newList.length) return
    ;[newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]]
    const renumbered = newList.map((it, idx) => ({ ...it, ordre: idx + 1 }))
    setProgramItems(renumbered)
    // Mettre à jour les ordres en base (deux updates)
    await supabase.from('event_program_items').update({ ordre: renumbered[index].ordre }).eq('id', renumbered[index].id)
    await supabase.from('event_program_items').update({ ordre: renumbered[swapIdx].ordre }).eq('id', renumbered[swapIdx].id)
  }

  const handleExportProgramme = () => {
    if (!programItems) return
    const items = programItems.map((it) => {
      const student = schoolStudents.find((s) => s.id === it.student_id)
      return {
        ...it,
        student_name: student ? [(student.first_name || ''), (student.last_name || '')].filter(Boolean).join(' ') : null,
      }
    })
    exportProgrammeConcertPDF({
      event: item, programItems: items,
      teacherName: user?.name, teacherAddress: user?.address,
      teacherPhone: user?.phone, teacherEmail: user?.email,
    })
  }

  const handleExportFicheTechnique = () => {
    if (!participantIds) return
    const participantDetails = schoolStudents.filter((s) => participantIds.includes(s.id))
    exportFicheTechniquePDF({
      event: item, participants: participantDetails,
      teacherName: user?.name, teacherAddress: user?.address,
      teacherPhone: user?.phone, teacherEmail: user?.email,
    })
  }

  const handleExportPDF = () => {
    if (!participantIds) return
    const participantDetails = schoolStudents.filter((s) => participantIds.includes(s.id))
    exportEventRoutePDF({
      event: item,
      participants: participantDetails,
      teacherName:    user?.name,
      teacherAddress: user?.address,
      teacherPhone:   user?.phone,
      teacherEmail:   user?.email,
    })
  }

  const nbParticipants = participantIds?.length ?? null

  return (
    <div className={`glass-panel rounded-2xl p-4 ${isPast ? 'opacity-60' : ''}`}>
      {/* ── Contenu principal ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${
              isPast
                ? 'border-border-subtle bg-surface text-muted-foreground'
                : 'border-guitar-600/30 bg-guitar-600/10 text-guitar-400'
            }`}>
              {fmtDate(item.event_date)}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          {item.content && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">{item.content}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-overlay transition-all"
            title="Modifier"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Supprimer l'événement « ${item.title} » ? Cette action est irréversible.`)) {
                onDelete(item)
              }
            }}
            className="p-1.5 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/8 transition-all"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Bouton ouvrir le panel participants ── */}
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleTogglePanel}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          {nbParticipants !== null
            ? `${nbParticipants} participant${nbParticipants !== 1 ? 's' : ''} — Feuille de route`
            : 'Participants & feuille de route'}
          {showPanel
            ? <ChevronUp className="w-3 h-3 ml-1" />
            : <ChevronDown className="w-3 h-3 ml-1" />}
        </button>
      </div>

      {/* ── Panel participants ── */}
      {showPanel && (
        <>
        <div className="mt-3 space-y-3">
          {schoolStudents.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aucun élève enregistré — ajoutez des élèves dans la section Élèves.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {schoolStudents.map((s) => {
                const checked = (participantIds ?? []).includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleParticipant(s.id)}
                    disabled={saving}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left ${
                      checked
                        ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                        : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      checked ? 'bg-guitar-600 border-guitar-600' : 'border-border'
                    }`}>
                      {checked && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <span className="truncate">{s.first_name} {s.last_name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={!participantIds}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium hover:bg-surface-overlay transition-colors disabled:opacity-40"
          >
            <FileDown className="w-3.5 h-3.5" />
            Feuille de route
          </button>

          <button
            type="button"
            onClick={handleExportFicheTechnique}
            disabled={!participantIds}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium hover:bg-surface-overlay transition-colors disabled:opacity-40"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Fiche technique
          </button>

          <button
            type="button"
            onClick={handleToggleProgramPanel}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-guitar-600/30 bg-guitar-600/5 text-xs font-medium text-guitar-400 hover:bg-guitar-600/10 transition-colors"
          >
            <ListMusic className="w-3.5 h-3.5" />
            {showProgramPanel ? 'Masquer le programme' : 'Programme de concert'}
          </button>

          {/* Créneaux de répétition — seulement si >= 2 participants cochés */}
          {participantIds && participantIds.length >= 2 && (
            <button
              type="button"
              onClick={handleProposerRepetitions}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-guitar-600/30 bg-guitar-600/5 text-xs font-medium text-guitar-400 hover:bg-guitar-600/10 transition-colors"
            >
              <Music2 className="w-3.5 h-3.5" />
              {showRepetitionPanel ? 'Masquer les créneaux' : 'Proposer des créneaux de répétition'}
            </button>
          )}
        </div>

        {/* ── Panel propositions de créneaux ── */}
        {showRepetitionPanel && (

          <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Créneaux communs — {participantIds.length} participants
            </p>
            <p className="text-xs text-muted-foreground">
              Basé sur les cours planifiés dans les 6 prochaines semaines. Consultatif uniquement — aucune leçon créée automatiquement.
            </p>

            {loadingProposals && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Calcul des créneaux communs…</span>
              </div>
            )}

            {!loadingProposals && repetitionProposals !== null && repetitionProposals.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Aucun créneau commun trouvé dans les 6 prochaines semaines. Vérifiez que les leçons de ces élèves sont bien planifiées.
              </p>
            )}

            {!loadingProposals && repetitionProposals !== null && repetitionProposals.length > 0 && (
              <div className="space-y-1.5">
                {repetitionProposals.map(p => (
                  <div
                    key={p.key}
                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all ${
                      confirmedSlots.has(p.key)
                        ? 'border-guitar-600/40 bg-guitar-600/10'
                        : 'border-border-subtle bg-surface'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{p.label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.prenoms.join(', ')} — {p.count} élève{p.count > 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmedSlots(prev => {
                        const next = new Set(prev)
                        if (next.has(p.key)) next.delete(p.key)
                        else next.add(p.key)
                        return next
                      })}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        confirmedSlots.has(p.key)
                          ? 'bg-guitar-600/20 text-guitar-400'
                          : 'border border-border-subtle text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      {confirmedSlots.has(p.key) ? <><Check className="w-3 h-3" /> Noté</> : 'Confirmer'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── Panel programme de concert ── */}
        {showProgramPanel && (
          <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Programme de concert</p>
              <button
                type="button"
                onClick={handleExportProgramme}
                disabled={!programItems || programItems.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs hover:bg-surface-overlay transition-colors disabled:opacity-40"
              >
                <FileDown className="w-3 h-3" />
                Exporter PDF
              </button>
            </div>

            {/* Liste des items existants */}
            {programItems && programItems.length > 0 && (
              <div className="space-y-1.5">
                {programItems.map((it, idx) => {
                  const student = schoolStudents.find((s) => s.id === it.student_id)
                  return (
                    <div key={it.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle bg-surface text-xs">
                      <span className="text-muted-foreground w-5 text-center shrink-0">{it.ordre}</span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{it.titre_piece}</span>
                        {it.compositeur && <span className="text-muted-foreground ml-1">— {it.compositeur}</span>}
                        {student && <span className="text-muted-foreground ml-1">· {student.first_name}</span>}
                        {it.duree_minutes && <span className="text-muted-foreground ml-1">({it.duree_minutes} min)</span>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => handleMoveProgramItem(idx, -1)} disabled={idx === 0} className="p-0.5 text-muted hover:text-foreground disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleMoveProgramItem(idx, 1)} disabled={idx === programItems.length - 1} className="p-0.5 text-muted hover:text-foreground disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteProgramItem(it.id)} className="p-0.5 text-muted hover:text-guitar-400 ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {programItems !== null && programItems.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Aucune pièce encore ajoutée.</p>
            )}

            {/* Formulaire d'ajout */}
            <div className="space-y-2 pt-1 border-t border-border-subtle">
              <p className="text-xs text-muted-foreground font-medium">Ajouter une pièce</p>
              <input
                value={newItem.titre_piece}
                onChange={e => setNewItem(p => ({ ...p, titre_piece: e.target.value }))}
                placeholder="Titre de la pièce *"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newItem.compositeur}
                  onChange={e => setNewItem(p => ({ ...p, compositeur: e.target.value }))}
                  placeholder="Compositeur"
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60"
                />
                <select
                  value={newItem.student_id}
                  onChange={e => setNewItem(p => ({ ...p, student_id: e.target.value }))}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-guitar-600/60"
                >
                  <option value="">— Interprète —</option>
                  {schoolStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={newItem.duree_minutes}
                  onChange={e => setNewItem(p => ({ ...p, duree_minutes: e.target.value }))}
                  placeholder="Durée (min)"
                  min={1}
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60"
                />
                <input
                  value={newItem.note}
                  onChange={e => setNewItem(p => ({ ...p, note: e.target.value }))}
                  placeholder="Remarque"
                  className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60"
                />
              </div>
              <button
                type="button"
                onClick={handleAddProgramItem}
                disabled={savingProgram || !newItem.titre_piece.trim()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-40"
              >
                {savingProgram ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Ajouter
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}

// ─── Section avec titre et compteur ──────────────────────────────────────────

function SectionTitle({ icon: Icon, title, count, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted" />
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          {title}
          {count != null && <span className="ml-1.5 text-muted/60">({count})</span>}
        </h2>
      </div>
      {action}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SchoolNotesPage() {
  const [items, setItems] = useState([])
  const [schools, setSchools] = useState([])
  const [activeSchool, setActiveSchool] = useState(null)
  // Élèves complets pour le panel participants de chaque EventCard
  const [allStudents, setAllStudents] = useState([])
  const [teacherId, setTeacherId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [showPastEvents, setShowPastEvents] = useState(false)

  // ── Chargement ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setTeacherId(user.id)

      const [notesRes, schoolsRes, studentsRes] = await Promise.all([
        supabase.from('school_notes_events').select('*').order('created_at', { ascending: false }),
        user ? supabase.from('schools').select('name').eq('teacher_id', user.id).order('name') : Promise.resolve({ data: [] }),
        // Champs complets : nécessaires pour les checkboxes et le PDF (contact)
        user
          ? supabase.from('students').select('id, first_name, last_name, email, phone, school_name').eq('teacher_id', user.id).order('last_name')
          : Promise.resolve({ data: [] }),
      ])

      if (notesRes.error) {
        setFetchError(notesRes.error.message)
        setLoading(false)
        return
      }

      const fromTable = (schoolsRes.data ?? []).map((s) => s.name).filter(Boolean)
      const fromStudents = [...new Set((studentsRes.data ?? []).map((s) => s.school_name).filter(Boolean))]
      const uniqueSchools = fromTable.length > 0 ? fromTable : fromStudents.sort()

      setItems(notesRes.data ?? [])
      setSchools(uniqueSchools)
      setAllStudents(studentsRes.data ?? [])
      if (uniqueSchools.length > 0 && !activeSchool) setActiveSchool(uniqueSchools[0])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaved = (savedItem, isEdit) => {
    setItems(prev =>
      isEdit
        ? prev.map(x => x.id === savedItem.id ? savedItem : x)
        : [savedItem, ...prev]
    )
    setShowForm(false)
    setEditingItem(null)
    if (savedItem.school_name && !schools.includes(savedItem.school_name)) {
      setSchools(prev => [...prev, savedItem.school_name].sort())
    }
    setActiveSchool(savedItem.school_name)
  }

  const handleDelete = async (item) => {
    const { error } = await supabase
      .from('school_notes_events')
      .delete()
      .eq('id', item.id)
    if (!error) {
      setItems(prev => prev.filter(x => x.id !== item.id))
    }
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingItem(null)
  }

  // ── Filtrage ───────────────────────────────────────────────────────────────

  const filtered = items.filter(x => !activeSchool || x.school_name === activeSchool)
  const notes = filtered.filter(x => x.type === 'note')
  const today = todayStr()
  const allEvents = filtered
    .filter(x => x.type === 'evenement')
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  const futureEvents = allEvents.filter(x => (x.event_date ?? '') >= today)
  const pastEvents = allEvents.filter(x => (x.event_date ?? '') < today)
  const visibleEvents = showPastEvents ? allEvents : futureEvents

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl">
      {/* En-tête */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-3xl text-foreground mb-1">Notes & Événements</h1>
          <HelpTooltip texte="Ajoutez des mémos, réunions ou événements liés à une école. Les événements avec participants peuvent être exportés en feuille de route PDF." position="bottom" />
        </div>
        <p className="text-sm text-muted-foreground">
          Mémos et dates importantes par école partenaire.
        </p>
      </div>

      {fetchError && (
        <div className="mb-6 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Erreur lors du chargement : {fetchError}
        </div>
      )}

      {/* Filtre par école */}
      {schools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {schools.map(school => (
            <button
              key={school}
              type="button"
              onClick={() => setActiveSchool(school)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                activeSchool === school
                  ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                  : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {school}
            </button>
          ))}
        </div>
      )}

      {/* Bouton ajouter */}
      {!showForm && (
        <button
          onClick={() => { setEditingItem(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 mb-6"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      )}

      {/* Formulaire */}
      {showForm && (
        <NoteForm
          schools={schools}
          selectedSchool={activeSchool}
          onSaved={handleSaved}
          onCancel={handleCancelForm}
          initial={editingItem}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Notes ── */}
          <div>
            <SectionTitle
              icon={StickyNote}
              title="Notes"
              count={notes.length}
            />
            {notes.length === 0 ? (
              <div className="glass-panel rounded-2xl px-5 py-8 text-center">
                <StickyNote className="w-7 h-7 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {activeSchool
                    ? `Aucune note pour ${activeSchool}.`
                    : 'Aucune note enregistrée.'}
                </p>
                <p className="text-xs text-muted mt-1">
                  Ajoutez des mémos, observations ou rappels liés à cette école.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(item => (
                  <NoteCard
                    key={item.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Événements ── */}
          <div>
            <SectionTitle
              icon={CalendarDays}
              title="Événements"
              count={visibleEvents.length}
              action={
                pastEvents.length > 0 && (
                  <button
                    onClick={() => setShowPastEvents(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPastEvents
                      ? <><ChevronUp className="w-3.5 h-3.5" /> Masquer les passés</>
                      : <><ChevronDown className="w-3.5 h-3.5" /> {pastEvents.length} passé{pastEvents.length > 1 ? 's' : ''}</>
                    }
                  </button>
                )
              }
            />
            {visibleEvents.length === 0 ? (
              <div className="glass-panel rounded-2xl px-5 py-8 text-center">
                <CalendarDays className="w-7 h-7 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {activeSchool
                    ? `Aucun événement à venir pour ${activeSchool}.`
                    : 'Aucun événement à venir.'}
                </p>
                <p className="text-xs text-muted mt-1">
                  Concerts, auditions, réunions pédagogiques… notez ici les dates importantes.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleEvents.map(item => (
                  <EventCard
                    key={item.id}
                    item={item}
                    isPast={(item.event_date ?? '') < today}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    allStudents={allStudents}
                    teacherId={teacherId}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
