import { useState, useEffect } from 'react'
import { Users, Mail, Plus, Trash2, CheckSquare, Square, Send, Loader2, Check, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ─── Composants ───────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SendSurveyPage() {
  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [selected, setSelected] = useState(new Set())

  const [newEmail, setNewEmail] = useState('')
  const [newEmails, setNewEmails] = useState([])
  const [emailError, setEmailError] = useState('')

  const [generating, setGenerating] = useState(false)
  const [generatedLinks, setGeneratedLinks] = useState([])
  const [genError, setGenError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  // ── Load students ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, email, school_name')
        .order('last_name')
      setStudents(data ?? [])
      setLoadingStudents(false)
    }
    load()
  }, [])

  // ── Select/deselect ────────────────────────────────────────────────────────

  const withEmail = students.filter(s => s.email)
  const allSelected = withEmail.length > 0 && withEmail.every(s => selected.has(s.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(withEmail.map(s => s.id)))
    }
  }

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── New emails ─────────────────────────────────────────────────────────────

  const addEmail = () => {
    const email = newEmail.trim()
    setEmailError('')
    if (!isValidEmail(email)) {
      setEmailError('Adresse email invalide.')
      return
    }
    const alreadyInStudents = students.some(s => s.email?.toLowerCase() === email.toLowerCase())
    const alreadyAdded = newEmails.some(e => e.email.toLowerCase() === email.toLowerCase())
    if (alreadyInStudents || alreadyAdded) {
      setEmailError('Cet email est déjà dans la liste.')
      return
    }
    setNewEmails(prev => [...prev, { email }])
    setNewEmail('')
  }

  const removeEmail = (email) => {
    setNewEmails(prev => prev.filter(e => e.email !== email))
  }

  // ── Generate tokens ────────────────────────────────────────────────────────

  const totalRecipients = selected.size + newEmails.length

  const generate = async () => {
    if (totalRecipients === 0) return
    setGenerating(true)
    setGenError('')
    setGeneratedLinks([])

    try {
      const selectedStudents = students.filter(s => selected.has(s.id))

      const rows = [
        ...selectedStudents.map(s => ({
          student_id: s.id,
          email: s.email,
          token: crypto.randomUUID(),
        })),
        ...newEmails.map(e => ({
          student_id: null,
          email: e.email,
          token: crypto.randomUUID(),
        })),
      ]

      const { data: inserted, error } = await supabase
        .from('survey_tokens')
        .insert(rows.map(r => ({ student_id: r.student_id, email: r.email, token: r.token })))
        .select('id, student_id, email, token')

      if (error) throw new Error(error.message)

      const baseUrl = window.location.origin

      const links = inserted.map(row => {
        const student = row.student_id ? selectedStudents.find(s => s.id === row.student_id) : null
        return {
          id: row.id,
          studentId: row.student_id,
          email: row.email,
          token: row.token,
          url: `${baseUrl}/sondage/${row.token}`,
          name: student ? `${student.first_name} ${student.last_name}`.trim() : null,
        }
      })

      setGeneratedLinks(links)
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Send emails ───────────────────────────────────────────────────────────

  const sendEmails = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const payload = generatedLinks.map(l => ({
        tokenId: l.id,
        email: l.email,
        studentId: l.studentId ?? null,
        token: l.token,
      }))
      const res = await fetch('/api/send-surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: payload }),
      })
      const json = await res.json()
      setSendResult(json)
    } catch (e) {
      setSendResult({ sent: 0, errors: [{ error: e.message }] })
    } finally {
      setSending(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-1">Envoyer le sondage</h1>
        <p className="text-sm text-muted-foreground">
          Générez un lien unique par destinataire pour le sondage d'inscription.
        </p>
      </div>

      {/* ── Élèves existants ── */}
      <div className="glass-panel rounded-2xl p-5 mb-4">
        <SectionHeader
          icon={Users}
          title="Élèves existants"
          subtitle="Sélectionnez les élèves auxquels envoyer le sondage."
        />

        {loadingStudents ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        ) : students.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Aucun élève enregistré.</p>
        ) : (
          <>
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-guitar-400" />
                : <Square className="w-4 h-4" />}
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              <span className="text-muted/60">({withEmail.length} avec email)</span>
            </button>

            <div className="space-y-1.5">
              {students.map(s => {
                const hasEmail = Boolean(s.email)
                const isSelected = selected.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!hasEmail}
                    onClick={() => hasEmail && toggleOne(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      !hasEmail
                        ? 'border-border-subtle bg-surface opacity-40 cursor-not-allowed'
                        : isSelected
                          ? 'border-guitar-600/40 bg-guitar-600/8'
                          : 'border-border-subtle bg-surface hover:border-border'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-guitar-400" />
                        : <Square className="w-4 h-4 text-muted" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {s.first_name} {s.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email ?? <span className="italic">Pas d'email</span>}
                        {s.school_name && <span className="ml-2 text-muted/60">· {s.school_name}</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Nouveaux destinataires ── */}
      <div className="glass-panel rounded-2xl p-5 mb-6">
        <SectionHeader
          icon={Mail}
          title="Nouveaux destinataires"
          subtitle="Ajoutez des adresses email pour des élèves non encore enregistrés."
        />

        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEmailError('') }}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
            placeholder="exemple@email.com"
            className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
          />
          <button
            type="button"
            onClick={addEmail}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:border-border hover:text-foreground transition-all"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        {emailError && (
          <p className="mt-2 text-xs text-guitar-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {emailError}
          </p>
        )}

        {newEmails.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {newEmails.map(({ email }) => (
              <div key={email} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border-subtle bg-surface">
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <span className="text-sm text-foreground truncate">{email}</span>
                </div>
                <button
                  onClick={() => removeEmail(email)}
                  className="text-muted hover:text-guitar-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bouton générer ── */}
      <button
        onClick={generate}
        disabled={totalRecipients === 0 || generating}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40 mb-6"
      >
        {generating
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
          : <><Send className="w-4 h-4" /> Générer les tokens{totalRecipients > 0 ? ` (${totalRecipients})` : ''}</>}
      </button>

      {genError && (
        <div className="mb-4 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {genError}
        </div>
      )}

      {/* ── Tokens générés — prêt pour le script ── */}
      {generatedLinks.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-600/10 border border-green-600/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {generatedLinks.length} token{generatedLinks.length > 1 ? 's' : ''} générés avec succès
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Les liens sont stockés dans <code className="font-mono bg-surface px-1 rounded">survey_tokens</code>.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Destinataires</p>
            {generatedLinks.map(({ email, token, name }) => (
              <div key={token} className="flex items-center gap-2">
                <span className="text-xs text-muted">·</span>
                {name && <span className="text-sm text-foreground font-medium">{name}</span>}
                <span className="text-xs text-muted-foreground">{email}</span>
              </div>
            ))}
          </div>

          {!sendResult ? (
            <button
              onClick={sendEmails}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
            >
              {sending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
                : <><Send className="w-4 h-4" /> Envoyer les emails ({generatedLinks.length})</>}
            </button>
          ) : (
            <div className={`rounded-xl border px-4 py-3 text-sm ${sendResult.errors?.length ? 'border-guitar-600/30 bg-guitar-600/8' : 'border-green-600/30 bg-green-600/8'}`}>
              <p className={`font-medium mb-1 ${sendResult.errors?.length ? 'text-guitar-400' : 'text-green-400'}`}>
                {sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} envoyé{sendResult.sent !== 1 ? 's' : ''}
                {sendResult.errors?.length ? ` · ${sendResult.errors.length} erreur(s)` : ''}
              </p>
              {sendResult.errors?.map((e, i) => (
                <p key={i} className="text-xs text-muted-foreground">{e.email ?? e.tokenId} — {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
