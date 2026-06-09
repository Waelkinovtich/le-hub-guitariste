import { useCallback, useMemo, useState } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AddStudentModal from '../../components/AddStudentModal'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchTeacherStudents, fetchSchoolNames } from '../../services/students'
import { fetchUpcomingLessons, buildNextLessonByStudent, formatNextLessonLabel } from '../../services/lessons'
import { initials } from '../../utils/format'
import { getSchoolColor } from '../../utils/schoolColors'

const LEVELS = ['Debutant', 'Intermediaire', 'Avance']
const AGE_GROUPS = [
  { value: 'enfant', label: 'Enfant (6-11 ans)', min: 6, max: 11 },
  { value: 'ado', label: 'Ado (12-17 ans)', min: 12, max: 17 },
  { value: 'adulte', label: 'Adulte (18+)', min: 18, max: 99 },
]

export default function StudentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showAddForm, setShowAddForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterAge, setFilterAge] = useState('')

  const load = useCallback(async () => {
    const [students, upcoming, schools] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchUpcomingLessons({ teacherId: user.id, limit: 100 }),
      fetchSchoolNames(user.id),
    ])
    return { students, nextByStudent: buildNextLessonByStudent(upcoming), schools }
  }, [user.id])

  const { data, loading, error, reload } = useFetch(load, [user.id])
  const schools = data?.schools ?? []

  const rows = useMemo(() => {
    if (!data) return []
    return data.students.map((student) => ({
      ...student,
      nextLesson: formatNextLessonLabel(data.nextByStudent.get(student.id)),
    }))
  }, [data])

  const filtered = useMemo(() => {
    return rows.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.email ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (filterLevel && s.level !== filterLevel) return false
      if (filterType && s.lessonType !== filterType) return false
      if (filterSchool && s.schoolName !== filterSchool) return false
      if (filterAge) {
        const group = AGE_GROUPS.find((g) => g.value === filterAge)
        if (group) {
          if (!s.age) return false
          if (s.age < group.min || s.age > group.max) return false
        }
      }
      return true
    })
  }, [rows, search, filterLevel, filterType, filterSchool, filterAge])

  const hasFilters = search || filterLevel || filterType || filterSchool || filterAge
  const clearFilters = () => { setSearch(''); setFilterLevel(''); setFilterType(''); setFilterSchool(''); setFilterAge('') }

  if (loading) return <LoadingBlock label="Chargement des eleves" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Eleves</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} / {rows.length} eleve{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Ajouter un eleve
        </button>
      </header>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom ou email..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
        </div>
        <select value={filterAge} onChange={(e) => setFilterAge(e.target.value)} className="px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
          <option value="">Tous ages</option>
          {AGE_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
          <option value="">Tous niveaux</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
          <option value="">Tous types</option>
          <option value="particulier">CESU</option>
          <option value="ecole">Ecole</option>
        </select>
        {schools.length > 0 && (
          <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)} className="px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
            <option value="">Toutes ecoles</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-guitar-600/40 text-guitar-400 text-sm hover:bg-guitar-600/10 transition-colors">
            <X className="w-4 h-4" />
            Effacer
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyBlock message={hasFilters ? "Aucun eleve ne correspond aux filtres." : "Aucun eleve. Cliquez sur Ajouter un eleve pour commencer."} />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-muted-foreground">
                <th className="px-6 py-4 font-medium">Eleve</th>
                <th className="px-6 py-4 font-medium hidden md:table-cell">Type</th>
                <th className="px-6 py-4 font-medium hidden lg:table-cell">Niveau</th>
                <th className="px-6 py-4 font-medium hidden lg:table-cell">Instrument</th>
                <th className="px-6 py-4 font-medium hidden sm:table-cell">Prochain cours</th>
                <th className="px-6 py-4 font-medium">Progression</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => {
                const color = student.lessonType === 'ecole' ? getSchoolColor(student.schoolName, schools) : '#dc2626'
                const label = student.lessonType === 'ecole' ? (student.schoolName || 'Ecole') : 'CESU'
                return (
                  <tr key={student.id} onClick={() => navigate('/professeur/eleves/' + student.id)} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 transition-colors cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ backgroundColor: color }}>
                          {initials(student.firstName, student.lastName)}
                        </div>
                        <div>
                          <span className="font-medium">{student.name}</span>
                          {student.age && <p className="text-xs text-muted-foreground">{student.age} ans</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: color + '25', borderColor: color + '60', color }}>
                        {label}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-muted-foreground">{student.level ?? '--'}</td>
                    <td className="px-6 py-4 hidden lg:table-cell text-muted-foreground">{student.instrument ?? '--'}</td>
                    <td className="px-6 py-4 hidden sm:table-cell text-muted-foreground">{student.nextLesson}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-24 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: student.progress + '%', backgroundColor: color }} />
                        </div>
                        <span className="text-xs text-muted w-8">{student.progress}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <AddStudentModal teacherId={user.id} onClose={() => setShowAddForm(false)} onCreated={() => reload()} />
      )}
    </div>
  )
}
