import { useState, useEffect, useCallback, useMemo } from 'react'
import { Copy, Check, RefreshCw, AlertCircle, ChevronDown, ChevronUp, X, BarChart2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { usePeriod, filterLessonsByPeriod } from '../../context/PeriodContext'
import { calculerTauxAbsence } from '../../utils/absenceStats'
import AbsenceDeclarationRow from '../../components/AbsenceDeclarationRow'

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

// ─── Composant : lien de déclaration ─────────────────────────────────────────

function AbsenceLinkCard({ token, loading, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const url = token ? `${window.location.origin}/absence/${token}` : null

  async function handleCopy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 mb-6">
      <h2 className="text-sm font-semibold mb-1">Lien de déclaration d'absence</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Partagez ce lien à vos élèves pour qu'ils puissent déclarer leurs absences.
        Le lien est permanent et réutilisable — il n'expire jamais.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : url ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-overlay border border-border-subtle text-xs font-mono truncate text-muted-foreground">
            {url}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 px-3 py-2 rounded-lg border border-border-subtle text-sm hover:bg-surface-overlay transition-colors flex items-center gap-1.5"
            title="Copier le lien"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Impossible de charger le lien.
          <button type="button" onClick={onRegenerate} className="underline ml-1">Réessayer</button>
        </div>
      )}
    </div>
  )
}


// ─── Composant : récapitulatif par élève ─────────────────────────────────────

function StudentSummaryRow({ student, declarations }) {
  const [open, setOpen] = useState(false)
  // Absences non excusées, non annulées, sur l'année scolaire en cours (sep → août)
  const now = new Date()
  const yearStart = now.getMonth() >= 8
    ? new Date(now.getFullYear(), 8, 1)      // 1er sept de l'année en cours
    : new Date(now.getFullYear() - 1, 8, 1)  // 1er sept de l'année précédente
  const nonExcusees = declarations.filter(
    (d) => !d.excused && !d.cancelled_at && new Date(d.lesson_date) >= yearStart
  )

  return (
    <>
      <tr
        className="border-b border-border-subtle cursor-pointer hover:bg-surface-overlay transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 pr-4 text-sm font-medium">{student}</td>
        <td className="py-2.5 pr-4 text-sm text-muted-foreground">{declarations.length}</td>
        <td className="py-2.5 pr-4">
          {nonExcusees.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
              {nonExcusees.length} non excusée{nonExcusees.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-2.5 text-xs text-muted-foreground">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </td>
      </tr>
      {open && declarations.map((d) => (
        <tr key={d.id} className="border-b border-border-subtle bg-surface-raised/50">
          <td className="pl-4 py-2 text-xs text-muted-foreground capitalize">{formatDate(d.lesson_date)} {formatTime(d.lesson_time)}</td>
          <td className="py-2 text-xs text-muted-foreground">{d.lesson_school ?? '—'}</td>
          <td className="py-2">
            {d.cancelled_at ? (
              <span className="text-[10px] text-muted-foreground">Annulée</span>
            ) : d.excused ? (
              <span className="text-[10px] text-emerald-400">Excusée</span>
            ) : (
              <span className="text-[10px] text-orange-400">Non excusée</span>
            )}
          </td>
          <td />
        </tr>
      ))}
    </>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AbsencesPage() {
  const { user }   = useAuth()
  const { period } = usePeriod()

  const [token,      setToken]      = useState(null)
  const [linkLoading, setLinkLoading] = useState(true)

  // ── Données d'émargement pour le calcul du taux ──────────────────────────
  // Uniquement lesson_date + status : requête très légère (~2 colonnes).
  const [allLessons,    setAllLessons]    = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)

  const [declarations, setDeclarations] = useState([])
  const [declLoading,  setDeclLoading]  = useState(true)
  const [declErr,      setDeclErr]      = useState(null)

  // Filtres
  const [filterStudent, setFilterStudent] = useState('')
  const [filterExcused, setFilterExcused] = useState('tous')
  const [activeTab, setActiveTab]         = useState('liste') // 'liste' | 'resume'

  // ── Chargement / création du lien d'absence ──────────────────────────────
  const loadOrCreateLink = useCallback(async () => {
    if (!user?.id) return
    setLinkLoading(true)
    try {
      // Tente de lire le lien existant
      const { data: existing } = await supabase
        .from('absence_link')
        .select('token')
        .eq('teacher_id', user.id)
        .maybeSingle()

      if (existing?.token) {
        setToken(existing.token)
      } else {
        // Crée si absent (ON CONFLICT ON CONSTRAINT absence_link_teacher_unique DO NOTHING)
        const { data: created } = await supabase
          .from('absence_link')
          .upsert({ teacher_id: user.id }, { onConflict: 'teacher_id' })
          .select('token')
          .single()
        setToken(created?.token ?? null)
      }
    } catch {
      setToken(null)
    } finally {
      setLinkLoading(false)
    }
  }, [user?.id])

  useEffect(() => { loadOrCreateLink() }, [loadOrCreateLink])

  // ── Chargement des cours (émargement réel) ───────────────────────────────
  // Séparé des déclarations : ce sont deux systèmes distincts.
  useEffect(() => {
    if (!user?.id) return
    setLessonsLoading(true)
    supabase
      .from('lessons')
      .select('lesson_date, status')
      .eq('teacher_id', user.id)
      .then(({ data }) => setAllLessons(data ?? []))
      .finally(() => setLessonsLoading(false))
  }, [user?.id])

  // ── Chargement des déclarations avec jointure sur students ───────────────
  useEffect(() => {
    if (!user?.id) return
    setDeclLoading(true)
    setDeclErr(null)
    supabase
      .from('absence_declarations')
      .select(`
        id, lesson_date, lesson_time, lesson_school,
        declared_at, excused, excused_manual, cancelled_at,
        student:students(id, first_name, last_name)
      `)
      .eq('teacher_id', user.id)
      .order('lesson_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setDeclErr('Impossible de charger les déclarations.'); return }
        // Aplatissement : student_name calculé une fois ici
        const rows = (data ?? []).map((d) => ({
          ...d,
          student_name: d.student
            ? `${d.student.first_name} ${d.student.last_name}`
            : '—',
        }))
        setDeclarations(rows)
      })
      .finally(() => setDeclLoading(false))
  }, [user?.id])

  // ── Filtrage des déclarations ─────────────────────────────────────────────
  const filtered = declarations.filter((d) => {
    if (filterStudent && !d.student_name.toLowerCase().includes(filterStudent.toLowerCase())) return false
    if (filterExcused === 'excusees'     && (!d.excused || d.cancelled_at)) return false
    if (filterExcused === 'non_excusees' && (d.excused  || d.cancelled_at)) return false
    if (filterExcused === 'annulees'     && !d.cancelled_at) return false
    return true
  })

  // ── Taux d'absence général filtré par la période de la sidebar ──────────
  const tauxGeneral = useMemo(() => {
    const lessonsFiltres = filterLessonsByPeriod(allLessons, period)
    return calculerTauxAbsence(lessonsFiltres)
  }, [allLessons, period])

  // ── Mise à jour locale après toggle excused ──────────────────────────────
  // Évite un rechargement complet : synchronise uniquement la ligne modifiée.
  function handleExcusedChange(id, newExcused, newManual) {
    setDeclarations((prev) =>
      prev.map((d) => d.id === id ? { ...d, excused: newExcused, excused_manual: newManual } : d)
    )
  }

  // ── Récapitulatif par élève ───────────────────────────────────────────────
  const byStudent = {}
  for (const d of declarations) {
    if (!byStudent[d.student_name]) byStudent[d.student_name] = []
    byStudent[d.student_name].push(d)
  }
  const studentNames = Object.keys(byStudent).sort()

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl mb-6">Absences élèves</h1>

      <AbsenceLinkCard token={token} loading={linkLoading} onRegenerate={loadOrCreateLink} />

      {/* ── Taux d'absence général (émargement) ─────────────────────────── */}
      {/* Données issues de lessons.status, PAS des déclarations élèves.    */}
      <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Taux d'absence — émargement réel</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {period.mode === 'toutes' ? 'Toutes les années' : 'Selon la période de la barre latérale'}
          </span>
        </div>

        {lessonsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Calcul en cours…
          </div>
        ) : tauxGeneral.nbCours === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun cours émargé sur cette période.
          </p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Taux d'absence</p>
              <p className={`text-3xl font-bold ${
                tauxGeneral.taux >= 30 ? 'text-orange-400'
                : tauxGeneral.taux >= 15 ? 'text-yellow-400'
                : 'text-emerald-400'
              }`}>
                {tauxGeneral.taux} %
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Absences</p>
              <p className="text-3xl font-bold text-foreground">{tauxGeneral.nbAbsences}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Cours émargés</p>
              <p className="text-3xl font-bold text-foreground">{tauxGeneral.nbCours}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Onglets ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 border-b border-border-subtle">
        {[
          { key: 'liste',  label: 'Toutes les déclarations' },
          { key: 'resume', label: 'Récapitulatif par élève' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-guitar-600 text-guitar-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Filtres (onglet liste seulement) ────────────────────────────── */}
      {activeTab === 'liste' && (
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            placeholder="Filtrer par nom d'élève…"
            className="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-raised text-sm focus:outline-none focus:border-guitar-600 transition-colors min-w-48"
          />
          <select
            value={filterExcused}
            onChange={(e) => setFilterExcused(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-raised text-sm focus:outline-none focus:border-guitar-600 transition-colors"
          >
            <option value="tous">Tous les statuts</option>
            <option value="excusees">Excusées uniquement</option>
            <option value="non_excusees">Non excusées uniquement</option>
            <option value="annulees">Annulées uniquement</option>
          </select>
        </div>
      )}

      {/* ── Erreur ──────────────────────────────────────────────────────── */}
      {declErr && (
        <div className="flex items-center gap-2 text-sm text-red-400 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {declErr}
        </div>
      )}

      {/* ── Chargement ──────────────────────────────────────────────────── */}
      {declLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Chargement des déclarations…
        </div>
      )}

      {/* ── Onglet : liste ──────────────────────────────────────────────── */}
      {!declLoading && activeTab === 'liste' && (
        filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucune déclaration trouvée.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-raised text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2.5 pr-4 pl-4 font-semibold">Élève</th>
                  <th className="py-2.5 pr-4 font-semibold">Cours (date · heure · lieu)</th>
                  <th className="py-2.5 pr-4 font-semibold">Déclarée le</th>
                  <th className="py-2.5 pr-4 font-semibold">Statut</th>
                  <th className="py-2.5 pr-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <AbsenceDeclarationRow
                    key={d.id}
                    decl={d}
                    onExcusedChange={handleExcusedChange}
                    showStudentName
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Onglet : récapitulatif par élève ────────────────────────────── */}
      {!declLoading && activeTab === 'resume' && (
        studentNames.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucune déclaration enregistrée.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-raised text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2.5 pl-4 pr-4 font-semibold">Élève</th>
                  <th className="py-2.5 pr-4 font-semibold">Total</th>
                  <th className="py-2.5 pr-4 font-semibold">Cette année scolaire</th>
                  <th className="py-2.5 pr-4" />
                </tr>
              </thead>
              <tbody>
                {studentNames.map((name) => (
                  <StudentSummaryRow key={name} student={name} declarations={byStudent[name]} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
