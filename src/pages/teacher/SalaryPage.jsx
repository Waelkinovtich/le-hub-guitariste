// Page "Salaires perçus" — saisie et suivi des versements.
// Colonnes réelles : payer_type, payer_label, period_month, received_date,
//   gross_amount, net_amount, hours_paid, payment_method, note.
// Les montants acceptent le format copier-coller "1 234,56 €".

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fetchSalaryPayments, createSalaryPayment, deleteSalaryPayment } from '../../services/salary'
import { fetchIncomeEntries } from '../../services/revenue'
import { FileDown, Plus, Trash2, Loader2, X } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYER_TYPES = [
  { value: 'ecole', label: 'École de musique' },
  { value: 'cesu',  label: 'CESU / Particulier' },
  { value: 'autre', label: 'Autre' },
]

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMonth(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function fmtAmount(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// Accepte "1 234,56 €", "1234.56", "1 234" → nombre ou null
function parseAmount(str) {
  if (!str || !String(str).trim()) return null
  const cleaned = String(str).replace(/[€\s]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function currentSchoolYear() {
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return { from: `${y}-09-01`, to: `${y + 1}-06-30` }
}

// ─── Formulaire d'ajout ────────────────────────────────────────────────────────

function SalaryForm({ onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    payer_type:     'ecole',
    payer_label:    '',
    period_month:   '',
    received_date:  today,
    gross_amount:   '',
    net_amount:     '',
    hours_paid:     '',
    payment_method: '',
    note:           '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const f = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const gross = parseAmount(form.gross_amount)
    const net   = parseAmount(form.net_amount)
    if (gross == null && net == null) {
      setError('Saisissez au moins le montant brut ou le montant net.')
      return
    }
    if (!form.received_date) { setError('La date de réception est obligatoire.'); return }
    setSaving(true)
    try {
      await onSave({
        payer_type:     form.payer_type,
        payer_label:    form.payer_label || null,
        period_month:   form.period_month || null,
        received_date:  form.received_date,
        gross_amount:   gross,
        net_amount:     net,
        hours_paid:     form.hours_paid ? parseFloat(form.hours_paid) : null,
        payment_method: form.payment_method || null,
        note:           form.note || null,
      })
    } catch (err) {
      setError(err.message ?? 'Erreur de sauvegarde.')
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type de payeur */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Type</label>
        <div className="flex gap-2">
          {PAYER_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((p) => ({ ...p, payer_type: value }))}
              className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
                form.payer_type === value
                  ? 'guitar-gradient text-white border-transparent'
                  : 'border-border-subtle hover:bg-surface-overlay'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Libellé */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Libellé (ex. nom de l'école)</label>
        <input type="text" value={form.payer_label} onChange={f('payer_label')} placeholder="ex. École de musique Prélude" className={inputCls} />
      </div>

      {/* Montants brut + net */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Brut (€)</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.gross_amount}
            onChange={f('gross_amount')}
            placeholder="ex. 1 234,56"
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Net (€)</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.net_amount}
            onChange={f('net_amount')}
            placeholder="ex. 1 100,00"
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">Au moins un des deux montants est requis. Accepte le format copier-coller "1 234,56 €".</p>

      {/* Dates */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Mois concerné (optionnel)</label>
          <input type="month" value={form.period_month ? form.period_month.slice(0, 7) : ''} onChange={(e) => setForm((p) => ({ ...p, period_month: e.target.value ? e.target.value + '-01' : '' }))} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Reçu le *</label>
          <input type="date" value={form.received_date} onChange={f('received_date')} required className={inputCls} />
        </div>
      </div>

      {/* Heures + mode de paiement */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Heures payées</label>
          <input type="number" min="0" step="0.25" value={form.hours_paid} onChange={f('hours_paid')} placeholder="ex. 18" className={inputCls} />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Mode de paiement</label>
          <input type="text" value={form.payment_method} onChange={f('payment_method')} placeholder="ex. virement" className={inputCls} />
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Note (optionnel)</label>
        <input type="text" value={form.note} onChange={f('note')} className={inputCls} />
      </div>

      {error && <p className="text-xs text-guitar-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SalaryPage() {
  const { user } = useAuth()
  const defaultRange = useMemo(() => currentSchoolYear(), [])
  const [from, setFrom] = useState(defaultRange.from)
  const [to,   setTo]   = useState(defaultRange.to)

  const [payments,  setPayments]  = useState([])
  const [incomes,   setIncomes]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [showForm,  setShowForm]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [pmts, incs] = await Promise.all([
        fetchSalaryPayments(user.id, { from, to }),
        fetchIncomeEntries(user.id, { from, to }).catch(() => []),
      ])
      setPayments(pmts)
      setIncomes(incs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user.id, from, to])

  useEffect(() => { load() }, [load])

  // ── Totaux ────────────────────────────────────────────────────────────────────
  const totalNet    = useMemo(() => payments.reduce((s, p) => s + (Number(p.net_amount)   || 0), 0), [payments])
  const totalGross  = useMemo(() => payments.reduce((s, p) => s + (Number(p.gross_amount) || 0), 0), [payments])
  const totalHours  = useMemo(() => payments.reduce((s, p) => s + (Number(p.hours_paid)   || 0), 0), [payments])
  const totalAttendus = useMemo(() => incomes.reduce((s, e) => s + (Number(e.amount ?? 0) || 0), 0), [incomes])
  const ecart       = totalNet > 0 ? totalNet - totalAttendus : totalGross - totalAttendus
  const tauxReel    = totalHours > 0 && totalNet > 0 ? totalNet / totalHours : null

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const handleCSV = () => {
    const rows = payments.map((p) => ({
      Type:             PAYER_TYPES.find((t) => t.value === p.payer_type)?.label ?? p.payer_type ?? '',
      Libellé:          p.payer_label ?? '',
      'Mois concerné':  p.period_month ? fmtMonth(p.period_month) : '',
      'Reçu le':        p.received_date,
      'Brut (€)':       p.gross_amount != null ? Number(p.gross_amount).toFixed(2) : '',
      'Net (€)':        p.net_amount   != null ? Number(p.net_amount).toFixed(2)   : '',
      'Heures payées':  p.hours_paid   != null ? p.hours_paid : '',
      'Mode paiement':  p.payment_method ?? '',
      Note:             p.note ?? '',
    }))
    const header = Object.keys(rows[0] ?? {}).join(';')
    const body   = rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    const csv    = [header, ...body].join('\n')
    const blob   = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a'); a.href = url; a.download = `salaires-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export PDF ────────────────────────────────────────────────────────────────
  const handlePDF = () => {
    const doc = new jsPDF()
    let y = 20
    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('Salaires perçus', 14, y); y += 8
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    doc.text(`${name}  •  ${fmtDate(from)} – ${fmtDate(to)}`, 14, y); y += 6
    doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 10
    doc.setTextColor(0, 0, 0)

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Libellé', 'Mois', 'Reçu le', 'Brut', 'Net']],
      body: payments.map((p) => [
        PAYER_TYPES.find((t) => t.value === p.payer_type)?.label ?? p.payer_type ?? '—',
        p.payer_label ?? '—',
        p.period_month ? fmtMonth(p.period_month) : '—',
        fmtDate(p.received_date),
        fmtAmount(p.gross_amount),
        fmtAmount(p.net_amount),
      ]),
      headStyles: { fillColor: [80, 80, 120], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    })
    y = doc.lastAutoTable.finalY + 8
    doc.setFontSize(10)
    if (totalGross > 0) { doc.text(`Total brut : ${fmtAmount(totalGross)}`, 14, y); y += 6 }
    if (totalNet  > 0) { doc.text(`Total net  : ${fmtAmount(totalNet)}`,  14, y); y += 6 }
    if (totalAttendus > 0) { doc.text(`Revenus saisis : ${fmtAmount(totalAttendus)}  |  Écart : ${fmtAmount(ecart)}`, 14, y); y += 6 }
    if (tauxReel)        { doc.text(`Taux horaire réel (net/h) : ${tauxReel.toFixed(2)} €/h`, 14, y) }
    doc.save(`salaires-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce versement ?')) return
    try {
      await deleteSalaryPayment(id)
      setPayments((p) => p.filter((x) => x.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Salaires perçus</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des versements et comparaison avec les revenus saisis.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCSV} disabled={loading || payments.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors disabled:opacity-40">
            <FileDown className="w-4 h-4" /> CSV
          </button>
          <button onClick={handlePDF} disabled={loading || payments.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm hover:bg-surface-overlay transition-colors disabled:opacity-40">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> Ajouter
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
      </div>

      {/* Formulaire modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-sm glass-panel rounded-2xl p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nouveau versement</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-surface-overlay">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SalaryForm
              onSave={async (fields) => {
                const created = await createSalaryPayment(user.id, fields)
                setPayments((p) => [created, ...p].sort((a, b) => b.received_date.localeCompare(a.received_date)))
                setShowForm(false)
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-4 py-3">{error}</p>}

      {!loading && !error && (
        <>
          {/* Synthèse */}
          <div className="glass-panel rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Synthèse</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun versement sur cette période.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {totalGross > 0 && (
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{fmtAmount(totalGross)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Brut perçu</p>
                  </div>
                )}
                {totalNet > 0 && (
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{fmtAmount(totalNet)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Net perçu</p>
                  </div>
                )}
                {totalAttendus > 0 && (
                  <div className={`glass-panel rounded-xl p-3 text-center ${ecart < 0 ? 'border border-guitar-400/30' : ''}`}>
                    <p className={`text-xl font-bold ${ecart < 0 ? 'text-guitar-400' : 'text-emerald-400'}`}>
                      {ecart >= 0 ? '+' : ''}{fmtAmount(ecart)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Écart vs revenus</p>
                  </div>
                )}
                {tauxReel != null && (
                  <div className="glass-panel rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{tauxReel.toFixed(2)} <span className="text-sm font-normal">€/h</span></p>
                    <p className="text-xs text-muted-foreground mt-1">Taux net réel</p>
                  </div>
                )}
              </div>
            )}
            {totalAttendus === 0 && payments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Saisissez vos revenus dans "Suivi des revenus" pour voir l'écart et le taux horaire.
              </p>
            )}
          </div>

          {/* Liste des versements */}
          <div className="glass-panel rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Versements ({payments.length})
            </h2>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun versement. Cliquez sur "+ Ajouter" pour commencer.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 py-2.5 border-t border-border-subtle/40 first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {p.payer_label ?? PAYER_TYPES.find((t) => t.value === p.payer_type)?.label ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.period_month ? `${fmtMonth(p.period_month)} · ` : ''}
                        Reçu le {fmtDate(p.received_date)}
                        {p.hours_paid ? ` · ${p.hours_paid} h` : ''}
                        {p.payment_method ? ` · ${p.payment_method}` : ''}
                      </p>
                      {p.note && <p className="text-xs text-muted-foreground truncate">{p.note}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {p.net_amount   != null && <p className="text-sm font-semibold text-guitar-400">{fmtAmount(p.net_amount)} net</p>}
                        {p.gross_amount != null && <p className="text-xs text-muted-foreground">{fmtAmount(p.gross_amount)} brut</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
