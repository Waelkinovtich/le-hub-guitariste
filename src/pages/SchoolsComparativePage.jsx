import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, ChevronUp, ChevronDown, Download, Star, AlertTriangle, EyeOff } from 'lucide-react'
import { fetchSchoolsOverview, currentSchoolYear, computePriorityScore } from '../services/schools'
import { supabase } from '../lib/supabase'

// ─── CSV export ───────────────────────────────────────────────────────────────

function buildCsv(schools) {
  const cols = [
    { key: 'name',                       label: 'Nom' },
    { key: 'structure_type',             label: 'Type' },
    { key: 'address',                    label: 'Adresse' },
    { key: 'studentCount',               label: 'Élèves' },
    { key: 'current_weekly_hours',       label: 'Heures actuelles (h/semaine)' },
    { key: 'desired_weekly_hours',       label: 'Heures souhaitées (h/semaine)' },
    { key: 'currentNetRate',             label: `Taux net ${currentSchoolYear()} (€/h)` },
    { key: 'priorityScore',              label: 'Score priorité' },
    { key: 'manual_priority_rating',     label: 'Priorité manuelle' },
    { key: 'premises_quality_rating',    label: 'Qualité locaux' },
    { key: 'work_atmosphere_rating',     label: 'Ambiance' },
    { key: 'student_engagement_rating',  label: 'Engagement élèves' },
    { key: 'tags',                       label: 'Mots-clés' },
    { key: 'contract_type',             label: 'Type de contrat' },
    { key: 'contract_type_detail',      label: 'Précision contrat' },
    { key: 'hours_stability',           label: 'Stabilité des heures' },
    { key: 'payment_duration',          label: 'Durée de versement' },
    { key: 'payment_smoothing',         label: 'Lissage du salaire' },
    { key: 'director_name',              label: 'Directeur/trice' },
    { key: 'director_email',             label: 'E-mail direction' },
    { key: 'contract_start_date',        label: 'Début contrat' },
    { key: 'notice_period',              label: 'Préavis' },
    { key: 'payment_delay',             label: 'Délai de paiement' },
    { key: 'shared_room',                label: 'Salle partagée' },
    { key: 'parking_rating',            label: 'Parking (étoiles)' },
    { key: 'bike_access',                label: 'Accès vélo' },
    { key: 'access_restriction_type',   label: 'Restrictions d\'accès' },
    { key: 'access_restriction_detail', label: 'Détail restriction' },
    { key: 'vacation_zone_override',     label: 'Zone vacances spécifique' },
    { key: 'notes',                      label: 'Notes libres' },
  ]

  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = cols.map((c) => escape(c.label)).join(',')
  const rows = schools.map((s) =>
    cols.map((c) => {
      const v = s[c.key]
      if (typeof v === 'boolean') return escape(v ? 'Oui' : 'Non')
      return escape(v)
    }).join(',')
  )
  return [header, ...rows].join('\n')
}

function downloadCsv(schools) {
  const csv = buildCsv(schools)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ecoles-profils-${currentSchoolYear()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Composants ───────────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronDown className="w-3 h-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
}

function StarDisplay({ value }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="flex items-center gap-0.5 text-guitar-400 text-xs font-medium">
      <Star className="w-3 h-3" fill="currentColor" />
      {value}
    </span>
  )
}

function fmtRate(v) {
  if (v == null) return <span className="text-amber-500 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />—</span>
  return <span>{Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'name',                 label: 'École' },
  { key: 'studentCount',         label: 'Élèves' },
  { key: 'current_weekly_hours', label: 'Heures act.' },
  { key: 'desired_weekly_hours', label: 'Heures souh.' },
  { key: 'currentNetRate',       label: 'Taux net' },
  { key: 'contract_type',        label: 'Contrat' },
  { key: 'priorityScore',        label: 'Score' },
  { key: 'tags',                 label: 'Mots-clés' },
]

export default function SchoolsComparativePage() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortCol, setSortCol] = useState('priorityScore')
  const [sortDir, setSortDir] = useState('desc')
  const [hideTerminated, setHideTerminated] = useState(true)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Non authentifié'); setLoading(false); return }
      try {
        const data = await fetchSchoolsOverview(user.id)
        setSchools(data)
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const sorted = useMemo(() => {
    let visible = hideTerminated
      ? schools.filter((s) => !s.contract_end_date || s.contract_end_date >= today)
      : schools
    if (filterType === 'ecole') visible = visible.filter((s) => s.structure_type !== 'particulier_cesu')
    else if (filterType === 'cesu') visible = visible.filter((s) => s.structure_type === 'particulier_cesu')
    return [...visible].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [schools, sortCol, sortDir, filterType, hideTerminated])

  const curYear = currentSchoolYear()

  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Comparatif des écoles</h1>
          <p className="text-muted-foreground mt-1">Triez par colonne — taux horaires pour l'année {curYear}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtre par type */}
          <div className="flex gap-1">
            {[
              { value: 'all',   label: 'Toutes' },
              { value: 'ecole', label: 'Écoles' },
              { value: 'cesu',  label: 'CESU' },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterType(f.value)}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                  filterType === f.value
                    ? 'border-guitar-600/40 bg-guitar-600/15 text-guitar-400'
                    : 'border-border-subtle text-muted-foreground hover:border-border'
                }`}
              >{f.label}</button>
            ))}
          </div>
          <button
            onClick={() => setHideTerminated((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${hideTerminated ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400' : 'border-border-subtle hover:bg-surface-overlay'}`}
          >
            <EyeOff className="w-4 h-4" />
            {hideTerminated ? 'Terminées masquées' : 'Toutes visibles'}
          </button>
          <button
            onClick={() => downloadCsv(schools)}
            disabled={schools.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : error ? (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </p>
      ) : schools.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-muted-foreground text-sm">Aucune école enregistrée.</p>
          <button onClick={() => navigate('/admin/ecoles/liste')} className="mt-3 text-guitar-400 text-sm hover:underline">
            Gérer les écoles
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-muted-foreground">
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.label}
                      <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((school, i) => {
                const missingRate = school.currentNetRate == null
                return (
                  <tr
                    key={school.id}
                    className={`border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 transition-colors ${i % 2 === 0 ? '' : 'bg-surface-raised/20'}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {school.name}
                        {school.contract_end_date && school.contract_end_date < today
                          ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-raised border border-border-subtle text-muted-foreground">Terminée</span>
                          : null
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{school.studentCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {school.current_weekly_hours != null ? `${school.current_weekly_hours} h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {school.desired_weekly_hours != null ? `${school.desired_weekly_hours} h` : '—'}
                    </td>
                    <td className="px-4 py-3">{fmtRate(school.currentNetRate)}</td>
                    <td className="px-4 py-3">
                      {school.contract_type
                        ? <div className="text-xs space-y-0.5">
                            <div>
                              <span className="font-medium text-foreground">{school.contract_type}</span>
                              {school.hours_stability && <span className="text-muted-foreground"> · {school.hours_stability}</span>}
                            </div>
                            {(school.payment_duration || school.payment_smoothing) && (
                              <div className="text-muted-foreground">
                                {[school.payment_duration, school.payment_smoothing].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        : <span className="text-xs text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3"><StarDisplay value={school.priorityScore} /></td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px]">
                      {school.tags
                        ? school.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                          <span key={t} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded-full text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400">{t}</span>
                        ))
                        : <span className="text-xs text-muted">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/admin/ecoles/${school.id}`)}
                        className="text-xs text-guitar-400 hover:underline"
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
