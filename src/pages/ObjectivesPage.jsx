import { useState, useEffect } from 'react'
import { Target, Euro, Clock, Car, Fuel, Save, Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AideContextuelle from '../components/AideContextuelle'
import { currentSchoolYear, allSchoolYears } from '../context/PeriodContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
        {hint && <span className="ml-1 font-normal text-muted/70">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SCHOOL_YEARS = allSchoolYears()

export default function ObjectivesPage() {
  const { user } = useAuth()
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear())

  const [form, setForm] = useState({
    revenu_mensuel_cible:    '',
    plafond_heures_hebdo:    '',
    budget_km_mensuel:       '',
    budget_carburant_mensuel:'',
    notes:                   '',
  })

  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')

  // ── Chargement des objectifs pour l'année sélectionnée ─────────────────────

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    setError('')
    supabase
      .from('objectives')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('school_year', schoolYear)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return }
        if (data) {
          setForm({
            revenu_mensuel_cible:     data.revenu_mensuel_cible     ?? '',
            plafond_heures_hebdo:     data.plafond_heures_hebdo     ?? '',
            budget_km_mensuel:        data.budget_km_mensuel        ?? '',
            budget_carburant_mensuel: data.budget_carburant_mensuel ?? '',
            notes:                    data.notes                    ?? '',
          })
        } else {
          setForm({ revenu_mensuel_cible: '', plafond_heures_hebdo: '', budget_km_mensuel: '', budget_carburant_mensuel: '', notes: '' })
        }
        setLoading(false)
      })
  }, [user?.id, schoolYear])

  const f = (key) => (e) => { setForm(p => ({ ...p, [key]: e.target.value })); setSaved(false) }

  // ── Revenu annuel calculé ──────────────────────────────────────────────────

  const revenuAnnuel = form.revenu_mensuel_cible
    ? (parseFloat(form.revenu_mensuel_cible) * 12).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
    : null

  // ── Sauvegarde (UPSERT) ────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.id) return
    setSaving(true)
    setError('')
    setSaved(false)

    const payload = {
      teacher_id:              user.id,
      school_year:             schoolYear,
      revenu_mensuel_cible:    form.revenu_mensuel_cible     !== '' ? parseFloat(form.revenu_mensuel_cible)     : null,
      plafond_heures_hebdo:    form.plafond_heures_hebdo     !== '' ? parseFloat(form.plafond_heures_hebdo)     : null,
      budget_km_mensuel:       form.budget_km_mensuel        !== '' ? parseInt(form.budget_km_mensuel, 10)      : null,
      budget_carburant_mensuel:form.budget_carburant_mensuel !== '' ? parseFloat(form.budget_carburant_mensuel) : null,
      notes:                   form.notes || null,
    }

    const { error: err } = await supabase
      .from('objectives')
      .upsert(payload, { onConflict: 'teacher_id,school_year' })

    if (err) setError(err.message)
    else setSaved(true)
    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-1">Objectifs</h1>
        <p className="text-sm text-muted-foreground">
          Définissez vos cibles financières et vos contraintes de temps par année scolaire.
          Ces données alimentent le simulateur de répartition d'heures.
        </p>
      </div>
      <AideContextuelle texte="Définissez ici votre revenu mensuel cible et votre plafond d'heures par semaine. Ces chiffres alimentent directement le Simulateur de répartition, qui calcule combien d'heures allouer à chaque école pour atteindre vos objectifs." />


      {/* ── Sélecteur d'année ── */}
      <div className="glass-panel rounded-2xl p-5 mb-4">
        <Field label="Année scolaire concernée">
          <div className="relative">
            <select
              value={schoolYear}
              onChange={e => { setSchoolYear(e.target.value); setSaved(false) }}
              className={inputCls + ' pr-8 appearance-none cursor-pointer'}
            >
              {SCHOOL_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </Field>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <div className="w-4 h-4 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Revenus ── */}
          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Euro}
              title="Revenu cible"
              subtitle="Montant net mensuel que vous souhaitez atteindre."
            />
            <div className="space-y-4">
              <Field label="Revenu mensuel net cible" hint="€">
                <input
                  type="number" min="0" step="50"
                  value={form.revenu_mensuel_cible}
                  onChange={f('revenu_mensuel_cible')}
                  placeholder="ex : 2 500"
                  className={inputCls}
                />
              </Field>
              {revenuAnnuel && (
                <p className="text-xs text-muted-foreground">
                  Soit <span className="font-medium text-foreground">{revenuAnnuel} / an</span>.
                </p>
              )}
            </div>
          </div>

          {/* ── Heures ── */}
          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Clock}
              title="Plafond d'heures"
              subtitle="Nombre maximum d'heures de cours par semaine, toutes écoles confondues."
            />
            <Field label="Heures maximum par semaine" hint="h">
              <input
                type="number" min="1" max="60" step="0.5"
                value={form.plafond_heures_hebdo}
                onChange={f('plafond_heures_hebdo')}
                placeholder="ex : 25"
                className={inputCls}
              />
            </Field>
          </div>

          {/* ── Déplacements ── */}
          <div className="glass-panel rounded-2xl p-5">
            <SectionHeader
              icon={Car}
              title="Budget déplacements"
              subtitle="Vos contraintes de kilométrage et de carburant chaque mois."
            />
            <div className="space-y-4">
              <Field label="Kilométrage mensuel maximum" hint="km">
                <input
                  type="number" min="0" step="50"
                  value={form.budget_km_mensuel}
                  onChange={f('budget_km_mensuel')}
                  placeholder="ex : 800"
                  className={inputCls}
                />
              </Field>
              <Field label="Budget carburant mensuel" hint="€">
                <input
                  type="number" min="0" step="5"
                  value={form.budget_carburant_mensuel}
                  onChange={f('budget_carburant_mensuel')}
                  placeholder="ex : 120"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          {/* ── Notes libres ── */}
          <div className="glass-panel rounded-2xl p-5">
            <Field label="Notes libres" hint="facultatif">
              <textarea
                rows={3}
                value={form.notes}
                onChange={f('notes')}
                placeholder="Contraintes particulières, priorités, rappels…"
                className={inputCls + ' resize-none'}
              />
            </Field>
          </div>

          {/* ── Actions ── */}
          {error && (
            <div className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
            ) : saved ? (
              <><Check className="w-4 h-4" /> Objectifs enregistrés</>
            ) : (
              <><Save className="w-4 h-4" /> Enregistrer les objectifs</>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
