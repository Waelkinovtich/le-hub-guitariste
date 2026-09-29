// Récapitulatif de période : heures planifiées vs réalisées, km, carburant.
// Deux vues : "Planifié" (inclut planifie) et "Réalisé" (émargés uniquement).
// Export PDF via exportPDF.js (jsPDF + jspdf-autotable) et CSV natif.
//
// ⚠ Les km et l'estimation carburant proviennent des entrées saisies manuellement
// dans "Déplacements" — ce sont des estimations d'organisation, pas des données comptables.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchMileageRates } from '../../services/mileageRates'
import { FileDown, Loader2, ChevronDown } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_REALISE = ['present', 'excuse', 'rattrape']
const STATUS_PLANIFIE = ['planifie', ...STATUS_REALISE, 'absent', 'annule_prof']

const STATUS_LABELS = {
  planifie:    'Planifié',
  present:     'Présent',
  excuse:      'Excusé',
  rattrape:    'Rattrapé',
  absent:      'Absent',
  annule_prof: 'Annulé',
}

// Année scolaire courante : du 1er sept au 30 juin
function currentSchoolYear() {
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return { from: `${y}-09-01`, to: `${y + 1}-06-30` }
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtPeriod(from, to) {
  return `${fmtDate(from)} – ${fmtDate(to)}`
}

function minutesToH(min) {
  const h = Math.floor(min / 60), m = min % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV({ rows, filename }) {
  const header = Object.keys(rows[0] ?? {}).join(';')
  const body   = rows.map((r) => Object.values(r).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv    = [header, ...body].join('\n')
  const blob   = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Export PDF ───────────────────────────────────────────────────────────────

function exportRecapPDF({ view, stats, kmTotal, fuelTotal, period, teacherName }) {
  const doc = new jsPDF()
  let y = 20
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text(`Récapitulatif — ${view === 'planifie' ? 'Planifié' : 'Réalisé'}`, 14, y); y += 8
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
  doc.text(`${teacherName || ''}  •  Période : ${period}`, 14, y); y += 6
  doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 10
  doc.setTextColor(0, 0, 0)

  // Tableau cours
  const statusRows = Object.entries(stats.byStatus).map(([s, v]) => [
    STATUS_LABELS[s] ?? s,
    v.count,
    minutesToH(v.minutes),
    v.count > 0 ? `${(v.minutes / 60).toFixed(1)} h` : '—',
  ])
  autoTable(doc, {
    startY: y,
    head: [['Statut', 'Cours', 'Durée', 'Heures décimales']],
    body: statusRows,
    headStyles: { fillColor: [80, 80, 120], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })
  y = doc.lastAutoTable.finalY + 8
  doc.setFontSize(10)
  doc.text(`Total cours : ${stats.total.count}  •  Durée totale : ${minutesToH(stats.total.minutes)}`, 14, y); y += 10

  // Déplacements
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Déplacements (estimations saisies manuellement)', 14, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
  doc.text('⚠ Données issues de "Déplacements" — estimation d\'organisation, pas comptable.', 14, y); y += 6
  doc.setTextColor(0, 0, 0); doc.setFontSize(10)
  doc.text(`Km : ${kmTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`, 14, y); y += 6
  doc.text(
    fuelTotal > 0
      ? `Estimation carburant : ${fuelTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      : 'Estimation carburant : —',
    14, y
  )

  doc.save(`recap-${view}-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RecapPage() {
  const { user } = useAuth()

  const defaultRange = useMemo(() => currentSchoolYear(), [])
  const [from, setFrom]   = useState(defaultRange.from)
  const [to,   setTo]     = useState(defaultRange.to)
  const [view, setView]   = useState('realise') // 'planifie' | 'realise'

  const [loading,   setLoading]   = useState(false)
  const [lessons,   setLessons]   = useState([])
  const [travels,   setTravels]   = useState([])
  const [rates,     setRates]     = useState([])
  const [error,     setError]     = useState('')

  const load = useCallback(async () => {
    if (!from || !to || from > to) return
    setLoading(true); setError('')
    try {
      const [{ data: ls, error: le }, { data: tr, error: te }, fetchedRates] = await Promise.all([
        supabase.from('lessons')
          .select('id, status, duration_minutes, lesson_date, student_id, context_type, school_name')
          .eq('teacher_id', user.id)
          .gte('lesson_date', from)
          .lte('lesson_date', to),
        supabase.from('travel_entries')
          .select('id, date, kilometres, motif, mileage_rate_id')
          .eq('teacher_id', user.id)
          .gte('date', from)
          .lte('date', to),
        fetchMileageRates(user.id),
      ])
      if (le) throw new Error(le.message)
      if (te) throw new Error(te.message)
      setLessons(ls ?? [])
      setTravels(tr ?? [])
      setRates(fetchedRates ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user.id, from, to])

  useEffect(() => { load() }, [load])

  // ── Stats cours ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const relevant = view === 'realise'
      ? lessons.filter((l) => STATUS_REALISE.includes(l.status))
      : lessons.filter((l) => STATUS_PLANIFIE.includes(l.status))

    const byStatus = {}
    for (const s of (view === 'realise' ? STATUS_REALISE : STATUS_PLANIFIE)) {
      byStatus[s] = { count: 0, minutes: 0 }
    }
    for (const l of relevant) {
      if (!byStatus[l.status]) byStatus[l.status] = { count: 0, minutes: 0 }
      byStatus[l.status].count++
      byStatus[l.status].minutes += Number(l.duration_minutes ?? 45)
    }
    const total = relevant.reduce(
      (acc, l) => ({ count: acc.count + 1, minutes: acc.minutes + Number(l.duration_minutes ?? 45) }),
      { count: 0, minutes: 0 }
    )
    return { byStatus, total }
  }, [lessons, view])

  // ── Stats déplacements ────────────────────────────────────────────────────────
  const { kmTotal, fuelTotal } = useMemo(() => {
    const km = travels.reduce((s, t) => s + Number(t.kilometres ?? 0), 0)
    let fuel = 0
    for (const t of travels) {
      if (t.mileage_rate_id) {
        const rate = rates.find((r) => r.id === t.mileage_rate_id)
        if (rate) fuel += Number(t.kilometres ?? 0) * Number(rate.rate_per_km)
      }
    }
    return { kmTotal: km, fuelTotal: fuel }
  }, [travels, rates])

  const periodLabel = fmtPeriod(from, to)

  const handleExportCSV = () => {
    const relevant = view === 'realise'
      ? lessons.filter((l) => STATUS_REALISE.includes(l.status))
      : lessons.filter((l) => STATUS_PLANIFIE.includes(l.status))
    const rows = relevant.map((l) => ({
      Date:     l.lesson_date,
      Statut:   STATUS_LABELS[l.status] ?? l.status,
      'Durée (min)': l.duration_minutes ?? 45,
      École:    l.school_name ?? '',
      Contexte: l.context_type ?? '',
    }))
    exportCSV({ rows, filename: `recap-cours-${view}-${from}-${to}.csv` })
  }

  const handleExportPDF = () => {
    exportRecapPDF({
      view,
      stats,
      kmTotal,
      fuelTotal,
      period: periodLabel,
      teacherName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Récapitulatif de période</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Heures, déplacements et estimations sur une plage de dates choisie.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} disabled={loading || lessons.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors disabled:opacity-40">
            <FileDown className="w-4 h-4" /> CSV
          </button>
          <button onClick={handleExportPDF} disabled={loading || lessons.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors disabled:opacity-40">
            <FileDown className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Sélecteur de période */}
      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Période</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-36">
            <label className="block text-xs text-muted-foreground mb-1">Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs text-muted-foreground mb-1">Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600" />
          </div>
        </div>
        {/* Raccourcis */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { label: 'Année scolaire', ...currentSchoolYear() },
            { label: 'Janvier', from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-01-31` },
            { label: 'Juin', from: `${new Date().getFullYear()}-06-01`, to: `${new Date().getFullYear()}-06-30` },
          ].map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to) }}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs hover:bg-surface-overlay transition-colors">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onglets Planifié / Réalisé */}
      <div className="flex rounded-xl overflow-hidden border border-border-subtle">
        {[
          { key: 'realise',  label: 'Réalisé' },
          { key: 'planifie', label: 'Planifié (inclut non émargés)' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              view === key
                ? 'guitar-gradient text-white'
                : 'hover:bg-surface-overlay text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-4 py-3">{error}</p>
      )}

      {!loading && !error && (
        <>
          {/* Cours */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cours — {view === 'realise' ? 'Réalisés' : 'Planifiés'}</h2>
            {stats.total.count === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun cours sur cette période.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold">{stats.total.count}</p>
                    <p className="text-xs text-muted-foreground mt-1">Cours</p>
                  </div>
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold">{minutesToH(stats.total.minutes)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Durée totale</p>
                  </div>
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold">{(stats.total.minutes / 60).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Heures décimales</p>
                  </div>
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold">
                      {stats.total.count > 0
                        ? Math.round(stats.total.minutes / stats.total.count)
                        : '—'}
                      <span className="text-sm font-normal"> min</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Durée moy.</p>
                  </div>
                </div>
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-1.5">Statut</th>
                      <th className="text-right py-1.5">Cours</th>
                      <th className="text-right py-1.5">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.byStatus)
                      .filter(([, v]) => v.count > 0)
                      .map(([s, v]) => (
                        <tr key={s} className="border-t border-border-subtle/40">
                          <td className="py-1.5">{STATUS_LABELS[s] ?? s}</td>
                          <td className="text-right py-1.5">{v.count}</td>
                          <td className="text-right py-1.5">{minutesToH(v.minutes)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* Déplacements */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Déplacements</h2>
              <a href="/admin/deplacements" className="text-xs text-guitar-400 hover:underline">Gérer →</a>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="glass-panel rounded-xl p-3 flex-1 min-w-28 text-center">
                <p className="text-xl font-bold">
                  {kmTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                  <span className="text-sm font-normal"> km</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Kilométrage ({travels.length} entrée{travels.length !== 1 ? 's' : ''})</p>
              </div>
              {fuelTotal > 0 && (
                <div className="glass-panel rounded-xl p-3 flex-1 min-w-28 text-center">
                  <p className="text-xl font-bold">
                    {fuelTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-sm font-normal"> €</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Estimation carburant</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground border border-border-subtle/40 rounded-lg px-3 py-2">
              ⚠ Ces données proviennent de vos saisies dans "Déplacements" et sont des <strong>estimations d'organisation</strong> — elles ne remplacent pas un outil comptable certifié.
            </p>
          </div>

          {/* Synthèse exportable */}
          <p className="text-xs text-muted-foreground text-center pb-4">
            Période : {periodLabel} — {view === 'realise' ? 'Données réalisées' : 'Données planifiées'}
          </p>
        </>
      )}
    </div>
  )
}
