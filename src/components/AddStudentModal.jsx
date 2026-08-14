import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createStudent, updateStudent, syncStudentContexts } from '../services/students'
import { fetchTeacherSchools, findOrCreateSchool } from '../services/schools'
import { getSchoolColor } from '../utils/schoolColors'

const LEVELS = ['Debutant', 'Intermediaire', 'Avance']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - i)

const PAY_MODES = [
  { value: 'employeur',   label: 'Payé par un employeur enregistré' },
  { value: 'autre_eleve', label: 'Payé par un autre élève de ma liste' },
  { value: 'direct',      label: 'Paiement direct par cette personne' },
]

export default function AddStudentModal({ teacherId, student, contexts = [], allStudents = [], onClose, onCreated }) {
  const isEdit = Boolean(student)

  // ── Pré-remplissage depuis les contextes existants (mode édition) ─────────
  const existingEcole = contexts.find((c) => c.context_type === 'ecole')
  const existingCesu  = contexts.find((c) => c.context_type === 'cesu')
  const hasContexts   = contexts.length > 0

  const initCesuPayMode = () => {
    if (!existingCesu) return 'direct'
    if (existingCesu.payer_student_id) return 'autre_eleve'
    if (existingCesu.school_id) return 'employeur'
    return 'direct'
  }

  // Pré-cochage :
  //   Contextes existants → source de vérité.
  //   Aucun contexte → on se rabat sur le champ legacy lesson_type.
  //   Création (pas d'élève) → CESU coché par défaut.
  const initEcoleChecked = existingEcole != null || (!hasContexts && student?.lessonType === 'ecole')
  const initCesuChecked  = existingCesu  != null || (!hasContexts && (student?.lessonType === 'particulier' || !student))

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

  // ── État des contextes (cases à cocher indépendantes) ────────────────────
  const [ecoleChecked, setEcoleChecked]   = useState(initEcoleChecked)
  const [ecoleSchoolId, setEcoleSchoolId] = useState(existingEcole?.school_id ?? student?.schoolId ?? null)
  const [ecoleRate, setEcoleRate]         = useState(existingEcole?.hourly_rate?.toString() ?? '')
  const [addingNew, setAddingNew]         = useState(false)
  const [newSchoolName, setNewSchoolName] = useState('')

  const [cesuChecked, setCesuChecked]               = useState(initCesuChecked)
  const [cesuPayMode, setCesuPayMode]               = useState(initCesuPayMode())
  const [cesuSchoolId, setCesuSchoolId]             = useState(existingCesu?.school_id ?? null)
  const [cesuPayerStudentId, setCesuPayerStudentId] = useState(existingCesu?.payer_student_id ?? null)
  const [cesuRate, setCesuRate]                     = useState(existingCesu?.hourly_rate?.toString() ?? '')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [knownSchools, setKnownSchools] = useState([])

  useEffect(() => {
    fetchTeacherSchools(teacherId).then(setKnownSchools).catch(() => {})
  }, [teacherId])

  const ecoleSchoolsList = knownSchools.filter((s) => s.structure_type !== 'particulier_cesu')
  const cesuSchoolsList  = knownSchools.filter((s) => s.structure_type === 'particulier_cesu')
  const otherStudents    = allStudents.filter((s) => s.id !== student?.id)

  const update = (field) => (e) => {
    const value = field === 'progress' ? Number(e.target.value) : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Le prénom et le nom sont obligatoires.'); return
    }
    if (!ecoleChecked && !cesuChecked) {
      setError('Sélectionnez au moins un type de cours (École ou CESU).'); return
    }
    if (ecoleChecked && !ecoleSchoolId && !newSchoolName.trim()) {
      setError("Précisez l'école de musique ou saisissez-en une nouvelle."); return
    }
    if (cesuChecked && cesuPayMode === 'employeur' && !cesuSchoolId) {
      setError("Sélectionnez l'employeur CESU."); return
    }
    if (cesuChecked && cesuPayMode === 'autre_eleve' && !cesuPayerStudentId) {
      setError("Sélectionnez l'élève qui règle les cours."); return
    }

    setSubmitting(true)
    try {
      // Résolution de l'école (création à la volée si besoin)
      let resolvedEcoleSchoolId   = ecoleSchoolId
      let resolvedEcoleSchoolName = ecoleSchoolsList.find((s) => s.id === ecoleSchoolId)?.name ?? null
      if (ecoleChecked && addingNew && newSchoolName.trim()) {
        const school = await findOrCreateSchool(teacherId, newSchoolName.trim())
        resolvedEcoleSchoolId   = school.id
        resolvedEcoleSchoolName = school.name
      }

      // lesson_type sur la table students :
      // École seule → 'ecole'. Si les deux sont cochés, 'ecole' est le type primaire (couleur, filtres).
      // CESU seul → 'particulier'.
      const lessonType = ecoleChecked ? 'ecole' : 'particulier'
      const schoolId   = ecoleChecked ? (resolvedEcoleSchoolId ?? null) : null
      const schoolName = ecoleChecked ? (resolvedEcoleSchoolName ?? null) : null

      const result = isEdit
        ? await updateStudent(student.id, { ...form, lessonType, schoolId, schoolName })
        : await createStudent(teacherId,   { ...form, lessonType, schoolId, schoolName })

      const ecoleConfig = ecoleChecked
        ? { schoolId: resolvedEcoleSchoolId, schoolName: resolvedEcoleSchoolName, hourlyRate: ecoleRate }
        : null

      const cesuConfig = cesuChecked ? {
        payMode:        cesuPayMode,
        schoolId:       cesuPayMode === 'employeur'   ? cesuSchoolId       : null,
        schoolName:     cesuPayMode === 'employeur'   ? (cesuSchoolsList.find((s) => s.id === cesuSchoolId)?.name ?? null) : null,
        payerStudentId: cesuPayMode === 'autre_eleve' ? cesuPayerStudentId : null,
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

          {/* ── Cours — section unifiée École + CESU ────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Cours</p>
            <div className="space-y-3">

              {/* Case École de musique */}
              <div className="rounded-xl border border-border-subtle overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-overlay transition-colors">
                  <input
                    type="checkbox" checked={ecoleChecked}
                    onChange={(e) => { setEcoleChecked(e.target.checked); if (!e.target.checked) { setAddingNew(false); setNewSchoolName('') } }}
                    className="w-4 h-4 accent-guitar-600"
                  />
                  <span className="text-sm font-medium">École de musique</span>
                </label>
                {ecoleChecked && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-surface-raised">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">École</label>
                      {!addingNew ? (
                        <>
                          <select
                            value={ecoleSchoolId ?? ''}
                            onChange={(e) => {
                              if (e.target.value === '__new__') { setAddingNew(true); return }
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
                          <input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)}
                            placeholder="Nom de la nouvelle école…" autoFocus
                            className={inputCls + ' flex-1'} />
                          <button type="button" onClick={() => { setAddingNew(false); setNewSchoolName('') }}
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

              {/* Case Cours particulier (CESU) */}
              <div className="rounded-xl border border-border-subtle overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-overlay transition-colors">
                  <input
                    type="checkbox" checked={cesuChecked}
                    onChange={(e) => { setCesuChecked(e.target.checked); if (!e.target.checked) { setCesuPayMode('direct'); setCesuSchoolId(null); setCesuPayerStudentId(null) } }}
                    className="w-4 h-4 accent-guitar-600"
                  />
                  <span className="text-sm font-medium">Cours particulier (CESU)</span>
                </label>
                {cesuChecked && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-surface-raised">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Mode de paiement</label>
                      <div className="space-y-1.5">
                        {PAY_MODES.map((opt) => (
                          <button key={opt.value} type="button"
                            onClick={() => { setCesuPayMode(opt.value); setCesuSchoolId(null); setCesuPayerStudentId(null) }}
                            className={`w-full text-left py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                              cesuPayMode === opt.value
                                ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                                : 'border-border-subtle text-muted-foreground hover:border-border'
                            }`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    {cesuPayMode === 'employeur' && (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1.5">Employeur</label>
                        <select value={cesuSchoolId ?? ''} onChange={(e) => setCesuSchoolId(e.target.value || null)} className={inputCls}>
                          <option value="">-- Choisir l'employeur --</option>
                          {cesuSchoolsList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )}
                    {cesuPayMode === 'autre_eleve' && (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1.5">Élève payeur</label>
                        <select value={cesuPayerStudentId ?? ''} onChange={(e) => setCesuPayerStudentId(e.target.value || null)} className={inputCls}>
                          <option value="">-- Choisir l'élève --</option>
                          {otherStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
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
