import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Guitar, Loader2, AlertCircle, CheckCircle2, Clock, X, ChevronDown, ChevronUp, ArrowLeft, Square, CheckSquare } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

// ─── Texte réglementaire imposé (verbatim, ne pas modifier) ──────────────────
const TEXTE_REGLEMENT = `Pendant la période scolaire, si votre professeur est absent, un rattrapage est systématiquement proposé, en priorité pendant les vacances scolaires, ponctuellement en période scolaire si possible.

En revanche, une absence de votre part n'est pas rattrapée.

Si vous prévenez au moins 48h à l'avance, l'absence est considérée comme excusée. En dessous de 48h, elle peut être enregistrée comme non excusée.

En cas d'absences régulières, le professeur se réserve le droit de déplacer votre créneau vers un autre horaire, afin de laisser la priorité aux élèves plus assidus.`

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

function libErreur(code) {
  const map = {
    cours_passe:             'Ce cours est déjà passé.',
    cours_introuvable:       'Cours introuvable ou non éligible.',
    deja_declare:            'Une absence est déjà enregistrée pour ce cours.',
    deja_annulee:            'Cette déclaration a déjà été annulée.',
    declaration_introuvable: 'Déclaration introuvable.',
    token_invalide:          'Lien invalide.',
  }
  return map[code] ?? 'Une erreur est survenue. Veuillez réessayer.'
}

// ─── Composant en-tête ────────────────────────────────────────────────────────
function PageHeader() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-guitar-600 flex items-center justify-center shadow-lg">
          <Guitar className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-display text-2xl leading-tight">Déclarer une absence</h1>
          <p className="text-sm text-muted-foreground">Cours de guitare</p>
        </div>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface-raised overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-surface-overlay transition-colors"
        >
          Rappel du fonctionnement des absences
          {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
        </button>
        {open && (
          <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-line border-t border-border-subtle pt-3">
            {TEXTE_REGLEMENT}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AbsencePage() {
  const { token } = useParams()

  // ── Étapes : 'search' | 'confirm' | 'select' | 'done' ───────────────────
  const [step,        setStep]        = useState('search')
  const [nameInput,   setNameInput]   = useState('')
  const [searching,   setSearching]   = useState(false)
  const [searchErr,   setSearchErr]   = useState(null)
  const [studentData, setStudentData] = useState(null)

  // Cours sélectionnés (multi-select) pour la déclaration
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [declaring,    setDeclaring]    = useState(false)
  const [actionErr,    setActionErr]    = useState(null)
  // Résultats après validation (tableau {lesson, excused, error})
  const [doneResults,  setDoneResults]  = useState(null)

  // Copie locale des déclarations (mise à jour optimiste)
  const [declarations, setDeclarations] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)

  // ── Étape 1 : Recherche par nom ──────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault()
    const name = nameInput.trim()
    if (!name) return
    setSearching(true)
    setSearchErr(null)
    setStudentData(null)
    setDeclarations(null)
    setDoneResults(null)
    setSelectedIds(new Set())
    try {
      const { data, error } = await supabase.rpc('find_student_for_absence', {
        p_token:     token,
        p_full_name: name,
      })
      if (error) throw error
      if (!data) {
        setSearchErr('Aucun élève trouvé avec ce nom. Vérifiez l\'orthographe (prénom et nom) ou contactez directement votre professeur.')
      } else {
        setStudentData(data)
        setDeclarations(data.declarations ?? [])
        setStep('confirm')
      }
    } catch {
      setSearchErr('Une erreur est survenue. Vérifiez votre connexion et réessayez.')
    } finally {
      setSearching(false)
    }
  }

  // ── Étape 2 : Confirmation d'identité ────────────────────────────────────
  function handleConfirmYes() {
    setStep('select')
  }
  function handleConfirmNo() {
    setStep('search')
    setStudentData(null)
    setNameInput('')
    setSearchErr(null)
  }

  // ── Étape 3 : Déclaration de plusieurs absences ───────────────────────────
  async function handleDeclare() {
    if (selectedIds.size === 0 || !studentData) return
    setDeclaring(true)
    setActionErr(null)

    const lessonsToDecl = upcomingLessons.filter((l) => selectedIds.has(l.id))
    const results = []

    for (const lesson of lessonsToDecl) {
      try {
        const { data, error } = await supabase.rpc('declare_absence', {
          p_token:      token,
          p_student_id: studentData.student.id,
          p_lesson_id:  lesson.id,
        })
        if (error) throw error
        results.push({ lesson, excused: data.excused, error: null })
      } catch (err) {
        const code = err?.message?.match(/([a-z_]+)$/)?.[1]
        results.push({ lesson, excused: null, error: libErreur(code ?? '') })
      }
    }

    // Refresh des déclarations pour mettre à jour les clés
    const { data: refreshed } = await supabase.rpc('find_student_for_absence', {
      p_token:     token,
      p_full_name: nameInput.trim(),
    })
    if (refreshed) setDeclarations(refreshed.declarations ?? [])

    setSelectedIds(new Set())
    setDeclaring(false)

    // N'afficher l'écran de fin que si au moins une déclaration a réussi
    const hasSuccess = results.some((r) => r.error === null)
    if (hasSuccess) {
      setDoneResults(results)
      setStep('done')
    } else {
      // Toutes échouées : rester sur la sélection et afficher l'erreur groupée
      setActionErr(results.map((r) => r.error).filter(Boolean).join(' · '))
    }
  }

  // ── Annulation d'une déclaration ─────────────────────────────────────────
  async function handleCancel(declarationId) {
    setCancellingId(declarationId)
    setActionErr(null)
    setDoneResults(null) // réinitialise les résultats précédents
    try {
      const { error } = await supabase.rpc('cancel_absence_declaration', {
        p_token:          token,
        p_declaration_id: declarationId,
      })
      if (error) throw error
      setDeclarations((prev) => (prev ?? []).map((d) =>
        d.id === declarationId ? { ...d, cancelled_at: new Date().toISOString() } : d
      ))
    } catch (err) {
      const code = err?.message?.match(/([a-z_]+)$/)?.[1]
      setActionErr(libErreur(code ?? ''))
    } finally {
      setCancellingId(null)
    }
  }

  // ── Données dérivées ──────────────────────────────────────────────────────
  const upcomingLessons = studentData?.upcoming_lessons ?? []
  const allDeclarations = declarations ?? []
  const now = new Date()
  const isFuture = (lesson) => new Date(lesson.lesson_date + 'T' + (lesson.lesson_time ?? '00:00:00')) > now
  // Normalise "09:30:00" et "09:30" en "09:30" pour comparer sans dépendre de lesson_id
  const toHHMM = (t) => (t ?? '').slice(0, 5)
  const lessonKey = (date, time) => `${date}|${toHHMM(time)}`

  // Clés date|HH:MM des déclarations actives futures (lesson_id absent en production)
  const declaredKeys = new Set(
    allDeclarations
      .filter((d) => !d.cancelled_at && isFuture(d))
      .map((d) => lessonKey(d.lesson_date, d.lesson_time))
  )

  // Trouver la déclaration active d'un cours par date+heure (pas par lesson_id)
  const activeDeclForLesson = (lesson) =>
    allDeclarations.find(
      (d) => lessonKey(d.lesson_date, d.lesson_time) === lessonKey(lesson.lesson_date, lesson.lesson_time)
        && !d.cancelled_at
        && isFuture(d)
    )

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto px-4 py-8">
        <PageHeader />

        {/* ── Étape 1 : Saisie du nom ───────────────────────────────────────── */}
        {step === 'search' && (
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="student-name" className="block text-sm font-medium mb-2">
                Votre prénom et nom
              </label>
              <input
                id="student-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex : Marie Dupont"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-raised text-sm focus:outline-none focus:border-guitar-600 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !nameInput.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-600/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
            {searchErr && (
              <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{searchErr}</p>
              </div>
            )}
          </form>
        )}

        {/* ── Étape 2 : Confirmation d'identité ────────────────────────────── */}
        {step === 'confirm' && studentData && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface-raised p-5 space-y-2">
              <p className="text-base font-semibold">
                Vous êtes bien{' '}
                <span className="text-guitar-400">
                  {studentData.student.first_name} {studentData.student.last_name}
                </span>
                &nbsp;?
              </p>
              {studentData.student.school_name && (
                <p className="text-sm text-muted-foreground">{studentData.student.school_name}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmYes}
                className="flex-1 py-2.5 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-600/90 transition-colors"
              >
                Oui, c'est moi
              </button>
              <button
                type="button"
                onClick={handleConfirmNo}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
              >
                Non, ce n'est pas moi
              </button>
            </div>
          </div>
        )}

        {/* ── Étape 3 : Sélection des cours ────────────────────────────────── */}
        {step === 'select' && studentData && (
          <div className="pb-24">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {studentData.student.first_name} {studentData.student.last_name}
              </button>
            </div>

            <div>
              <h2 className="text-base font-semibold mb-1">Mes prochains cours</h2>
              <p className="text-xs text-muted-foreground mb-3">Sélectionnez un ou plusieurs cours</p>
              {upcomingLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun cours à venir dans la période affichée.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingLessons.map((lesson) => {
                    const alreadyDeclared = declaredKeys.has(lessonKey(lesson.lesson_date, lesson.lesson_time))
                    const activeDecl = activeDeclForLesson(lesson)
                    const isSelected = selectedIds.has(lesson.id)

                    if (alreadyDeclared && activeDecl) {
                      return (
                        <div key={lesson.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-foreground capitalize">{formatDate(lesson.lesson_date)}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatTime(lesson.lesson_time)} · {lesson.duration_minutes} min{lesson.school_name ? ` · ${lesson.school_name}` : ''}
                            </p>
                            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Absence enregistrée
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={cancellingId === activeDecl.id}
                            onClick={() => handleCancel(activeDecl.id)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {cancellingId === activeDecl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            Annuler mon absence
                          </button>
                        </div>
                      )
                    }

                    // Cours non déclaré — sélectionnable (multi-select)
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setSelectedIds((prev) => {
                          const next = new Set(prev)
                          next.has(lesson.id) ? next.delete(lesson.id) : next.add(lesson.id)
                          return next
                        })}
                        className={`w-full text-left rounded-xl border p-4 transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'border-guitar-600/60 bg-guitar-600/10'
                            : 'border-border-subtle bg-surface-raised hover:border-border hover:bg-surface-overlay'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-guitar-400">
                          {isSelected
                            ? <CheckSquare className="w-4 h-4" />
                            : <Square className="w-4 h-4 text-muted-foreground" />}
                        </span>
                        <span className="flex-1">
                          <p className="font-medium text-foreground capitalize">{formatDate(lesson.lesson_date)}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {formatTime(lesson.lesson_time)} · {lesson.duration_minutes} min{lesson.school_name ? ` · ${lesson.school_name}` : ''}
                          </p>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {actionErr && (
              <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mt-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{actionErr}</p>
              </div>
            )}

            {/* Bouton fixé en bas — toujours visible sans défilement */}
            {selectedIds.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border-subtle z-20">
                <div className="max-w-lg mx-auto">
                  <button
                    type="button"
                    disabled={declaring}
                    onClick={handleDeclare}
                    className="w-full py-3 rounded-xl bg-guitar-600 text-white text-sm font-semibold hover:bg-guitar-600/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {declaring ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {declaring
                      ? 'Enregistrement…'
                      : `Confirmer mes absences (${selectedIds.size})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Étape 4 : Résultat ───────────────────────────────────────────── */}
        {step === 'done' && doneResults && doneResults.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Déclaration terminée
              </h2>
              <div className="rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle">
                {doneResults.map(({ lesson, excused, error }) => (
                  <div key={lesson.id} className="px-4 py-3 flex items-start gap-3">
                    {error ? (
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                    ) : excused ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-orange-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{formatDate(lesson.lesson_date)} — {formatTime(lesson.lesson_time)}</p>
                      {lesson.school_name && <p className="text-xs text-muted-foreground">{lesson.school_name}</p>}
                      {error ? (
                        <p className="text-xs text-red-400 mt-0.5">{error}</p>
                      ) : (
                        <p className={`text-xs mt-0.5 ${excused ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {excused ? 'Excusée (+ de 48 h à l\'avance)' : 'Non excusée (délai inférieur à 48 h)'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {actionErr && (
              <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{actionErr}</p>
              </div>
            )}

            {/* Absences futures avec option d'annulation */}
            {(declarations ?? []).filter((d) => !d.cancelled_at && isFuture(d)).length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Mes absences déclarées
                </h2>
                <div className="rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle px-4">
                  {(declarations ?? []).filter((d) => !d.cancelled_at && isFuture(d)).map((decl) => (
                    <div key={decl.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{formatDate(decl.lesson_date)} — {formatTime(decl.lesson_time)}</p>
                        {decl.lesson_school && <p className="text-xs text-muted-foreground mt-0.5">{decl.lesson_school}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={cancellingId === decl.id}
                        onClick={() => handleCancel(decl.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {cancellingId === decl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Annuler
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setStep('select'); setDoneResults(null); setActionErr(null) }}
              className="w-full py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
            >
              Déclarer une autre absence
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
