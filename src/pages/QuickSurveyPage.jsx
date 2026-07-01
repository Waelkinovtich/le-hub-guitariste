import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Guitar, Check, Loader2, AlertCircle, Send } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

export default function QuickSurveyPage() {
  const { token } = useParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [survey, setSurvey] = useState(null)
  const [tokenRow, setTokenRow] = useState(null)
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      // Récupère le token
      const { data: tokenData, error: tokenErr } = await supabase
        .from('survey_tokens')
        .select('id, student_id, used_at, quick_survey_id')
        .eq('token', token)
        .maybeSingle()

      if (tokenErr || !tokenData) {
        setError('Lien invalide ou expiré.')
        setLoading(false)
        return
      }
      if (tokenData.used_at) {
        setDone(true)
        setLoading(false)
        return
      }
      if (!tokenData.quick_survey_id) {
        setError('Ce lien ne correspond à aucun sondage rapide.')
        setLoading(false)
        return
      }

      const { data: surveyData, error: surveyErr } = await supabase
        .from('quick_surveys')
        .select('id, title, question, options')
        .eq('id', tokenData.quick_survey_id)
        .maybeSingle()

      if (surveyErr || !surveyData) {
        setError('Sondage introuvable.')
        setLoading(false)
        return
      }

      setTokenRow(tokenData)
      setSurvey(surveyData)
      setLoading(false)
    }
    load()
  }, [token])

  const toggleOption = (opt) => {
    setSelected(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    )
  }

  const submit = async () => {
    if (selected.length === 0) return
    setSubmitting(true)
    try {
      const { error: insertErr } = await supabase
        .from('quick_survey_responses')
        .insert({
          survey_id: survey.id,
          token_id: tokenRow.id,
          student_id: tokenRow.student_id ?? null,
          selected_options: selected,
        })
      if (insertErr) throw new Error(insertErr.message)

      await supabase
        .from('survey_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenRow.id)

      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl guitar-gradient flex items-center justify-center shadow-lg shadow-guitar-600/20">
            <Guitar className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display text-lg leading-tight text-foreground">Hub du Guitariste</p>
            <p className="text-xs text-muted">Florent Waelkens · Professeur de guitare</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Chargement…
          </div>
        )}

        {!loading && error && (
          <div className="glass-panel rounded-2xl p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-guitar-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

        {!loading && done && !error && (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-600/15 border border-green-600/25 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <h2 className="font-display text-2xl text-foreground mb-2">Merci !</h2>
            <p className="text-sm text-muted-foreground">Votre réponse a bien été enregistrée.</p>
          </div>
        )}

        {!loading && survey && !done && !error && (
          <div className="glass-panel rounded-2xl p-6">
            <h1 className="font-display text-2xl text-foreground mb-1">{survey.title}</h1>
            <p className="text-sm text-muted-foreground mb-6">{survey.question}</p>

            <div className="space-y-2 mb-8">
              {(survey.options ?? []).map((opt) => {
                const active = selected.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-guitar-600/40 bg-guitar-600/8 text-foreground'
                        : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${
                      active ? 'bg-guitar-600 border-guitar-600' : 'border-border'
                    }`}>
                      {active && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm font-medium">{opt}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={submit}
              disabled={selected.length === 0 || submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</>
                : <><Send className="w-4 h-4" /> Envoyer ma réponse</>}
            </button>

            {error && (
              <p className="mt-3 text-xs text-guitar-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />{error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
