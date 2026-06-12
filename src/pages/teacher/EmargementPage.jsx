import { useCallback, useState } from 'react'
import { FileDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchLessonsInRange } from '../../services/lessons'
import { supabase } from '../../lib/supabase'
import { fetchSchoolNames } from '../../services/students'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { exportÉmargementPDF } from '../../utils/exportPDF'

const PERIODS = [
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois' },
  { value: 'trimestre', label: 'Ce trimestre' },
  { value: 'année', label: 'Cette année' },
]

function getRange(period) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

  if (period === 'semaine') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const start = new Date(now); start.setDate(now.getDate() - day)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return { from: fmt(start), to: fmt(end), label: 'Semaine du ' + start.toLocaleDateString('fr-FR') }
  }
  if (period === 'mois') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: fmt(start), to: fmt(end), label: new Date(now.getFullYear(), now.getMonth()).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
  }
  if (period === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3)
    const start = new Date(now.getFullYear(), q * 3, 1)
    const end = new Date(now.getFullYear(), q * 3 + 3, 0)
    return { from: fmt(start), to: fmt(end), label: 'T' + (q + 1) + ' ' + now.getFullYear() }
  }
  const start = new Date(now.getFullYear(), 0, 1)
  const end = new Date(now.getFullYear(), 11, 31)
  return { from: fmt(start), to: fmt(end), label: String(now.getFullYear()) }
}

function fmtDuree(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return m + ' min'
  if (m === 0) return h + 'h'
  return h + 'h' + m
}

export default function ÉmargementPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState('mois')
  const [filterSchool, setFilterSchool] = useState('')
  const [statusOverrides, setStatusOverrides] = useState({})

  const range = getRange(period)

  const load = useCallback(async () => {
    const [lessons, schools] = await Promise.all([
      fetchLessonsInRange({ teacherId: user.id, from: range.from, to: range.to }),
      fetchSchoolNames(user.id),
    ])
    return { lessons, schools }
  }, [user.id, range.from, range.to])

  const { data, loading, error } = useFetch(load, [user.id, period])

  const allItems = (data?.lessons ?? []).filter((l) => !filterSchool || l.schoolName === filterSchool || l.student?.school_name === filterSchool || (filterSchool === 'particulier' && !l.student?.school_name && !l.isGroup))
  const lessons = allItems.filter((l) => !l.isGroup)
  const groupSessions = allItems.filter((l) => l.isGroup)
  const schools = data?.schools ?? []

  const handleExport = () => {
    exportÉmargementPDF({
      lessons,
      school: filterSchool || 'Tous',
      period: range.label,
      teacherName: user.name,
    })
  }

  const presents = lessons.filter((l) => l.status === 'present').length
  const absents = lessons.filter((l) => l.status === 'absent').length
  const excuses = lessons.filter((l) => l.status === 'excuse').length
  const annulés = lessons.filter((l) => l.status === 'annulé_prof').length
  const taux = lessons.length > 0 ? Math.round((presents / lessons.length) * 100) : 0

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Émargement</h1>
          <p className="text-muted-foreground mt-1">Feuilles de présence et exports PDF</p>
        </div>
        <button type="button" onClick={handleExport} disabled={lessons.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          <FileDown className="w-4 h-4" />
          Exporter en PDF
        </button>
      </header>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" onClick={() => setPeriod(p.value)}
              className={'px-3 py-2 rounded-xl border text-sm font-medium transition-colors ' + (period === p.value ? 'guitar-gradient text-white border-transparent' : 'border-border-subtle hover:bg-surface-overlay')}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)} className="px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600">
          <option value="">Toutes écoles</option>
          <option value="particulier">Cours particuliers</option>
          {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <LoadingBlock label="Chargement..." /> : error ? <ErrorBlock message={error} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total', value: lessons.length, color: '#7f8c8d' },
              { label: 'Présents', value: presents, color: '#27ae60' },
              { label: 'Absents', value: absents, color: '#e74c3c' },
              { label: 'Excusés', value: excuses, color: '#e67e22' },
              { label: 'Taux', value: taux + '%', color: '#3498db' },
            ].map((stat) => (
              <div key={stat.label} className="glass-panel rounded-xl p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {lessons.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-muted-foreground">Aucun cours sur cette période.</div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Heure</th>
                    <th className="px-4 py-3 font-medium">Élève</th>
                    <th className="px-4 py-3 font-medium">Thème</th>
                    <th className="px-4 py-3 font-medium">Durée</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((lesson) => {
                    const colors = { present: '#27ae60', absent: '#e74c3c', excuse: '#e67e22', annulé_prof: '#9b59b6', planifié: '#7f8c8d' }
                    const labels = { present: 'Présent', absent: 'Absent', excuse: 'Excusé', annulé_prof: 'Annulé', planifié: 'Planifié' }
                    const color = colors[lesson.status] ?? '#7f8c8d'
                    return (
                      <tr key={lesson.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3">{lesson.dateLabel}</td>
                        <td className="px-4 py-3">{lesson.timeLabel}</td>
                        <td className="px-4 py-3 font-medium">{lesson.studentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lesson.topic}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDuree(lesson.durationMinutes)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: color + '20', borderColor: color + '50', color }}>
                            {labels[lesson.status] ?? lesson.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {groupSessions.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">🎶 Seances de groupe</h2>
              <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Heure</th>
                      <th className="px-4 py-3 font-medium">Groupe</th>
                      <th className="px-4 py-3 font-medium">Duree</th>
                      <th className="px-4 py-3 fonmedium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupSessions.map((g) => {
                      const gColors = { prevue: '#7f8c8d', effectuee: '#27ae60', annulee: '#9b59b6' }
                      const gLabels = { prevue: 'Prevue', effectuee: 'Effectuee', annulee: 'Annulee' }
                      const gStatus = statusOverrides[g.sessionId] || g.sessionStatus || 'prevue'
                      const color = gColors[gStatus] ?? '#7f8c8d'
                      return (
                        <tr key={g.id} className="border-b border-border-subtle last:border-0">
                          <td className="px-4 py-3">{g.dateLabel}</td>
                          <td className="px-4 py-3">{g.timeLabel}</td>
                          <td className="px-4 py-3 font-medium">{g.topic}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDuree(g.durationMinutes)}</td>
                          <td className="px-4 py-3">
                            <select value={gStatus} onChange={async (e) => { const v = e.target.value; setStatusOverrides((prev) => ({ ...prev, [g.sessionId]: v })); await supabase.from('group_sessions').update({ status: v }).eq('id', g.sessionId) }}
                              className="px-2 py-1 rounded-lg text-xs font-medium border bg-surface-raised outline-none" style={{ borderColor: color + '50', color }}>
                              <option value="prevue">Prevue</option>
                              <option value="effectuee">Effectuee</option>
                              <option value="annulee">Annulee</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
