import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, Phone, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import {
  fetchTeacherStudents, deleteStudent, fetchSchoolNames,
  fetchStudentContexts, fetchStudentsPaidByStudent,
} from '../../services/students'
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

// Étiquettes et couleurs des types de contexte (valeurs canoniques stockées en base)
const CTX_COLORS = { ecole: '#7c3aed', cesu: '#dc2626' }
const CTX_LABELS = { ecole: 'École de musique', cesu: 'Cours particulier (CESU)' }

const payeurLabelReadOnly = (ctx, students) => {
  if (ctx.context_type !== 'cesu') return null
  if (ctx.payer_student_id) {
    const p = students.find((s) => s.id === ctx.payer_student_id)
    return 'Payé par ' + (p?.name ?? 'un autre élève')
  }
  if (ctx.school_id) return 'Payé par ' + (ctx.school_name ?? 'un employeur enregistré')
  return 'Paiement direct'
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
                <div key={ctx.id} className="p-3 rounded-xl bg-surface-raised border border-border-subtle space-y-1">
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
          contexts={contexts}
          allStudents={allStudents ?? []}
          onClose={() => setShowEdit(false)}
          onCreated={() => { reload(); setShowEdit(false) }}
        />
      )}
    </div>
  )
}
