import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, Phone, Mail, Plus, Loader2, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import {
  fetchTeacherStudents, deleteStudent, fetchSchoolNames,
  fetchStudentContexts, addStudentContext, deleteStudentContext,
} from '../../services/students'
import { fetchTeacherSchools } from '../../services/schools'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import AddStudentModal from '../../components/AddStudentModal'
import { getSchoolColor } from '../../utils/schoolColors'
import StudentGroupHistory from '../groupes/StudentGroupHistory'

// ─── Composants de présentation ───────────────────────────────────────────────

function ContactLine({ icon: Icon, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span>{value}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  )
}

// ─── Section contextes de cours ───────────────────────────────────────────────

// Valeurs canoniques stockées en base — sans accents pour éviter toute ambiguïté
const CTX_COLORS = { ecole: '#7c3aed', cesu: '#dc2626' }
const CTX_LABELS = { ecole: 'École de musique', cesu: 'Cours particulier (CESU)' }

function StudentContextsSection({ studentId, teacherId, contexts, ecoleSchools, onContextsChange }) {
  const [showForm, setShowForm]     = useState(false)
  const [formType, setFormType]     = useState('ecole')
  const [formSchoolId, setFormSchoolId] = useState('')
  const [formRate, setFormRate]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const selectedSchool = ecoleSchools.find((s) => s.id === formSchoolId)

  const resetForm = () => { setFormType('ecole'); setFormSchoolId(''); setFormRate('') }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const ctx = await addStudentContext(teacherId, studentId, {
        contextType: formType,
        schoolId:    formType === 'ecole' ? (formSchoolId || null) : null,
        schoolName:  formType === 'ecole' ? (selectedSchool?.name ?? null) : null,
        hourlyRate:  formRate,
      })
      onContextsChange([...contexts, ctx])
      setShowForm(false)
      resetForm()
    } catch (err) {
      // Doublon : l'index unique Supabase retourne un code 23505
      if (err.message?.includes('23505') || err.message?.toLowerCase().includes('unique')) {
        alert('Ce contexte existe déjà pour cet élève.')
      } else {
        alert('Erreur : ' + err.message)
      }
    }
    setSaving(false)
  }

  const handleDelete = async (ctxId) => {
    setDeletingId(ctxId)
    try {
      await deleteStudentContext(ctxId)
      onContextsChange(contexts.filter((c) => c.id !== ctxId))
    } catch (err) {
      alert('Erreur : ' + err.message)
    }
    setDeletingId(null)
  }

  const canSubmit = formType === 'cesu' || (formType === 'ecole' && !!formSchoolId)

  return (
    <Section title="Contextes de cours">
      <p className="text-xs text-muted-foreground mb-3">
        Un élève peut suivre des cours dans plusieurs contextes simultanément — école et CESU — chacun avec son propre taux horaire.
      </p>

      {contexts.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground italic mb-3">Aucun contexte de cours supplémentaire.</p>
      )}

      {contexts.length > 0 && (
        <div className="space-y-2 mb-3">
          {contexts.map((ctx) => {
            const color = CTX_COLORS[ctx.context_type] ?? '#6b7280'
            return (
              <div key={ctx.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border-subtle">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span
                    className="inline-block shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={{ backgroundColor: color + '25', borderColor: color + '60', color }}
                  >
                    {CTX_LABELS[ctx.context_type] ?? ctx.context_type}
                  </span>
                  {ctx.school_name && (
                    <span className="text-sm text-foreground truncate">{ctx.school_name}</span>
                  )}
                  {ctx.hourly_rate != null && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {Number(ctx.hourly_rate).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/h
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(ctx.id)}
                  disabled={deletingId === ctx.id}
                  className="p-1.5 ml-2 shrink-0 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors disabled:opacity-40"
                  title="Retirer ce contexte"
                >
                  {deletingId === ctx.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showForm ? (
        <div className="p-4 rounded-xl bg-surface-raised border border-border-subtle space-y-3">
          {/* Type de contexte */}
          <div className="flex gap-2">
            {[
              { value: 'ecole', label: 'École de musique' },
              { value: 'cesu',  label: 'Cours particulier (CESU)' },
            ].map((opt) => (
              <button
                key={opt.value} type="button"
                onClick={() => { setFormType(opt.value); setFormSchoolId('') }}
                className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  formType === opt.value
                    ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                    : 'border-border-subtle text-muted-foreground hover:border-border'
                }`}
              >{opt.label}</button>
            ))}
          </div>

          {/* École liée — uniquement si contexte "ecole" */}
          {formType === 'ecole' && (
            <select
              value={formSchoolId}
              onChange={(e) => setFormSchoolId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-sm outline-none focus:border-guitar-600"
            >
              <option value="">— Choisir l'école —</option>
              {ecoleSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Taux horaire net pour ce contexte */}
          <div className="relative">
            <input
              type="number" min="0" step="0.01"
              value={formRate}
              onChange={(e) => setFormRate(e.target.value)}
              placeholder="Taux horaire net (optionnel)"
              className="w-full px-3 py-2 pr-10 rounded-lg bg-surface border border-border-subtle text-sm outline-none focus:border-guitar-600"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">€/h</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button" onClick={handleAdd}
              disabled={saving || !canSubmit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg guitar-gradient text-white text-xs font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm() }}
              className="px-3 py-2 rounded-lg border border-border-subtle text-xs font-medium hover:bg-surface-overlay transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un contexte de cours
        </button>
      )}
    </Section>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // État local des contextes pour des mises à jour optimistes (sans reload complet)
  const [contexts, setContexts] = useState([])

  const load = useCallback(async () => {
    const [students, schools, allSchools, ctxData] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchSchoolNames(user.id),
      fetchTeacherSchools(user.id),
      fetchStudentContexts(id),
    ])
    return {
      student:   students.find((s) => s.id === id) ?? null,
      schools,   // string[] — noms uniquement, pour les couleurs
      allSchools, // {id, name, structure_type}[] — pour le sélecteur d'école
      contexts: ctxData,
    }
  }, [user.id, id])

  const { data, loading, error, reload } = useFetch(load, [id])

  // Sync les contextes depuis le fetch (initial et reloads)
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

  const { student, schools, allSchools } = data
  const color = student.lessonType === 'ecole' ? getSchoolColor(student.schoolName, schools) : '#dc2626'
  const lessonLabel = student.lessonType === 'ecole' ? (student.schoolName || 'École de musique') : 'Cours particulier (CESU)'
  const hasParent1 = student.parent1Name || student.parent1Phone || student.parent1Email
  const hasParent2 = student.parent2Name || student.parent2Phone || student.parent2Email

  // Écoles de musique uniquement (hors CESU) pour le sélecteur du formulaire de contexte
  const ecoleSchools = (allSchools ?? []).filter((s) => s.structure_type !== 'particulier_cesu')

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
            <h1 className="text-2xl font-semibold">{student.name}</h1>
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

      <Section title="Cours">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Type principal</p>
            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: color + '25', borderColor: color + '60', color }}>
              {lessonLabel}
            </span>
          </div>
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

      <StudentContextsSection
        studentId={student.id}
        teacherId={user.id}
        contexts={contexts}
        ecoleSchools={ecoleSchools}
        onContextsChange={setContexts}
      />

      <Section title="Participations aux groupes">
        <StudentGroupHistory studentId={student.id} />
      </Section>

      <Section title="Contact élève">
        <div className="space-y-2">
          <ContactLine icon={Phone} value={student.studentPhone || student.phone} />
          <ContactLine icon={Mail} value={student.email} />
          {!student.studentPhone && !student.phone && !student.email && (
            <p className="text-sm text-muted-foreground">Aucun contact renseigné</p>
          )}
        </div>
      </Section>

      {hasParent1 && (
        <Section title={student.parent1Name || 'Parent / Tuteur 1'}>
          <div className="space-y-2">
            <ContactLine icon={Phone} value={student.parent1Phone} />
            <ContactLine icon={Mail} value={student.parent1Email} />
          </div>
        </Section>
      )}

      {hasParent2 && (
        <Section title={student.parent2Name || 'Parent / Tuteur 2'}>
          <div className="space-y-2">
            <ContactLine icon={Phone} value={student.parent2Phone} />
            <ContactLine icon={Mail} value={student.parent2Email} />
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
          onClose={() => setShowEdit(false)}
          onCreated={() => { reload(); setShowEdit(false) }}
        />
      )}
    </div>
  )
}
