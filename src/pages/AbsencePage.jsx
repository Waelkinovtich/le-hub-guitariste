import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Guitar, Loader2, AlertCircle, CheckCircle2, Clock, X, ChevronDown, ChevronUp } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

// ─── Texte réglementaire imposé (verbatim, ne pas modifier) ──────────────────
const TEXTE_REGLEMENT = `Pendant la période scolaire, si votre professeur est absent, un rattrapage est systématiquement proposé, en priorité pendant les vacances scolaires, ponctuellement en période scolaire si possible.

En revanche, une absence de votre part n'est pas rattrapée.

Si vous prévenez au moins 48h à l'avance, l'absence est considérée comme excusée. En dessous de 48h, elle peut être enregistrée comme non excusée.

En cas d'absences régulières, le professeur se réserve le droit de déplacer votre créneau vers un autre horaire, afin de laisser la priorité aux élèves plus assidus.`

// ─── Utilitaires d'affichage ─────────────────────────────────────────────────

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// "14:30:00" → "14h30"
function formatTime(timeStr) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

// Retourne un libellé d'erreur lisible depuis le code d'exception PostgreSQL
function libErreur(code) {
  const map = {
    cours_passe:         'Ce cours est déjà passé.',
    cours_introuvable:   'Cours introuvable ou non éligible.',
    deja_declare:        'Une absence est déjà enregistrée pour ce cours.',
    deja_annulee:        'Cette déclaration a déjà été annulée.',
    declaration_introuvable: 'Déclaration introuvable.',
    token_invalide:      'Lien invalide.',
  }
  return map[code] ?? 'Une erreur est survenue. Veuillez réessayer.'
}

// ─── Composants visuels ───────────────────────────────────────────────────────

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

      {/* Texte réglementaire repliable */}
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

// Carte d'un cours à venir — permet de déclarer l'absence
function CourseCard({ lesson, onDeclare, declared, declaring }) {
  const date = formatDate(lesson.lesson_date)
  const time = formatTime(lesson.lesson_time)
  const school = lesson.school_name ?? ''

  return (
    <div className={`rounded-xl border p-4 flex items-start justify-between gap-4 transition-all ${
      declared ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border-subtle bg-surface-raised'
    }`}>
      <div>
        <p className="font-medium text-foreground capitalize">{date}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{time} · {lesson.duration_minutes} min{school ? ` · ${school}` : ''}</p>
        {declared && (
          <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Absence enregistrée
          </p>
        )}
      </div>
      {!declared && (
        <button
          type="button"
          disabled={declaring}
          onClick={() => onDeclare(lesson.id)}
          className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-guitar-600/10 border border-guitar-600/30 text-guitar-400 hover:bg-guitar-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {declaring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Signaler mon absence
        </button>
      )}
    </div>
  )
}

// Badge d'une déclaration passée ou future dans l'historique
function DeclarationRow({ decl, onCancel, cancelling }) {
  const date     = formatDate(decl.lesson_date)
  const time     = formatTime(decl.lesson_time)
  const school   = decl.lesson_school ?? ''
  const passe    = new Date(decl.lesson_date + 'T' + (decl.lesson_time ?? '00:00:00')) <= new Date()
  const annulee  = !!decl.cancelled_at

  return (
    <div className={`flex items-start justify-between gap-4 py-3 border-b border-border-subtle last:border-0 ${
      annulee || passe ? 'opacity-50' : ''
    }`}>
      <div>
        <p className="text-sm font-medium text-foreground capitalize">{date} — {time}{school ? ` · ${school}` : ''}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {annulee ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-overlay text-muted-foreground border border-border-subtle">
              <X className="w-2.5 h-2.5" /> Annulée
            </span>
          ) : decl.excused ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-2.5 h-2.5" /> Excusée
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <AlertCircle className="w-2.5 h-2.5" /> Non excusée
            </span>
          )}
          {passe && !annulee && (
            <span className="text-[10px] text-muted-foreground">· Cours passé</span>
          )}
        </div>
      </div>

      {/* Annulation possible uniquement si le cours est encore futur et non annulé */}
      {!passe && !annulee && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => onCancel(decl.id)}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Annuler
        </button>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AbsencePage() {
  const { token } = useParams()

  // ── État de la recherche par nom ─────────────────────────────────────────
  const [nameInput,  setNameInput]  = useState('')
  const [searching,  setSearching]  = useState(false)
  const [searchErr,  setSearchErr]  = useState(null)
  const [studentData, setStudentData] = useState(null)
  // { student: {...}, upcoming_lessons: [...], declarations: [...] }

  // ── État des déclarations/annulations ────────────────────────────────────
  // Set d'IDs de cours pour lesquels une absence vient d'être déclarée
  const [declaredIds,   setDeclaredIds]   = useState(new Set())
  // ID en cours de déclaration (pour le spinner du bouton)
  const [declaringId,   setDeclaringId]   = useState(null)
  // ID en cours d'annulation
  const [cancellingId,  setCancellingId]  = useState(null)
  // Résultat de la dernière déclaration : { excused: bool }
  const [lastResult,    setLastResult]    = useState(null)
  // Message d'erreur sur une action
  const [actionErr,     setActionErr]     = useState(null)
  // Déclarations enrichies (mise à jour locale après chaque action)
  const [declarations,  setDeclarations]  = useState(null)

  // ── Recherche de l'élève par nom ─────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault()
    const name = nameInput.trim()
    if (!name) return
    setSearching(true)
    setSearchErr(null)
    setStudentData(null)
    setDeclaredIds(new Set())
    setLastResult(null)
    setDeclarations(null)
    try {
      const { data, error } = await supabase.rpc('find_student_for_absence', {
        p_token:     token,
        p_full_name: name,
      })
      if (error) throw error
      if (!data) {
        // Aucune correspondance — message neutre, jamais d'indice sur les autres élèves
        setSearchErr('Aucun élève trouvé avec ce nom. Vérifiez l\'orthographe (prénom et nom) ou contactez directement votre professeur.')
      } else {
        setStudentData(data)
        setDeclarations(data.declarations ?? [])
      }
    } catch {
      setSearchErr('Une erreur est survenue. Vérifiez votre connexion et réessayez.')
    } finally {
      setSearching(false)
    }
  }

  // ── Déclaration d'absence ─────────────────────────────────────────────────
  async function handleDeclare(lessonId) {
    if (!studentData) return
    setDeclaringId(lessonId)
    setActionErr(null)
    setLastResult(null)
    try {
      const { data, error } = await supabase.rpc('declare_absence', {
        p_token:      token,
        p_student_id: studentData.student.id,
        p_lesson_id:  lessonId,
      })
      if (error) throw error
      // Mise à jour optimiste : marquer le cours comme déclaré
      setDeclaredIds((prev) => new Set([...prev, lessonId]))
      setLastResult({ excused: data.excused })
      // Rechargement des déclarations (appel find_student_for_absence pour avoir l'id)
      const { data: refreshed } = await supabase.rpc('find_student_for_absence', {
        p_token:     token,
        p_full_name: nameInput.trim(),
      })
      if (refreshed) setDeclarations(refreshed.declarations ?? [])
    } catch (err) {
      const code = err?.message?.match(/([a-z_]+)$/)?.[1]
      setActionErr(libErreur(code ?? ''))
    } finally {
      setDeclaringId(null)
    }
  }

  // ── Annulation d'une déclaration ──────────────────────────────────────────
  async function handleCancel(declarationId) {
    setCancellingId(declarationId)
    setActionErr(null)
    try {
      const { error } = await supabase.rpc('cancel_absence_declaration', {
        p_token:          token,
        p_declaration_id: declarationId,
      })
      if (error) throw error
      // Mise à jour optimiste locale : marquer cancelled_at = now()
      setDeclarations((prev) => (prev ?? []).map((d) =>
        d.id === declarationId ? { ...d, cancelled_at: new Date().toISOString() } : d
      ))
      // Retirer aussi l'ID du set declaredIds si applicable
      setDeclaredIds((prev) => { const s = new Set(prev); s.delete(declarationId); return s })
    } catch (err) {
      const code = err?.message?.match(/([a-z_]+)$/)?.[1]
      setActionErr(libErreur(code ?? ''))
    } finally {
      setCancellingId(null)
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const upcomingLessons = studentData?.upcoming_lessons ?? []
  const historique = declarations ?? []
  const historiquePasse = historique.filter((d) =>
    new Date(d.lesson_date + 'T' + (d.lesson_time ?? '00:00:00')) <= new Date()
  )
  const historiqueFutur = historique.filter((d) =>
    new Date(d.lesson_date + 'T' + (d.lesson_time ?? '00:00:00')) > new Date()
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto px-4 py-8">
        <PageHeader />

        {/* ── Formulaire de recherche par nom ─────────────────────────────── */}
        <form onSubmit={handleSearch} className="mb-8">
          <label htmlFor="student-name" className="block text-sm font-medium mb-2">
            Votre nom et prénom
          </label>
          <div className="flex gap-2">
            <input
              id="student-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Ex : Marie Dupont"
              autoComplete="name"
              className="flex-1 px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-raised text-sm focus:outline-none focus:border-guitar-600 transition-colors"
            />
            <button
              type="submit"
              disabled={searching || !nameInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-600/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Rechercher
            </button>
          </div>

          {/* Erreur de recherche (pas de correspondance ou erreur réseau) */}
          {searchErr && (
            <div className="mt-3 flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{searchErr}</p>
            </div>
          )}
        </form>

        {/* ── Résultats : trouvé ───────────────────────────────────────────── */}
        {studentData && (
          <>
            <div className="mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm">
                Connecté en tant que <strong>{studentData.student.first_name} {studentData.student.last_name}</strong>
                {studentData.student.school_name ? ` · ${studentData.student.school_name}` : ''}
              </p>
            </div>

            {/* Notification du résultat de la dernière déclaration */}
            {lastResult && (
              <div className={`mb-4 flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 border ${
                lastResult.excused
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-orange-500/10 border-orange-500/20 text-orange-400'
              }`}>
                {lastResult.excused
                  ? <><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><p>Absence enregistrée et considérée comme <strong>excusée</strong> (préavis ≥ 48 h).</p></>
                  : <><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><p>Absence enregistrée. Délai inférieur à 48 h — elle peut être marquée comme <strong>non excusée</strong>.</p></>
                }
              </div>
            )}

            {/* Erreur d'action */}
            {actionErr && (
              <div className="mb-4 flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{actionErr}</p>
              </div>
            )}

            {/* Cours à venir */}
            <section className="mb-8">
              <h2 className="text-base font-semibold mb-3">Mes prochains cours</h2>
              {upcomingLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun cours à venir dans la période affichée.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingLessons.map((lesson) => (
                    <CourseCard
                      key={lesson.id}
                      lesson={lesson}
                      declared={declaredIds.has(lesson.id) || historiqueFutur.some((d) => d.lesson_date === lesson.lesson_date && !d.cancelled_at)}
                      declaring={declaringId === lesson.id}
                      onDeclare={handleDeclare}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Historique des déclarations */}
            {historique.length > 0 && (
              <section>
                <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Historique de mes absences
                </h2>

                {/* Déclarations futures (annulables) */}
                {historiqueFutur.length > 0 && (
                  <div className="mb-4 rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle px-4">
                    {historiqueFutur.map((decl) => (
                      <DeclarationRow
                        key={decl.id}
                        decl={decl}
                        onCancel={handleCancel}
                        cancelling={cancellingId === decl.id}
                      />
                    ))}
                  </div>
                )}

                {/* Déclarations passées (lecture seule) */}
                {historiquePasse.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">Absences passées (lecture seule)</p>
                    <div className="rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle px-4 opacity-70">
                      {historiquePasse.map((decl) => (
                        <DeclarationRow key={decl.id} decl={decl} onCancel={() => {}} cancelling={false} />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
