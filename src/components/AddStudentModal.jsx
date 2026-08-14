import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createStudent, updateStudent, syncStudentContexts } from '../services/students'
import { fetchTeacherSchools, findOrCreateSchool } from '../services/schools'
import { getSchoolColor } from '../utils/schoolColors'

const LEVELS = ['Debutant', 'Intermediaire', 'Avance']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - i)

/**
 * Modal de création / édition d'un élève.
 *
 * Props :
 *   teacherId   — identifiant du professeur connecté
 *   student     — élève à modifier (undefined = création)
 *   contexts    — student_contexts existants de cet élève (tableau, défaut [])
 *   allStudents — liste complète des élèves (pour afficher le nom du payeur hérité)
 *   preselect   — { type: 'ecole'|'cesu', schoolId, schoolName } — pré-coche et
 *                 pré-sélectionne depuis une fiche école/employeur (création uniquement)
 *   onClose     — callback fermeture
 *   onCreated   — callback(studentResult) après enregistrement réussi
 */
export default function AddStudentModal({ teacherId, student, contexts = [], allStudents = [], preselect = null, onClose, onCreated }) {
  const isEdit = Boolean(student)

  // ── Contextes existants en base (source de vérité en mode édition) ─────────
  const existingEcole = contexts.find((c) => c.context_type === 'ecole')
  const existingCesu  = contexts.find((c) => c.context_type === 'cesu')
  const hasContexts   = contexts.length > 0

  // Identifiant de l'élève payeur hérité du chantier précédent.
  // Non éditable depuis ce formulaire — affiché en lecture seule uniquement.
  const cesuPayerStudentId = existingCesu?.payer_student_id ?? null
  const payerStudentName   = cesuPayerStudentId
    ? (allStudents.find((s) => s.id === cesuPayerStudentId)?.name ?? 'Élève non identifié')
    : null

  // ── Pré-cochage initial ────────────────────────────────────────────────────
  // Priorité : preselect (depuis fiche école) > contextes existants > lesson_type legacy > défaut CESU
  const initEcoleChecked = preselect
    ? preselect.type === 'ecole'
    : existingEcole != null || (!hasContexts && student?.lessonType === 'ecole')

  const initCesuChecked = preselect
    ? preselect.type === 'cesu'
    : existingCesu != null || (!hasContexts && (student?.lessonType === 'particulier' || !student))

  // ── État général du formulaire ────────────────────────────────────────────
  const [form, setForm] = useState({
    firstName:    student?.firstName    ?? '',
    lastName:     student?.lastName     ?? '',
    email:        student?.email        ?? '',
    phone:        student?.phone        ?? '',
    studentPhone: student?.studentPhone ?? '',
    level:        student?.level        ?? '',
    instrument:   student?.instrument   ?? '',
    progress:     student?.progress     ?? 0,
    birthYear:    student?.birthYear    ?? '',
    notes:        student?.notes        ?? '',
    parent1Name:  student?.parent1Name  ?? '',
    parent1Phone: student?.parent1Phone ?? '',
    parent1Email: student?.parent1Email ?? '',
    parent2Name:  student?.parent2Name  ?? '',
    parent2Phone: student?.parent2Phone ?? '',
    parent2Email: student?.parent2Email ?? '',
  })

  // ── État du contexte École ────────────────────────────────────────────────
  const [ecoleChecked, setEcoleChecked]   = useState(initEcoleChecked)
  // Pré-sélection depuis : contexte existant > school de l'élève legacy > preselect
  const [ecoleSchoolId, setEcoleSchoolId] = useState(
    existingEcole?.school_id ?? student?.schoolId ?? (preselect?.type === 'ecole' ? preselect.schoolId : null)
  )
  const [ecoleRate, setEcoleRate]         = useState(existingEcole?.hourly_rate?.toString() ?? '')
  const [ecoleAddingNew, setEcoleAddingNew] = useState(false)
  const [ecoleNewName, setEcoleNewName]     = useState('')

  // ── État du contexte CESU ─────────────────────────────────────────────────
  const [cesuChecked, setCesuChecked]   = useState(initCesuChecked)
  // Pré-sélection employeur depuis : contexte existant > preselect
  const [cesuSchoolId, setCesuSchoolId] = useState(
    existingCesu?.school_id ?? (preselect?.type === 'cesu' ? preselect.schoolId : null)
  )
  const [cesuRate, setCesuRate]           = useState(existingCesu?.hourly_rate?.toString() ?? '')
  const [cesuAddingNew, setCesuAddingNew] = useState(false)
  const [cesuNewName, setCesuNewName]     = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [knownSchools, setKnownSchools] = useState([])

  useEffect(() => {
    fetchTeacherSchools(teacherId).then(setKnownSchools).catch(() => {})
  }, [teacherId])

  const ecoleSchoolsList = knownSchools.filter((s) => s.structure_type !== 'particulier_cesu')
  const cesuSchoolsList  = knownSchools.filter((s) => s.structure_type === 'particulier_cesu')

  const update = (field) => (e) => {
    const value = field === 'progress' ? Number(e.target.value) : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // ── Validations ──────────────────────────────────────────────────────────
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Le prénom et le nom sont obligatoires.'); return
    }
    if (!ecoleChecked && !cesuChecked) {
      setError('Sélectionnez au moins un type de cours (École ou CESU).'); return
    }
    if (ecoleChecked && !ecoleSchoolId && !ecoleNewName.trim()) {
      setError("Précisez l'école de musique ou saisissez-en une nouvelle."); return
    }
    // Pour CESU : employeur requis seulement si pas de payer_student_id hérité
    if (cesuChecked && !cesuPayerStudentId && !cesuSchoolId && !cesuNewName.trim()) {
      setError("Sélectionnez un employeur CESU ou saisissez-en un nouveau."); return
    }

    setSubmitting(true)
    try {
      // ── Résolution de l'école de musique (création à la volée si besoin) ──
      let resolvedEcoleSchoolId   = ecoleSchoolId
      let resolvedEcoleSchoolName = ecoleSchoolsList.find((s) => s.id === ecoleSchoolId)?.name ?? null
      if (ecoleChecked && ecoleAddingNew && ecoleNewName.trim()) {
        const school = await findOrCreateSchool(teacherId, ecoleNewName.trim())
        resolvedEcoleSchoolId   = school.id
        resolvedEcoleSchoolName = school.name
      }

      // ── Résolution de l'employeur CESU (création à la volée si besoin) ──
      let resolvedCesuSchoolId   = cesuSchoolId
      let resolvedCesuSchoolName = cesuSchoolsList.find((s) => s.id === cesuSchoolId)?.name ?? null
      if (cesuChecked && !cesuPayerStudentId && cesuAddingNew && cesuNewName.trim()) {
        // Créer avec structure_type = 'particulier_cesu' pour bien catégoriser l'employeur
        const school = await findOrCreateSchool(teacherId, cesuNewName.trim(), 'particulier_cesu')
        resolvedCesuSchoolId   = school.id
        resolvedCesuSchoolName = school.name
      }

      // ── lesson_type legacy : 'ecole' si École cochée (type primaire), sinon 'particulier' ──
      const lessonType = ecoleChecked ? 'ecole' : 'particulier'
      const schoolId   = ecoleChecked ? (resolvedEcoleSchoolId ?? null) : null
      const schoolName = ecoleChecked ? (resolvedEcoleSchoolName ?? null) : null

      const result = isEdit
        ? await updateStudent(student.id, { ...form, lessonType, schoolId, schoolName })
        : await createStudent(teacherId,   { ...form, lessonType, schoolId, schoolName })

      // ── Configuration des contextes pour syncStudentContexts ──────────────
      const ecoleConfig = ecoleChecked
        ? { schoolId: resolvedEcoleSchoolId, schoolName: resolvedEcoleSchoolName, hourlyRate: ecoleRate }
        : null

      const cesuConfig = cesuChecked ? {
        // Si payer_student_id hérité → préserver pour éviter de perdre la donnée
        payMode:        cesuPayerStudentId ? 'autre_eleve' : 'employeur',
        payerStudentId: cesuPayerStudentId,
        schoolId:       cesuPayerStudentId ? null : resolvedCesuSchoolId,
        schoolName:     cesuPayerStudentId ? null : resolvedCesuSchoolName,
        hourlyRate:     cesuRate,
      } : null

      await syncStudentContexts(teacherId, result.id, ecoleConfig, cesuConfig, isEdit ? contexts : [])

      onCreated(result)
      onClose()
    } catch (err) {
      setError(err.message ?? 'Impossible de sauvegarder.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{isEdit ? 'Modifier' : 'Ajouter'} un élève</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Identité ────────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Identité</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Prénom</label>
                <input value={form.firstName} onChange={update('firstName')} required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.lastName} onChange={update('lastName')} required className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1.5">Année de naissance</label>
              <select value={form.birthYear} onChange={update('birthYear')} className={inputCls}>
                <option value="">--</option>
                {YEARS.map((y) => <option key={y} value={y}>{y} ({currentYear - y} ans)</option>)}
              </select>
            </div>
          </div>

          {/* ── Contact élève ─────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Contact élève</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Tél personnel</label>
                <input type="tel" value={form.studentPhone} onChange={update('studentPhone')} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={update('email')} className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── Parent / Tuteur 1 ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Parent / Tuteur 1</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.parent1Name} onChange={update('parent1Name')} placeholder="Ex : Mme Dupont (mère)" className={inputCls} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Téléphone</label>
                  <input type="tel" value={form.parent1Phone} onChange={update('parent1Phone')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                  <input type="email" value={form.parent1Email} onChange={update('parent1Email')} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Parent / Tuteur 2 ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Parent / Tuteur 2</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Nom</label>
                <input value={form.parent2Name} onChange={update('parent2Name')} placeholder="Ex : M. Dupont (père)" className={inputCls} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Téléphone</label>
                  <input type="tel" value={form.parent2Phone} onChange={update('parent2Phone')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
                  <input type="email" value={form.parent2Email} onChange={update('parent2Email')} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Cours — cases à cocher indépendantes École + CESU ───────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Cours</p>
            <div className="space-y-3">

              {/* ─ Case École de musique ─────────────────────────────────── */}
              <div className="rounded-xl border border-border-subtle overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-overlay transition-colors">
                  <input
                    type="checkbox" checked={ecoleChecked}
                    onChange={(e) => {
                      setEcoleChecked(e.target.checked)
                      if (!e.target.checked) { setEcoleAddingNew(false); setEcoleNewName('') }
                    }}
                    className="w-4 h-4 accent-guitar-600"
                  />
                  <span className="text-sm font-medium">École de musique</span>
                </label>
                {ecoleChecked && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-surface-raised">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">École</label>
                      {!ecoleAddingNew ? (
                        <>
                          <select
                            value={ecoleSchoolId ?? ''}
                            onChange={(e) => {
                              if (e.target.value === '__new__') { setEcoleAddingNew(true); return }
                              setEcoleSchoolId(e.target.value || null)
                            }}
                            className={inputCls}
                          >
                            <option value="">-- Choisir une école --</option>
                            {ecoleSchoolsList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            <option value="__new__">+ Nouvelle école…</option>
                          </select>
                          {ecoleSchoolId && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {ecoleSchoolsList.map((s) => {
                                const names = ecoleSchoolsList.map((x) => x.name)
                                return (
                                  <button key={s.id} type="button"
                                    onClick={() => setEcoleSchoolId(s.id)}
                                    style={{ backgroundColor: getSchoolColor(s.name, names) + '25', borderColor: getSchoolColor(s.name, names) + '60', color: getSchoolColor(s.name, names) }}
                                    className={`px-2 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${ecoleSchoolId === s.id ? 'opacity-100' : 'opacity-50'}`}
                                  >{s.name}</button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <input value={ecoleNewName} onChange={(e) => setEcoleNewName(e.target.value)}
                            placeholder="Nom de la nouvelle école…" autoFocus
                            className={inputCls + ' flex-1'} />
                          <button type="button" onClick={() => { setEcoleAddingNew(false); setEcoleNewName('') }}
                            className="px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors">Annuler</button>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <label className="block text-xs text-muted-foreground mb-1.5">Taux horaire net (optionnel)</label>
                      <input type="number" min="0" step="0.01" value={ecoleRate} onChange={(e) => setEcoleRate(e.target.value)}
                        placeholder="0,00" className={inputCls + ' pr-10'} />
                      <span className="absolute right-3 bottom-2.5 text-xs text-muted">€/h</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ─ Case Cours particulier (CESU) ─────────────────────────── */}
              <div className="rounded-xl border border-border-subtle overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-overlay transition-colors">
                  <input
                    type="checkbox" checked={cesuChecked}
                    onChange={(e) => {
                      setCesuChecked(e.target.checked)
                      if (!e.target.checked) { setCesuSchoolId(null); setCesuAddingNew(false); setCesuNewName('') }
                    }}
                    className="w-4 h-4 accent-guitar-600"
                  />
                  <span className="text-sm font-medium">Cours particulier (CESU)</span>
                </label>
                {cesuChecked && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-surface-raised">

                    {/* Si payer_student_id hérité → lecture seule ; sinon sélecteur employeur */}
                    {cesuPayerStudentId ? (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <span className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                          Payé actuellement par : <strong>{payerStudentName}</strong>
                          <br />Modification non disponible depuis ce formulaire.
                        </span>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1.5">Employeur CESU</label>
                        {!cesuAddingNew ? (
                          <select
                            value={cesuSchoolId ?? ''}
                            onChange={(e) => {
                              if (e.target.value === '__new__') { setCesuAddingNew(true); return }
                              setCesuSchoolId(e.target.value || null)
                            }}
                            className={inputCls}
                          >
                            <option value="">-- Choisir un employeur --</option>
                            {cesuSchoolsList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            <option value="__new__">+ Nouvel employeur…</option>
                          </select>
                        ) : (
                          <div className="flex gap-2">
                            <input value={cesuNewName} onChange={(e) => setCesuNewName(e.target.value)}
                              placeholder="Nom de l'employeur…" autoFocus
                              className={inputCls + ' flex-1'} />
                            <button type="button" onClick={() => { setCesuAddingNew(false); setCesuNewName('') }}
                              className="px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors">Annuler</button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative">
                      <label className="block text-xs text-muted-foreground mb-1.5">Taux horaire net (optionnel)</label>
                      <input type="number" min="0" step="0.01" value={cesuRate} onChange={(e) => setCesuRate(e.target.value)}
                        placeholder="0,00" className={inputCls + ' pr-10'} />
                      <span className="absolute right-3 bottom-2.5 text-xs text-muted">€/h</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Niveau, instrument, progression */}
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Niveau</label>
                <select value={form.level} onChange={update('level')} className={inputCls}>
                  <option value="">--</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Instrument</label>
                <input value={form.instrument} onChange={update('instrument')} placeholder="Guitare folk, électrique…" className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-muted-foreground mb-1.5">Progression ({form.progress}%)</label>
              <input type="range" min={0} max={100} value={form.progress} onChange={update('progress')} className="w-full accent-guitar-600" />
            </div>
          </div>

          {/* ── Remarques ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Remarques</p>
            <textarea value={form.notes} onChange={update('notes')} rows={3} placeholder="Notes privées sur l'élève…" className={inputCls + ' resize-none'} />
          </div>

          {error && <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors">Annuler</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Enregistrer' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
