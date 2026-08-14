import { useState, useEffect, useMemo } from 'react'
import { School, Plus, Trash2, Loader2, AlertCircle, Users, ChevronRight, AlertTriangle, Star, TableProperties, Info, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchTeacherSchools, createSchool, deleteSchool, currentSchoolYear, computePriorityScore, isScoreIncomplete } from '../services/schools'
import { fetchContextCountsBySchool } from '../services/students'
import { getSchoolColor } from '../utils/schoolColors'

export default function SchoolsPage() {
  const navigate = useNavigate()
  const [teacherId, setTeacherId] = useState(null)
  const [schools, setSchools] = useState([])
  const [studentCounts, setStudentCounts] = useState({})
  const [missingRates, setMissingRates] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('ecole')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [filterType, setFilterType] = useState('all')

  const curYear = currentSchoolYear()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Non authentifié'); setLoading(false); return }
      setTeacherId(user.id)
      try {
        const list = await fetchTeacherSchools(user.id)
        setSchools(list)
        if (list.length > 0) {
          const ids = list.map((s) => s.id)
          // Map school_id → context_type attendu selon le type de structure.
          // Permet à fetchContextCountsBySchool de ne compter que les bons contextes
          // (ecole pour une école de musique, cesu pour un employeur CESU).
          const contextTypeBySchool = {}
          list.forEach((s) => {
            contextTypeBySchool[s.id] = s.structure_type === 'particulier_cesu' ? 'cesu' : 'ecole'
          })
          const [contextCounts, ratesRes] = await Promise.all([
            fetchContextCountsBySchool(user.id, ids, contextTypeBySchool),
            supabase.from('schools_hourly_rates').select('school_id, school_year, net_hourly_rate, gross_hourly_rate').eq('school_year', curYear).in('school_id', ids),
          ])
          setStudentCounts(contextCounts)

          const withRate = new Set((ratesRes.data ?? []).filter((r) => r.net_hourly_rate != null || r.gross_hourly_rate != null).map((r) => r.school_id))
          setMissingRates(new Set(ids.filter((id) => !withRate.has(id))))
        }
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setAddError('')
    const name = newName.trim()
    if (!name) return
    if (schools.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setAddError('Cette école existe déjà.')
      return
    }
    setAdding(true)
    try {
      const structType = newType === 'particulier_cesu' ? 'particulier_cesu' : null
      const school = await createSchool(teacherId, name, structType)
      setSchools((prev) => [...prev, school].sort((a, b) => a.name.localeCompare(b.name)))
      setStudentCounts((prev) => ({ ...prev, [school.id]: 0 }))
      setNewName('')
      setNewType('ecole')
    } catch (err) {
      setAddError(err.message)
    }
    setAdding(false)
  }

  const handleDelete = async (school) => {
    const count = studentCounts[school.id] ?? 0
    const msg = count > 0
      ? `Supprimer "${school.name}" ? ${count} élève${count > 1 ? 's' : ''} y est rattaché${count > 1 ? 's' : ''} — leur champ école ne sera pas effacé mais le lien sera supprimé.`
      : `Supprimer "${school.name}" ?`
    if (!window.confirm(msg)) return
    setDeletingId(school.id)
    try {
      await deleteSchool(school.id)
      setSchools((prev) => prev.filter((s) => s.id !== school.id))
    } catch (err) {
      alert('Erreur : ' + err.message)
    }
    setDeletingId(null)
  }

  // Filtre par type, puis tri par score descendant (nulls en dernier)
  const sortedSchools = useMemo(() => {
    const filtered = filterType === 'ecole'
      ? schools.filter((s) => s.structure_type !== 'particulier_cesu')
      : filterType === 'cesu'
        ? schools.filter((s) => s.structure_type === 'particulier_cesu')
        : schools
    return [...filtered].sort((a, b) => {
      const sa = computePriorityScore(a) ?? -Infinity
      const sb = computePriorityScore(b) ?? -Infinity
      return sb - sa
    })
  }, [schools, filterType])

  const schoolNames = schools.map((s) => s.name)

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Écoles et cours particuliers</h1>
          <p className="text-muted-foreground mt-1">Écoles de musique et familles en cours particulier (CESU)</p>
        </div>
        <button
          onClick={() => navigate('/admin/ecoles/comparatif')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors shrink-0"
        >
          <TableProperties className="w-4 h-4" />
          Comparatif
        </button>
      </header>

      {/* Ajouter une école */}
      <div className="glass-panel rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider mb-3">Ajouter une école ou un cours particulier</p>
        {/* Sélecteur de type */}
        <div className="flex gap-2 mb-3">
          {[
            { value: 'ecole',            label: 'École de musique', icon: School },
            { value: 'particulier_cesu', label: 'Cours particulier (CESU)', icon: Home },
          ].map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setNewType(t.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                newType === t.value
                  ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                  : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
              }`}
            >
              <t.icon className="w-3.5 h-3.5 shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={newType === 'particulier_cesu' ? 'ex : Famille Dupont — CESU' : 'Nom de l\'école...'}
            className="flex-1 px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-60"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Ajouter
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-sm text-guitar-400 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {addError}
          </p>
        )}
      </div>

      {/* Filtre par type */}
      {!loading && !error && schools.length > 0 && (
        <div className="flex gap-2 mb-4">
          {[
            { value: 'all',  label: 'Toutes' },
            { value: 'ecole', label: 'Écoles uniquement' },
            { value: 'cesu',  label: 'CESU uniquement' },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilterType(f.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                filterType === f.value
                  ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                  : 'border-border-subtle text-muted-foreground hover:border-border'
              }`}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : error ? (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3">{error}</p>
      ) : schools.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <School className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucune école enregistrée.</p>
          <p className="text-xs text-muted mt-1">Ajoutez votre première école ci-dessus.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          {sortedSchools.map((school, i) => {
            const color = getSchoolColor(school.name, schoolNames)
            const count = studentCounts[school.id] ?? 0
            const isDeleting = deletingId === school.id
            const noRate = missingRates.has(school.id)
            const score = computePriorityScore(school)
            const incomplete = score != null && isScoreIncomplete(school)
            return (
              <div
                key={school.id}
                className={`flex items-center justify-between px-5 py-4 hover:bg-surface-overlay/50 transition-colors ${i < sortedSchools.length - 1 ? 'border-b border-border-subtle' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/admin/ecoles/${school.id}`)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  {/* Numéro de rang */}
                  <span className="text-xs text-muted-foreground font-medium w-5 text-right shrink-0">{i + 1}.</span>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{school.name}</p>
                      {school.structure_type === 'particulier_cesu' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25 shrink-0">
                          <Home className="w-2.5 h-2.5" />
                          CESU
                        </span>
                      )}
                      {noRate && (
                        <span title={`Taux horaire ${curYear} manquant`}>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {count === 0
                          ? 'Aucun élève rattaché'
                          : `${count} élève${count !== 1 ? 's' : ''}`}
                      </p>
                      {score != null ? (
                        <p className="text-xs text-guitar-400 flex items-center gap-0.5">
                          <Star className="w-3 h-3" fill="currentColor" />
                          {score}
                          {incomplete && (
                            <span className="ml-1 text-muted-foreground" title="Score incomplet — moins de 5 notes renseignées">
                              <Info className="w-3 h-3" />
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Score incomplet</p>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => navigate(`/admin/ecoles/${school.id}`)}
                    className="p-2 rounded-lg text-muted hover:text-guitar-400 transition-colors"
                    title="Ouvrir la fiche"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(school) }}
                    disabled={isDeleting}
                    className="p-2 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors disabled:opacity-40"
                    title="Supprimer"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
