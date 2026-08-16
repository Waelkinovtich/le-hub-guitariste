import { useState, useEffect, useMemo } from 'react'
import { Users, Mail, Plus, Trash2, CheckSquare, Square, Send, Loader2, Check, AlertCircle, School, UserCheck, Bookmark, BookmarkPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import HelpTooltip from '../components/HelpTooltip'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ─── Composants ───────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, help }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {help && <HelpTooltip texte={help} position="right" />}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const MODES = [
  { id: 'tous',    icon: Users,      label: 'Tous les élèves' },
  { id: 'ecole',   icon: School,     label: 'Par école' },
  { id: 'manuel',  icon: UserCheck,  label: 'Sélection manuelle' },
]

export default function SendSurveyPage() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)

  // ── Mode sélection ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState('tous')
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [manualSelected, setManualSelected] = useState(new Set())

  // ── Emails ad-hoc ──────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('')
  const [newEmails, setNewEmails] = useState([])
  const [emailError, setEmailError] = useState('')

  // ── Génération / envoi ─────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [generatedLinks, setGeneratedLinks] = useState([])
  const [genError, setGenError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  // ── Préréglages destinataires ──────────────────────────────────────────────
  const [presets, setPresets] = useState([])
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showPresetForm, setShowPresetForm] = useState(false)

  // ── Load students ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [{ data: studentsData }, { data: presetsData }] = await Promise.all([
        supabase.from('students').select('id, first_name, last_name, email, school_name').order('last_name'),
        supabase.from('survey_recipient_presets').select('*').order('created_at', { ascending: true }),
      ])
      setStudents(studentsData ?? [])
      setPresets(presetsData ?? [])
      setLoadingStudents(false)
    }
    load()
  }, [])

  const withEmail = useMemo(() => students.filter(s => s.email), [students])
  const schools   = useMemo(() => [...new Set(students.map(s => s.school_name).filter(Boolean))].sort(), [students])

  // ── Calcul des destinataires selon le mode ─────────────────────────────────

  const selectedStudents = useMemo(() => {
    if (mode === 'tous') return withEmail
    if (mode === 'ecole') {
      if (!selectedSchool) return []
      return withEmail.filter(s => s.school_name === selectedSchool)
    }
    if (mode === 'manuel') return withEmail.filter(s => manualSelected.has(s.id))
    return []
  }, [mode, withEmail, selectedSchool, manualSelected])

  const toggleManual = (id) => {
    setManualSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllManual = () => {
    const allSelected = withEmail.every(s => manualSelected.has(s.id))
    setManualSelected(allSelected ? new Set() : new Set(withEmail.map(s => s.id)))
  }

  // Réinitialise la sélection manuelle quand on change de mode
  const changeMode = (m) => {
    setMode(m)
    setSelectedSchool(null)
    setManualSelected(new Set())
    setGeneratedLinks([])
    setSendResult(null)
    setGenError('')
  }

  // ── Préréglages ────────────────────────────────────────────────────────────

  const appliquerPréréglage = (preset) => {
    setMode(preset.mode)
    setSelectedSchool(preset.school_name ?? null)
    setManualSelected(new Set(preset.student_ids ?? []))
    setNewEmails((preset.extra_emails ?? []).map(e => ({ email: e })))
    setGeneratedLinks([])
    setSendResult(null)
    setGenError('')
  }

  const sauvegarderPréréglage = async () => {
    if (!presetName.trim()) return
    setSavingPreset(true)
    const payload = {
      teacher_id:   user.id,
      name:         presetName.trim(),
      mode,
      school_name:  mode === 'ecole' ? selectedSchool : null,
      student_ids:  mode === 'manuel' ? [...manualSelected] : null,
      extra_emails: newEmails.map(e => e.email),
    }
    const { data, error } = await supabase
      .from('survey_recipient_presets')
      .insert(payload)
      .select('*')
      .single()
    if (!error && data) {
      setPresets(prev => [...prev, data])
    }
    setPresetName('')
    setShowPresetForm(false)
    setSavingPreset(false)
  }

  const supprimerPréréglage = async (id) => {
    await supabase.from('survey_recipient_presets').delete().eq('id', id)
    setPresets(prev => prev.filter(p => p.id !== id))
  }

  // ── Emails ad-hoc ──────────────────────────────────────────────────────────

  const addEmail = () => {
    const email = newEmail.trim()
    setEmailError('')
    if (!isValidEmail(email)) { setEmailError('Adresse email invalide.'); return }
    const alreadyInStudents = students.some(s => s.email?.toLowerCase() === email.toLowerCase())
    const alreadyAdded      = newEmails.some(e => e.email.toLowerCase() === email.toLowerCase())
    if (alreadyInStudents || alreadyAdded) { setEmailError('Cet email est déjà dans la liste.'); return }
    setNewEmails(prev => [...prev, { email }])
    setNewEmail('')
  }

  const removeEmail = (email) => setNewEmails(prev => prev.filter(e => e.email !== email))

  // ── Génération des tokens ──────────────────────────────────────────────────

  const totalRecipients = selectedStudents.length + newEmails.length

  const generate = async () => {
    if (totalRecipients === 0) return
    setGenerating(true)
    setGenError('')
    setGeneratedLinks([])
    setSendResult(null)

    try {
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
        .insert(rows.map(r => ({ student_id: r.student_id, email: r.email, token: r.token, teacher_id: user.id })))
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

  // ── Envoi emails ───────────────────────────────────────────────────────────

  const sendEmails = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const payload = generatedLinks.map(l => ({
        tokenId: l.id, email: l.email, studentId: l.studentId ?? null, token: l.token,
      }))
      const res = await fetch('/api/send-surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: payload }),
      })
      setSendResult(await res.json())
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
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-display text-3xl text-foreground">Envoyer le sondage</h1>
          <HelpTooltip texte="Une fois les réponses reçues, allez dans Planning intelligent : l'application vous propose des créneaux adaptés aux disponibilités déclarées par les élèves." />
        </div>
        <p className="text-sm text-muted-foreground">
          Générez un lien unique par destinataire pour le sondage d'inscription.
        </p>
      </div>


      {/* ── Préréglages de destinataires ── */}
      {presets.length > 0 && (
        <div className="glass-panel rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="w-4 h-4 text-muted" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Préréglages enregistrés</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map(preset => (
              <div key={preset.id} className="group flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-xl border border-border-subtle bg-surface hover:border-guitar-600/30 transition-colors">
                <button
                  type="button"
                  onClick={() => appliquerPréréglage(preset)}
                  className="text-xs font-medium text-foreground hover:text-guitar-400 transition-colors"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => supprimerPréréglage(preset.id)}
                  className="ml-1 p-0.5 rounded text-muted hover:text-guitar-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer ce préréglage"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sélecteur de mode ── */}
      <div className="glass-panel rounded-2xl p-5 mb-4">
        <SectionHeader
          icon={Users}
          title="Destinataires"
          subtitle="Choisissez comment sélectionner les élèves à contacter."
          help="Sélection manuelle : choisissez précisément qui reçoit le lien. Par école : utile pour cibler les élèves d'un seul employeur."
        />

        {/* Boutons de mode */}
        <div className="flex gap-2 mb-5">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => changeMode(m.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                mode === m.id
                  ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                  : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <m.icon className="w-3.5 h-3.5 shrink-0" />
              {m.label}
            </button>
          ))}
        </div>

        {/* Contenu selon le mode */}
        {loadingStudents ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
            Chargement des élèves…
          </div>
        ) : (
          <>
            {/* Mode : tous les élèves */}
            {mode === 'tous' && (
              <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3">
                {withEmail.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun élève avec email enregistré.</p>
                ) : (
                  <p className="text-sm text-foreground">
                    <span className="font-medium text-guitar-400">{withEmail.length} élève{withEmail.length > 1 ? 's' : ''}</span>
                    {' '}avec email seront inclus.
                    {students.length - withEmail.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({students.length - withEmail.length} sans email, ignorés)
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Mode : par école */}
            {mode === 'ecole' && (
              <div className="space-y-3">
                {schools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune école trouvée dans les fiches élèves.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Sélectionnez une école :</p>
                    <div className="flex flex-wrap gap-2">
                      {schools.map(school => {
                        const count = withEmail.filter(s => s.school_name === school).length
                        const active = selectedSchool === school
                        return (
                          <button
                            key={school}
                            type="button"
                            onClick={() => setSelectedSchool(active ? null : school)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                              active
                                ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                                : 'border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground'
                            }`}
                          >
                            <School className="w-3.5 h-3.5 shrink-0" />
                            {school}
                            <span className={`text-xs ${active ? 'text-guitar-400/70' : 'text-muted/60'}`}>
                              ({count})
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {selectedSchool && selectedStudents.length === 0 && (
                      <p className="text-xs text-muted-foreground">Aucun élève avec email dans cette école.</p>
                    )}
                    {selectedSchool && selectedStudents.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{selectedStudents.length} élève{selectedStudents.length > 1 ? 's' : ''}</span>
                        {' '}de <span className="font-medium">{selectedSchool}</span> sélectionné{selectedStudents.length > 1 ? 's' : ''}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Mode : sélection manuelle */}
            {mode === 'manuel' && (
              <div className="space-y-2">
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun élève enregistré.</p>
                ) : (
                  <>
                    <button
                      onClick={toggleAllManual}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
                    >
                      {withEmail.every(s => manualSelected.has(s.id)) && withEmail.length > 0
                        ? <CheckSquare className="w-4 h-4 text-guitar-400" />
                        : <Square className="w-4 h-4" />}
                      {withEmail.every(s => manualSelected.has(s.id)) && withEmail.length > 0
                        ? 'Tout désélectionner' : 'Tout sélectionner'}
                      <span className="text-muted/60">({withEmail.length} avec email)</span>
                    </button>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {students.map(s => {
                        const hasEmail  = Boolean(s.email)
                        const isChecked = manualSelected.has(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={!hasEmail}
                            onClick={() => hasEmail && toggleManual(s.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                              !hasEmail
                                ? 'border-border-subtle bg-surface opacity-40 cursor-not-allowed'
                                : isChecked
                                  ? 'border-guitar-600/40 bg-guitar-600/8'
                                  : 'border-border-subtle bg-surface hover:border-border'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {isChecked
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
                    {manualSelected.size > 0 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        <span className="font-medium text-foreground">{manualSelected.size} élève{manualSelected.size > 1 ? 's' : ''}</span> sélectionné{manualSelected.size > 1 ? 's' : ''}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Emails ad-hoc ── */}
      <div className="glass-panel rounded-2xl p-5 mb-6">
        <SectionHeader
          icon={Mail}
          title="Destinataires supplémentaires"
          subtitle="Ajoutez des adresses email pour des familles non encore enregistrées."
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

      {/* ── Enregistrer comme préréglage ── */}
      {totalRecipients > 0 && (
        <div className="mb-4">
          {!showPresetForm ? (
            <button
              type="button"
              onClick={() => setShowPresetForm(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-guitar-400 transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Enregistrer cette sélection comme préréglage
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sauvegarderPréréglage(); if (e.key === 'Escape') setShowPresetForm(false) }}
                placeholder="Nom du préréglage (ex : École Sainte-Marie)"
                maxLength={80}
                autoFocus
                className="flex-1 bg-surface border border-border-subtle rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
              />
              <button
                type="button"
                onClick={sauvegarderPréréglage}
                disabled={!presetName.trim() || savingPreset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-guitar-600/40 bg-guitar-600/10 text-guitar-400 text-xs font-medium hover:bg-guitar-600/20 transition-colors disabled:opacity-40"
              >
                {savingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => { setShowPresetForm(false); setPresetName('') }}
                className="p-2 rounded-xl border border-border-subtle text-muted hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Récapitulatif + bouton générer ── */}
      {totalRecipients > 0 && (
        <div className="mb-3 px-4 py-2 rounded-xl bg-surface border border-border-subtle text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{totalRecipients} destinataire{totalRecipients > 1 ? 's' : ''}</span>
          {selectedStudents.length > 0 && <span> · {selectedStudents.length} élève{selectedStudents.length > 1 ? 's' : ''}</span>}
          {newEmails.length > 0 && <span> · {newEmails.length} email{newEmails.length > 1 ? 's' : ''} ad-hoc</span>}
        </div>
      )}

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

      {/* ── Tokens générés ── */}
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
