import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Square, Download, Loader2, AlertCircle, Trash2, ClipboardList } from 'lucide-react'

// ─── Helpers privés ───────────────────────────────────────────────────────────

// Extension réelle à partir du type MIME du blob audio : le navigateur choisit
// lui-même le codec (webm/opus sur Chrome, mp4/AAC sur Safari) — jamais codé en dur.
function extensionFromMimeType(mimeType) {
  const base = (mimeType || '').split(';')[0].trim()
  const map = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  }
  return map[base] ?? 'webm'
}

// Horodatage sans caractères interdits dans les noms de fichiers.
function fmtTimestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}h${pad(date.getMinutes())}`
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Dictée vocale réutilisable : bouton "Dicter", enregistrement MediaRecorder,
 * transcription Web Speech API affichée en temps réel dans sa propre zone,
 * lecteur audio + transcription éditable après l'arrêt, téléchargement local.
 * Audio strictement local — aucun envoi réseau.
 *
 * Props :
 *   onInsert(text)      — appelé quand l'utilisateur clique "Insérer dans mes notes" ;
 *     le parent appende ce texte à son propre champ. La zone de saisie manuelle
 *     n'est JAMAIS touchée automatiquement pendant l'enregistrement.
 *   onActiveChange(bool) — appelé quand l'état "en cours" change ; permet au
 *     parent de désactiver ses propres contrôles pendant la dictée.
 */
export default function DicteeAudio({ onInsert, onActiveChange }) {
  const [recording,  setRecording]  = useState(false)
  // true entre le clic sur "Arrêter" et la finalisation réelle du blob audio
  // (onstop est asynchrone — surtout sur Safari).
  const [processing, setProcessing] = useState(false)
  const [audioUrl,   setAudioUrl]   = useState(null)
  const [elapsed,    setElapsed]    = useState(0)
  const [voiceError,    setVoiceError]    = useState('')
  const [playbackError, setPlaybackError] = useState('')
  // Transcription en temps réel pendant l'enregistrement (state React → rendu).
  const [liveTranscript,   setLiveTranscript]   = useState('')
  // Transcription figée + éditable après la finalisation du blob.
  const [frozenTranscript, setFrozenTranscript] = useState(null)

  const recorderRef       = useRef(null)
  const chunksRef         = useRef([])
  const recognitionRef    = useRef(null)
  const timerRef          = useRef(null)
  const streamRef         = useRef(null)
  // Accumulateur de texte reconnu : écrit depuis le callback SpeechRecognition
  // (hors cycle React) pour éviter la closure sur liveTranscript.
  const liveAccRef        = useRef('')
  const audioMimeTypeRef  = useRef('')
  const recordedAtRef     = useRef(null)

  const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const teardownRecording = () => {
    clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch { /* déjà arrêtée */ }
    try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop() } catch { /* déjà arrêté */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  useEffect(() => teardownRecording, [])

  useEffect(() => {
    onActiveChange?.(recording || processing)
  }, [recording, processing]) // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = async () => {
    // Force l'arrêt de tout ce qui pourrait encore tourner avant un nouveau cycle
    // (une seule instance SpeechRecognition active autorisée par navigateur).
    teardownRecording()
    setVoiceError('')
    setPlaybackError('')
    setFrozenTranscript(null)
    setLiveTranscript('')
    liveAccRef.current = ''
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
      audioMimeTypeRef.current = rec.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: audioMimeTypeRef.current })
      setAudioUrl(URL.createObjectURL(blob))
      // Figé ici (finalisation réelle), pas au clic "Arrêter" : la reconnaissance
      // peut encore livrer un résultat tardif entre les deux (notamment Safari).
      setFrozenTranscript(liveAccRef.current || null)
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
        // Accumule dans le ref (pas de closure stale) puis met à jour le state
        // pour l'affichage en temps réel dans la zone "Transcription en cours".
        liveAccRef.current = liveAccRef.current ? `${liveAccRef.current} ${text}` : text
        setLiveTranscript(liveAccRef.current)
      }
      r.onend = () => {
        // Ne relancer que si l'instance est encore la courante (évite les doublons).
        if (recorderRef.current?.state === 'recording' && recognitionRef.current === r) {
          try { r.start() } catch { /* déjà relancée */ }
        }
      }
      r.onerror = () => {}
      recognitionRef.current = r
      try { r.start() } catch { /* audio continue même sans reconnaissance */ }
    }

    setElapsed(0)
    setRecording(true)
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000)
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch {}
    recordedAtRef.current = new Date()
    setProcessing(true)
    recorderRef.current?.stop()
    setRecording(false)
  }

  const deleteRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setPlaybackError('')
    setFrozenTranscript(null)
    setLiveTranscript('')
    liveAccRef.current = ''
  }

  const downloadRecording = () => {
    if (!audioUrl) return
    const extension = extensionFromMimeType(audioMimeTypeRef.current)
    const filename = `dictee-${fmtTimestampForFilename(recordedAtRef.current ?? new Date())}.${extension}`
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
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
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-guitar-400 font-mono">{fmtElapsed(elapsed)}</span>
            <span className="text-xs text-muted-foreground flex-1">
              {hasSpeechRecognition ? 'Dictée en cours…' : 'Enregistrement en cours…'}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-guitar-600/20 text-guitar-400 text-xs font-medium hover:bg-guitar-600/30 transition-colors"
            >
              <Square className="w-3 h-3" />
              Arrêter
            </button>
          </div>

          {/* Zone de transcription en temps réel — visible dès le premier mot reconnu */}
          {hasSpeechRecognition && liveTranscript && (
            <div className="px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
              <p className="text-xs font-medium text-muted-foreground mb-1">Transcription en cours…</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{liveTranscript}</p>
            </div>
          )}
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
          <div className="px-3 py-2 rounded-xl bg-surface border border-border-subtle">
            <audio
              src={audioUrl}
              controls
              className="w-full h-8"
              style={{ accentColor: 'var(--guitar-600)' }}
              onError={() => setPlaybackError("Erreur sur le fichier audio — l'enregistrement n'a pas pu être lu. Vous pouvez recommencer.")}
            />
          </div>

          {/* Zone de transcription éditable — l'utilisateur peut corriger les erreurs de reconnaissance */}
          <div className="px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Transcription audio</p>
            {frozenTranscript !== null ? (
              <textarea
                value={frozenTranscript}
                onChange={e => setFrozenTranscript(e.target.value)}
                rows={3}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none resize-none leading-relaxed"
                placeholder="Aucune transcription disponible pour cet enregistrement."
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Aucune transcription disponible pour cet enregistrement.
              </p>
            )}
          </div>

          {/* Insérer la transcription dans le champ notes — action explicite, jamais automatique */}
          {onInsert && frozenTranscript && (
            <button
              type="button"
              onClick={() => onInsert(frozenTranscript)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-guitar-600/30 bg-guitar-600/10 text-xs font-medium text-guitar-400 hover:bg-guitar-600/20 transition-all"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Insérer la transcription dans mes notes
            </button>
          )}

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
  )
}
