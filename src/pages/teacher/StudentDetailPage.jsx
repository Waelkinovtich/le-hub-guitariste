import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, Phone, Mail, NotebookPen, Send, Plus, X, ChevronDown, ChevronUp, Loader2, AlertCircle, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import {
  fetchTeacherStudents, deleteStudent, fetchSchoolNames,
  fetchStudentContexts, fetchStudentsPaidByStudent,
  updateStudentContextDuration,
  fetchStudentContacts, addStudentContact, removeStudentContact, setStudentContactPrincipal,
} from '../../services/students'
import { supabase } from '../../lib/supabase'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import AddStudentModal from '../../components/AddStudentModal'
import HelpTooltip from '../../components/HelpTooltip'
import PhoneActions from '../../components/PhoneActions'
import EmailActions from '../../components/EmailActions'
import DicteeAudio from '../../components/DicteeAudio'
import { getSchoolColor } from '../../utils/schoolColors'
import StudentGroupHistory from '../groupes/StudentGroupHistory'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateSeance(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ─── Section comptes-rendus de séance ────────────────────────────────────────
//
// Décision d'architecture : placée sur la fiche élève (StudentDetailPage)
// plutôt que sur EmargementPage. Raison : le professeur y accède via le
// clic sur l'élève depuis StudentsPage ou PlanningPage, et c'est là que
// l'historique complet a du sens. Durée de saisie visée < 1 min grâce à
// DicteeAudio réutilisé tel quel depuis src/components/DicteeAudio.jsx.

function LessonNotesSection({ studentId, studentEmail, studentFirstName }) {
  const [notes, setNotes]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [travaille, setTravaille]       = useState('')
  const [aFaire, setAFaire]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState('')
  // Envoi email : { noteId, editedContent } | null
  const [sendTarget, setSendTarget]     = useState(null)
  const [sendSubject, setSendSubject]   = useState('')
  const [sendBody, setSendBody]         = useState('')
  const [sending, setSending]           = useState(false)
  const [sendResult, setSendResult]     = useState(null)
  // Expansion d'une note dans l'historique
  const [expanded, setExpanded]         = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('lesson_notes')
        .select('id, contenu_travaille, contenu_a_faire, transcription_audio, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(50)
      setNotes(data ?? [])
      setLoading(false)
    }
    load()
  }, [studentId])

  const handleSave = async () => {
    if (!travaille.trim() && !aFaire.trim()) {
      setSaveError('Remplissez au moins un des deux champs.')
      return
    }
    setSaving(true)
    setSaveError('')
    const { data: authData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('lesson_notes')
      .insert({
        teacher_id:         authData.user.id,
        student_id:         studentId,
        contenu_travaille:  travaille.trim() || null,
        contenu_a_faire:    aFaire.trim() || null,
      })
      .select('id, contenu_travaille, contenu_a_faire, transcription_audio, created_at')
      .single()
    if (error) { setSaveError(error.message); setSaving(false); return }
    setNotes(prev => [data, ...prev])
    setTravaille('')
    setAFaire('')
    setShowForm(false)
    setSaving(false)
  }

  const ouvrirEnvoi = (note) => {
    const lignes = []
    if (note.contenu_travaille) lignes.push(`Ce que nous avons travaillé :\n${note.contenu_travaille}`)
    if (note.contenu_a_faire)   lignes.push(`Pour la semaine prochaine :\n${note.contenu_a_faire}`)
    setSendBody(lignes.join('\n\n'))
    setSendSubject(`Compte-rendu de séance — ${fmtDateSeance(note.created_at)}`)
    setSendTarget(note)
    setSendResult(null)
  }

  const envoyerEmail = async () => {
    if (!studentEmail) return
    setSending(true)
    setSendResult(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const jwt = sessionData?.session?.access_token ?? ''
      const res = await fetch('/api/send-lesson-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          to:               studentEmail,
          studentFirstName,
          customSubject:    sendSubject,
          // On envoie le corps modifié comme texte brut ; la route construit le HTML
          contenuTravaille: sendTarget?.contenu_travaille ?? null,
          contenuAFaire:    sendTarget?.contenu_a_faire ?? null,
          dateSeance:       sendTarget?.created_at ?? null,
        }),
      })
      const json = await res.json()
      setSendResult(res.ok ? { success: true } : { error: json.error ?? 'Erreur inconnue' })
    } catch (e) {
      setSendResult({ error: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground">Comptes-rendus de séance</h2>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setSaveError('') }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-guitar-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau compte-rendu
          </button>
        )}
      </div>

      {/* Formulaire de saisie */}
      {showForm && (
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nouvelle séance</p>
            <button onClick={() => setShowForm(false)} className="text-muted hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Champ 1 : Ce qui a été travaillé */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Ce qui a été travaillé</p>
            <textarea
              value={travaille}
              onChange={e => setTravaille(e.target.value)}
              placeholder="Gammes pentatoniques, accord de Ré majeur, rythme en triolets…"
              rows={3}
              className="w-full bg-surface-raised border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors resize-none"
            />
            <div className="mt-2">
              <DicteeAudio onTranscription={(t) => setTravaille(prev => prev ? `${prev} ${t}` : t)} />
            </div>
          </div>

          {/* Champ 2 : Pour la semaine prochaine */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Pour la semaine prochaine</p>
            <textarea
              value={aFaire}
              onChange={e => setAFaire(e.target.value)}
              placeholder="Retravailler les transitions, apprendre le couplet par cœur…"
              rows={2}
              className="w-full bg-surface-raised border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors resize-none"
            />
            <div className="mt-2">
              <DicteeAudio onTranscription={(t) => setAFaire(prev => prev ? `${prev} ${t}` : t)} />
            </div>
          </div>

          {saveError && (
            <p className="text-xs text-guitar-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {saveError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shadow-lg shadow-guitar-600/25"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
        </div>
      )}

      {/* Historique */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun compte-rendu enregistré.</p>
      ) : (
        <div className="space-y-2">
          {notes.map(note => {
            const isExpanded = expanded === note.id
            return (
              <div key={note.id} className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
                {/* En-tête de la note (toujours visible) */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : note.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-raised transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{fmtDateSeance(note.created_at)}</p>
                    <p className="text-sm text-foreground truncate mt-0.5">
                      {note.contenu_travaille || note.contenu_a_faire || '—'}
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted flex-shrink-0 ml-2" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted flex-shrink-0 ml-2" />
                  }
                </button>

                {/* Détail dépliable */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
                    {note.contenu_travaille && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Ce qui a été travaillé</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{note.contenu_travaille}</p>
                      </div>
                    )}
                    {note.contenu_a_faire && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Pour la semaine prochaine</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{note.contenu_a_faire}</p>
                      </div>
                    )}

                    {/* Envoi email */}
                    {studentEmail ? (
                      sendTarget?.id === note.id ? (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs font-medium text-muted-foreground">Envoyer à <span className="text-foreground">{studentEmail}</span></p>
                          <input
                            type="text"
                            value={sendSubject}
                            onChange={e => setSendSubject(e.target.value)}
                            className="w-full bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-guitar-600/60 transition-colors"
                          />
                          {sendResult?.success ? (
                            <p className="text-xs text-green-400 flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              Email envoyé.
                            </p>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={envoyerEmail}
                                disabled={sending}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-guitar-600/40 bg-guitar-600/10 text-guitar-400 text-xs font-medium hover:bg-guitar-600/20 transition-colors disabled:opacity-40"
                              >
                                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Envoyer
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSendTarget(null); setSendResult(null) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Annuler
                              </button>
                            </div>
                          )}
                          {sendResult?.error && (
                            <p className="text-xs text-guitar-400 flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              {sendResult.error}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => ouvrirEnvoi(note)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-guitar-400 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Envoyer à l'élève / au parent
                        </button>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Aucun email enregistré pour cet élève — ajoutez-en un sur la fiche pour pouvoir envoyer.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Composants de présentation ───────────────────────────────────────────────

// phone/email : bascule le contenu vers PhoneActions/EmailActions (appui long
// → appeler/SMS/mail) plutôt qu'un simple texte.
function ContactLine({ icon: Icon, value, phone = false, email = false }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      {phone ? <PhoneActions number={value} /> : email ? <EmailActions email={value} /> : <span>{value}</span>}
    </div>
  )
}

function Section({ title, children, help }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
        {title}
        {help && <HelpTooltip texte={help} position="right" />}
      </p>
      {children}
    </div>
  )
}

// Étiquettes et couleurs des types de contexte (valeurs canoniques stockées en base)
const CTX_COLORS = { ecole: '#7c3aed', cesu: '#dc2626' }
const CTX_LABELS = { ecole: 'École de musique', cesu: 'Cours particulier (CESU)' }

// Durées de cours proposables (en minutes). Source : grilles horaires standard.
const DUREES_COURS = [15, 30, 45, 60, 90, 120]

const payeurLabelReadOnly = (ctx, students) => {
  if (ctx.context_type !== 'cesu') return null
  if (ctx.payer_student_id) {
    const p = students.find((s) => s.id === ctx.payer_student_id)
    return 'Payé par ' + (p?.name ?? 'un autre élève')
  }
  if (ctx.school_id) return 'Payé par ' + (ctx.school_name ?? 'un employeur enregistré')
  return 'Paiement direct'
}

// ─── Contacts supplémentaires étiquetés ──────────────────────────────────────
//
// Affiche et gère les contacts additionnels (table student_contacts).
// Les champs email/phone de students restent le contact "principal de référence" ;
// cette section permet d'en ajouter d'autres (ado + parent, parent 1 + parent 2…).

// Étiquettes suggérées — l'utilisateur peut aussi saisir librement via <datalist>
const ETIQUETTES_SUGGEREES = ['Élève', 'Mère', 'Père', 'Parent', 'Tuteur']

function StudentContactsSection({ studentId, teacherId }) {
  const [contacts, setContacts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ type: 'email', valeur: '', etiquette: 'Élève' })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    fetchStudentContacts(studentId)
      .then(setContacts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId])

  const handleAdd = async () => {
    if (!form.valeur.trim()) { setFormError('La valeur est obligatoire.'); return }
    if (!form.etiquette.trim()) { setFormError('L\'étiquette est obligatoire.'); return }
    setSaving(true)
    setFormError('')
    try {
      const nouveau = await addStudentContact(teacherId, studentId, {
        type:      form.type,
        valeur:    form.valeur,
        etiquette: form.etiquette,
      })
      setContacts((prev) => [...prev, nouveau])
      setForm({ type: 'email', valeur: '', etiquette: 'Élève' })
      setShowForm(false)
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (contactId) => {
    try {
      await removeStudentContact(contactId)
      setContacts((prev) => prev.filter((c) => c.id !== contactId))
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  const handleSetPrincipal = async (contact) => {
    try {
      await setStudentContactPrincipal(teacherId, studentId, contact.id, contact.type)
      setContacts((prev) => prev.map((c) =>
        c.type === contact.type
          ? { ...c, est_principal: c.id === contact.id }
          : c
      ))
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider">
          Contacts supplémentaires
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setFormError('') }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-guitar-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Nouveau contact</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Type */}
          <div className="flex gap-2">
            {[
              { value: 'email',     label: 'Email',     Icon: Mail  },
              { value: 'telephone', label: 'Téléphone', Icon: Phone },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: value }))}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  form.type === value
                    ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle text-muted-foreground hover:border-border'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Valeur */}
          <input
            type={form.type === 'email' ? 'email' : 'tel'}
            placeholder={form.type === 'email' ? 'adresse@exemple.fr' : '06 xx xx xx xx'}
            value={form.valeur}
            onChange={(e) => setForm((f) => ({ ...f, valeur: e.target.value }))}
            className="w-full bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
          />

          {/* Étiquette avec suggestions */}
          <div>
            <input
              type="text"
              list="etiquettes-contacts"
              placeholder="À qui appartient ce contact ? (ex: Élève, Mère…)"
              value={form.etiquette}
              onChange={(e) => setForm((f) => ({ ...f, etiquette: e.target.value }))}
              className="w-full bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-guitar-600/60 transition-colors"
            />
            <datalist id="etiquettes-contacts">
              {ETIQUETTES_SUGGEREES.map((e) => <option key={e} value={e} />)}
            </datalist>
          </div>

          {formError && (
            <p className="text-xs text-guitar-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {formError}
            </p>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
        </div>
      )}

      {/* Liste des contacts */}
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : contacts.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">
          Aucun contact supplémentaire. Utilisez "Ajouter" pour enregistrer l'email ou le téléphone d'un parent, d'un ado, etc.
        </p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => {
            const Icon = c.type === 'email' ? Mail : Phone
            return (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{c.valeur}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {c.etiquette}
                    {c.est_principal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-guitar-600/30 bg-guitar-600/10 text-guitar-400 font-medium">principal</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!c.est_principal && (
                    <button
                      type="button"
                      onClick={() => handleSetPrincipal(c)}
                      title="Définir comme contact principal"
                      className="text-xs text-muted-foreground hover:text-guitar-400 transition-colors px-2 py-1 rounded-lg border border-border-subtle hover:border-guitar-600/30"
                    >
                      Principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(c.id)}
                    title="Supprimer ce contact"
                    className="text-muted-foreground hover:text-guitar-400 transition-colors p-1.5 rounded-lg hover:bg-guitar-600/8"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Contextes en état local — mis à jour après reload pour rafraîchir AddStudentModal
  const [contexts, setContexts] = useState([])

  const load = useCallback(async () => {
    const [students, schools, ctxData] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchSchoolNames(user.id),
      fetchStudentContexts(id),
    ])
    const paidByThis = await fetchStudentsPaidByStudent(id, user.id).catch(() => [])
    return {
      student:     students.find((s) => s.id === id) ?? null,
      allStudents: students,
      schools,
      contexts:    ctxData,
      paidByThis,
    }
  }, [user.id, id])

  const { data, loading, error, reload } = useFetch(load, [id])

  useEffect(() => {
    if (data?.contexts) setContexts(data.contexts)
  }, [data])

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cet élève ?')) return
    setDeleting(true)
    try {
      await deleteStudent(id)
      navigate('/professeur/eleves')
    } catch (err) {
      alert('Erreur : ' + err.message)
      setDeleting(false)
    }
  }

  if (loading) return <LoadingBlock label="Chargement de la fiche" />
  if (error) return <ErrorBlock message={error} />
  if (!data?.student) return <ErrorBlock message="Élève introuvable." />

  const { student, schools, allStudents, paidByThis } = data
  const color = student.lessonType === 'ecole' ? getSchoolColor(student.schoolName, schools) : '#dc2626'
  const hasParent1 = student.parent1Name || student.parent1Phone || student.parent1Email
  const hasParent2 = student.parent2Name || student.parent2Phone || student.parent2Email

  // Tous les types de cours de cet élève (legacy lesson_type + contextes student_contexts)
  const allContextTypes = new Set()
  if (student.lessonType === 'ecole') allContextTypes.add('ecole')
  if (student.lessonType === 'particulier') allContextTypes.add('cesu')
  contexts.forEach((c) => allContextTypes.add(c.context_type))

  return (
    <div className="p-6 sm:p-8 max-w-3xl space-y-4">
      <button onClick={() => navigate('/professeur/eleves')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Retour aux élèves
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg" style={{ backgroundColor: color }}>
            {student.firstName?.[0]}{student.lastName?.[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{student.name}</h1>
              <HelpTooltip texte="Coordonnées, école de rattachement et historique des cours. Si un cours est annulé, allez dans Heures à rattraper pour proposer un nouveau créneau." />
            </div>
            {student.age && <p className="text-sm text-muted-foreground">{student.age} ans</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">
            <Pencil className="w-4 h-4" />
            Modifier
          </button>
          <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-guitar-600/40 text-guitar-400 text-sm font-medium hover:bg-guitar-600/10 transition-colors disabled:opacity-60">
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      </div>

      <Section title="Cours" help="Historique de tous les cours de cet élève. Les cours annulés par le professeur apparaissent dans Heures à rattraper.">
        {/* Badges des types de cours */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Type{allContextTypes.size > 1 ? 's' : ''} de cours</p>
          <div className="flex gap-2 flex-wrap">
            {[...allContextTypes].map((ct) => {
              const c = CTX_COLORS[ct] ?? '#6b7280'
              return (
                <span key={ct} className="inline-block px-2 py-1 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: c + '25', borderColor: c + '60', color: c }}>
                  {ct === 'ecole' ? (student.schoolName || CTX_LABELS.ecole) : CTX_LABELS.cesu}
                </span>
              )
            })}
          </div>
        </div>

        {/* Détails par contexte (taux horaire, payeur) */}
        {contexts.length > 0 && (
          <div className="space-y-2 mb-4">
            {contexts.map((ctx) => {
              const pLabel = payeurLabelReadOnly(ctx, allStudents ?? [])
              return (
                <div key={ctx.id} className="p-3 rounded-xl bg-surface-raised border border-border-subtle space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{CTX_LABELS[ctx.context_type] ?? ctx.context_type}</span>
                    {ctx.context_type === 'ecole' && ctx.school_name && (
                      <span className="text-xs text-muted-foreground">– {ctx.school_name}</span>
                    )}
                    {ctx.hourly_rate != null && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {Number(ctx.hourly_rate).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/h
                      </span>
                    )}
                  </div>
                  {pLabel && <p className="text-xs text-muted-foreground">{pLabel}</p>}
                  {/* Durée de cours — prime sur la durée déclarée dans le sondage */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground shrink-0">Durée de cours</label>
                    <select
                      className="text-xs border border-border-subtle rounded-lg px-2 py-1 bg-surface"
                      value={ctx.duree_cours_minutes ?? ''}
                      onChange={async (e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value)
                        try {
                          await updateStudentContextDuration(ctx.id, val)
                          setContexts((prev) => prev.map((c) => c.id === ctx.id ? { ...c, duree_cours_minutes: val } : c))
                        } catch (err) {
                          alert('Erreur : ' + err.message)
                        }
                      }}
                    >
                      <option value="">— selon le sondage —</option>
                      {DUREES_COURS.map((d) => (
                        <option key={d} value={d}>{d} min</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Niveau, instrument, progression */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Niveau</p>
            <p className="text-sm">{student.level ?? '--'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Instrument</p>
            <p className="text-sm">{student.instrument ?? '--'}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Progression</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full rounded-full" style={{ width: student.progress + '%', backgroundColor: color }} />
            </div>
            <span className="text-sm font-medium">{student.progress}%</span>
          </div>
        </div>
      </Section>

      {paidByThis && paidByThis.length > 0 && (
        <Section title="Paie aussi les cours de">
          <div className="space-y-2">
            {paidByThis.map((s) => (
              <button
                key={s.studentId}
                type="button"
                onClick={() => navigate('/professeur/eleves/' + s.id)}
                className="flex items-center justify-between w-full text-left px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle hover:bg-surface-overlay transition-colors text-sm font-medium"
              >
                {s.name}
                <span className="text-xs text-muted-foreground">Voir la fiche →</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Participations aux groupes">
        <StudentGroupHistory studentId={student.id} />
      </Section>

      <LessonNotesSection
        studentId={student.id}
        studentEmail={student.email || student.parent1Email || null}
        studentFirstName={student.firstName ?? null}
      />

      <Section title="Contact élève">
        <div className="space-y-2">
          <ContactLine icon={Phone} value={student.studentPhone || student.phone} phone />
          <ContactLine icon={Mail} value={student.email} email />
          {!student.studentPhone && !student.phone && !student.email && (
            <p className="text-sm text-muted-foreground">Aucun contact renseigné</p>
          )}
        </div>
      </Section>

      <StudentContactsSection studentId={student.id} teacherId={user.id} />

      {hasParent1 && (
        <Section title={student.parent1Name || 'Parent / Tuteur 1'}>
          <div className="space-y-2">
            <ContactLine icon={Phone} value={student.parent1Phone} phone />
            <ContactLine icon={Mail} value={student.parent1Email} email />
          </div>
        </Section>
      )}

      {hasParent2 && (
        <Section title={student.parent2Name || 'Parent / Tuteur 2'}>
          <div className="space-y-2">
            <ContactLine icon={Phone} value={student.parent2Phone} phone />
            <ContactLine icon={Mail} value={student.parent2Email} email />
          </div>
        </Section>
      )}

      {student.notes && (
        <Section title="Remarques">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{student.notes}</p>
        </Section>
      )}

      {showEdit && (
        <AddStudentModal
          teacherId={user.id}
          student={student}
          contexts={contexts}
          allStudents={allStudents ?? []}
          onClose={() => setShowEdit(false)}
          onCreated={() => { reload(); setShowEdit(false) }}
        />
      )}
    </div>
  )
}
