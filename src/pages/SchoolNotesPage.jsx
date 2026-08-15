import { useState, useEffect, useRef, useMemo } from 'react'
import { StickyNote, CalendarDays, Plus, Trash2, Pencil, Check, Loader2, AlertCircle, X, ChevronDown, ChevronUp, Mic, MicOff, Square, Users, FileDown, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportEventRoutePDF } from '../utils/exportPDF'
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

  // ── Dictée vocale (notes uniquement, audio strictement local) ──────────────
  const [recording, setRecording] = useState(false)
  // true entre le clic sur "Arrêter" et la finalisation réelle du blob audio
  // (onstop est asynchrone — surtout sur Safari, qui peut prendre un instant
  // pour finaliser l'encodage). Évite d'afficher une erreur prématurée.
  const [processing, setProcessing] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [voiceError, setVoiceError] = useState('')
  // Erreur de LECTURE confirmée (après finalisation du blob), distincte de
  // voiceError qui couvre l'accès micro.
  const [playbackError, setPlaybackError] = useState('')
  // Transcription figée de LA dictée en cours, affichée sous le lecteur audio.
  // null = aucun enregistrement finalisé pour l'instant.
  const [frozenTranscript, setFrozenTranscript] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  // Accumulateur de transcription vivant pendant l'enregistrement en cours ;
  // copié dans frozenTranscript une fois le blob audio réellement finalisé.
  const liveTranscriptRef = useRef('')
  // Type MIME réel produit par le MediaRecorder — nécessaire pour donner au
  // fichier téléchargé la bonne extension (voir extensionFromMimeType).
  const audioMimeTypeRef = useRef('')
  // Horodatage de fin de dictée, utilisé pour nommer le fichier téléchargé.
  const recordedAtRef = useRef(null)

  const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // Coupe proprement micro / reconnaissance / minuteur, quelle que soit la
  // raison (arrêt manuel ou démontage du formulaire pendant un enregistrement).
  const teardownRecording = () => {
    clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch { /* déjà arrêtée */ }
    try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop() } catch { /* déjà arrêté */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  useEffect(() => teardownRecording, [])

  const startRecording = async () => {
    setVoiceError('')
    setPlaybackError('')
    setFrozenTranscript(null)
    liveTranscriptRef.current = ''
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    chunksRef.current = []
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceError("Accès au micro refusé. Vérifiez les permissions dans les réglages de votre navigateur.")
      return
    }
    streamRef.current = stream
    const rec = new MediaRecorder(stream)
    recorderRef.current = rec
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      // Le blob doit être étiqueté avec le type MIME réellement produit par
      // le MediaRecorder (rec.mimeType), pas un type codé en dur : Safari
      // n'encode généralement pas en audio/webm (souvent audio/mp4), et un
      // Blob mal étiqueté échoue au décodage dans l'élément <audio>.
      audioMimeTypeRef.current = rec.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: audioMimeTypeRef.current })
      setAudioUrl(URL.createObjectURL(blob))
      // Figé ici (finalisation réelle du blob), pas au clic sur "Arrêter" :
      // la reconnaissance vocale peut encore livrer un résultat tardif entre
      // les deux, notamment sur Safari.
      setFrozenTranscript(liveTranscriptRef.current)
      setProcessing(false)
    }
    rec.onerror = () => {
      setProcessing(false)
      setVoiceError("L'enregistrement audio a échoué. Réessayez.")
    }
    rec.start()

    if (hasSpeechRecognition) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const r = new SR()
      r.lang = 'fr-FR'
      r.continuous = false
      r.interimResults = false
      r.onresult = (e) => {
        const text = Array.from(e.results).map((res) => res[0].transcript).join(' ')
        setContent((prev) => prev ? prev + ' ' + text : text)
        liveTranscriptRef.current = liveTranscriptRef.current ? `${liveTranscriptRef.current} ${text}` : text
      }
      r.onend = () => {
        if (recorderRef.current?.state === 'recording') { try { r.start() } catch {} }
      }
      r.onerror = () => {}
      r.start()
      recognitionRef.current = r
    }

    setElapsed(0)
    setRecording(true)
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000)
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch {}
    recordedAtRef.current = new Date()
    // recording passe à false immédiatement mais audioUrl n'est prêt qu'une
    // fois onstop déclenché (asynchrone) : "processing" comble cet
    // intervalle pour que l'UI n'affiche ni le bouton "Dicter" ni une
    // erreur tant que le blob n'est pas réellement finalisé.
    setProcessing(true)
    recorderRef.current?.stop()
    setRecording(false)
  }

  // Supprime l'audio ET sa transcription figée ensemble : les deux décrivent
  // la même prise, il n'y a pas de sens à en garder un sans l'autre.
  const deleteRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setPlaybackError('')
    setFrozenTranscript(null)
    liveTranscriptRef.current = ''
  }

  // Téléchargement local du blob déjà en mémoire (aucun envoi réseau) : une
  // fois le fichier sur le disque de l'utilisateur, l'app ne peut ni le
  // rouvrir ni le supprimer à distance — limite technique du navigateur.
  const downloadRecording = () => {
    if (!audioUrl) return
    const extension = extensionFromMimeType(audioMimeTypeRef.current)
    const filename = `note-${fmtTimestampForFilename(recordedAtRef.current ?? new Date())}.${extension}`
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
            disabled={recording || processing}
            title={(recording || processing) ? 'Arrêtez la dictée en cours avant de changer de type' : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
              type === val
                ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
            } ${(recording || processing) ? 'opacity-40 cursor-not-allowed' : ''}`}
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

        {/* Dictée vocale — notes uniquement, audio local */}
        {type === 'note' && (
          <div className="space-y-2">
            {!recording && !processing && !audioUrl && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Dicter
                </button>
                {!hasSpeechRecognition && (
                  <span className="text-xs text-muted">
                    (transcription non disponible dans ce navigateur — l'audio reste local)
                  </span>
                )}
              </div>
            )}
            {recording && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/20">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-xs text-guitar-400 font-mono">{fmtElapsed(elapsed)}</span>
                <span className="text-xs text-muted-foreground flex-1">{hasSpeechRecognition ? 'Dictée en cours…' : 'Enregistrement en cours…'}</span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-guitar-600/20 text-guitar-400 text-xs font-medium hover:bg-guitar-600/30 transition-colors"
                >
                  <Square className="w-3 h-3" />
                  Arrêter
                </button>
              </div>
            )}
            {processing && !recording && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface border border-border-subtle">
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Finalisation de l'enregistrement…</span>
              </div>
            )}
            {audioUrl && !recording && !processing && (
              <div className="space-y-2">
                {/* 1. Audio */}
                <div className="px-3 py-2 rounded-xl bg-surface border border-border-subtle">
                  <audio
                    src={audioUrl}
                    controls
                    className="w-full h-8"
                    style={{ accentColor: 'var(--guitar-600)' }}
                    onError={() => setPlaybackError("Erreur sur le fichier audio — l'enregistrement n'a pas pu être lu. Vous pouvez recommencer.")}
                  />
                </div>

                {/* 2. Transcription — lecture seule, figée à la finalisation de l'audio */}
                <div className="px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Transcription</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {frozenTranscript || 'Aucune transcription disponible pour cet enregistrement.'}
                  </p>
                </div>

                {/* 3. Boutons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Télécharger
                  </button>
                  <button
                    type="button"
                    onClick={deleteRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-guitar-400 hover:border-guitar-600/30 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer l'enregistrement
                  </button>
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Recommencer
                  </button>
                </div>
              </div>
            )}
            {playbackError && (
              <p className="text-xs text-guitar-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {playbackError}
              </p>
            )}
            {voiceError && (
              <p className="text-xs text-guitar-400 flex items-center gap-1.5">
                <MicOff className="w-3.5 h-3.5 flex-shrink-0" />
                {voiceError}
              </p>
            )}
          </div>
        )}

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

  const handleExportPDF = () => {
    if (!participantIds) return
    const participantDetails = schoolStudents.filter((s) => participantIds.includes(s.id))
    exportEventRoutePDF({
      event: item,
      participants: participantDetails,
      teacherName: user?.name,
      teacherPhone: user?.phone,
      teacherEmail: user?.email,
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
            Générer la feuille de route
          </button>
        </div>
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
        <h1 className="font-display text-3xl text-foreground mb-1">Notes & Événements</h1>
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
