import { useState, useEffect } from 'react'
import { Plus, Trash2, Send, BarChart2, ChevronDown, ChevronUp, Loader2, Check, AlertCircle, X } from 'lucide-react'
import HelpTooltip from '../components/HelpTooltip'
import { supabase } from '../lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

// ─── Composant résultats ──────────────────────────────────────────────────────

function SurveyResults({ survey }) {
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('quick_survey_responses')
      .select('selected_options')
      .eq('survey_id', survey.id)
      .then(({ data }) => {
        setResponses(data ?? [])
        setLoading(false)
      })
  }, [survey.id])

  if (loading) return <div className="text-xs text-muted-foreground py-2">Chargement…</div>
  if (!responses.length) return <p className="text-xs text-muted-foreground py-2">Aucune réponse pour l'instant.</p>

  // Décompte par option
  const counts = {}
  for (const opt of (survey.options ?? [])) counts[opt] = 0
  for (const r of responses) {
    for (const opt of (r.selected_options ?? [])) {
      counts[opt] = (counts[opt] ?? 0) + 1
    }
  }
  const total = responses.length
  const maxCount = Math.max(...Object.values(counts), 1)

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground font-medium">{total} réponse{total > 1 ? 's' : ''}</p>
      {(survey.options ?? []).map(opt => {
        const n = counts[opt] ?? 0
        const pct = Math.round((n / total) * 100)
        return (
          <div key={opt}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-foreground">{opt}</span>
              <span className="text-muted-foreground">{n} ({pct}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className="h-full rounded-full guitar-gradient transition-all"
                style={{ width: `${(n / maxCount) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Carte sondage ────────────────────────────────────────────────────────────

function SurveyCard({ survey, onDelete }) {
  const [showResults, setShowResults] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const sendToAll = async () => {
    setSending(true)
    setSendResult(null)
    try {
      // Récupère les tokens liés à ce sondage non encore utilisés
      const { data: tokens, error } = await supabase
        .from('survey_tokens')
        .select('id, email, student_id, token')
        .eq('quick_survey_id', survey.id)
        .is('used_at', null)
        .is('sent_at', null)

      if (error) throw new Error(error.message)
      if (!tokens?.length) {
        setSendResult({ sent: 0, errors: [], info: 'Aucun destinataire non encore contacté.' })
        return
      }

      const res = await fetch('/api/send-surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyType: 'rapide',
          surveyTitle: survey.title,
          tokens: tokens.map(t => ({
            tokenId: t.id,
            email: t.email,
            studentId: t.student_id ?? null,
            token: t.token,
          })),
        }),
      })
      const json = await res.json()
      setSendResult(json)
    } catch (e) {
      setSendResult({ sent: 0, errors: [{ error: e.message }] })
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer le sondage "${survey.title}" et toutes ses réponses ?`)) return
    setDeleting(true)
    await supabase.from('quick_surveys').delete().eq('id', survey.id)
    onDelete(survey.id)
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{survey.title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{survey.question}</p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-muted hover:text-guitar-400 transition-colors flex-shrink-0 mt-0.5"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(survey.options ?? []).map(opt => (
          <span key={opt} className="px-2 py-0.5 rounded-lg bg-surface text-xs text-muted-foreground border border-border-subtle">
            {opt}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={sendToAll}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl guitar-gradient text-white text-xs font-medium hover:opacity-90 transition-opacity shadow-md shadow-guitar-600/20 disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer aux élèves
        </button>
        <button
          onClick={() => setShowResults(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Résultats
          {showResults ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {sendResult && (
        <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${sendResult.errors?.length ? 'border-guitar-600/30 bg-guitar-600/8 text-guitar-400' : 'border-green-600/30 bg-green-600/8 text-green-400'}`}>
          {sendResult.info
            ? sendResult.info
            : <>{sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} envoyé{sendResult.sent !== 1 ? 's' : ''}{sendResult.errors?.length ? ` · ${sendResult.errors.length} erreur(s)` : ''}</>}
          {sendResult.errors?.map((e, i) => (
            <p key={i} className="text-muted-foreground mt-1">{e.email ?? e.tokenId} — {e.error}</p>
          ))}
        </div>
      )}

      {showResults && <SurveyResults survey={survey} />}
    </div>
  )
}

// ─── Formulaire création ──────────────────────────────────────────────────────

function CreateSurveyForm({ onCreated }) {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const addOption = () => setOptions(prev => [...prev, ''])
  const removeOption = (i) => setOptions(prev => prev.filter((_, idx) => idx !== i))
  const setOption = (i, v) => setOptions(prev => prev.map((o, idx) => idx === i ? v : o))

  const save = async () => {
    setErr('')
    const cleanOpts = options.map(o => o.trim()).filter(Boolean)
    if (!title.trim()) return setErr('Le titre est requis.')
    if (!question.trim()) return setErr('La question est requise.')
    if (cleanOpts.length < 2) return setErr('Minimum 2 options.')

    setSaving(true)
    const { data, error } = await supabase
      .from('quick_surveys')
      .insert({ title: title.trim(), question: question.trim(), options: cleanOpts })
      .select('id, title, question, options, created_at')
      .single()

    if (error) { setErr(error.message); setSaving(false); return }

    onCreated(data)
    setTitle('')
    setQuestion('')
    setOptions(['', ''])
    setSaving(false)
  }

  return (
    <div className="glass-panel rounded-2xl p-5 mb-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">Nouveau sondage</h2>

      <div className="space-y-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre (ex: Préférences de répertoire)"
          className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
        />
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Question posée aux élèves"
          rows={2}
          className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors resize-none"
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Options</p>
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="text-muted hover:text-guitar-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addOption}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une option
          </button>
        </div>

        {err && (
          <p className="text-xs text-guitar-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />{err}
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Créer le sondage
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ManageSurveysPage() {
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('quick_surveys')
      .select('id, title, question, options, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setSurveys(data ?? []); setLoading(false) })
  }, [])

  const handleCreated = (s) => setSurveys(prev => [s, ...prev])
  const handleDelete = (id) => setSurveys(prev => prev.filter(s => s.id !== id))

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-3xl text-foreground mb-1">Sondages rapides</h1>
          <HelpTooltip texte="Créez un sondage à choix multiples et partagez-en le lien par SMS ou e-mail. Les réponses s'agrègent en temps réel dans la page Réponses." position="bottom" />
        </div>
        <p className="text-sm text-muted-foreground">Créez et envoyez des sondages ponctuels à vos élèves.</p>
      </div>

      <CreateSurveyForm onCreated={handleCreated} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : surveys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun sondage créé pour l'instant.</p>
      ) : (
        <div className="space-y-4">
          {surveys.map(s => (
            <SurveyCard key={s.id} survey={s} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
