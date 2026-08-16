import { useState, useEffect, useCallback } from 'react'
import { School, ChevronLeft, Plus, Save, Loader2, Check, Trash2, Pencil } from 'lucide-react'
import HelpTooltip from '../components/HelpTooltip'
import { supabase } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const EXTRA_SCHOOLS = ['CESU']

function generateSlots() {
  const slots = []
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const endM = m + 15
      const endH = endM >= 60 ? h + 1 : h
      const endMm = String(endM >= 60 ? endM - 60 : endM).padStart(2, '0')
      const endHh = String(endH).padStart(2, '0')
      slots.push(`${hh}:${mm}–${endHh}:${endMm}`)
    }
  }
  return slots
}
const ALL_SLOTS = generateSlots()

// ─── Grille de créneaux réutilisable ─────────────────────────────────────────

function SlotGrid({ selected, onToggle }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-muted-foreground">Créneaux disponibles</label>
        <span className="text-xs text-muted">{selected.length} sélectionné{selected.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto pr-1">
        {ALL_SLOTS.map(slot => {
          const active = selected.includes(slot)
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onToggle(slot)}
              className={`flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs border transition-all ${
                active
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
              }`}
            >
              {active && <Check className="w-3 h-3 flex-shrink-0" />}
              {slot}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SCHOOL_YEARS = ['2025-2026', '2026-2027', '2027-2028']

function YearSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-sm text-foreground focus:border-guitar-600 outline-none transition-all"
    >
      {SCHOOL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function SchoolSchedulePage() {
  const [schoolYear, setSchoolYear] = useState('2026-2027')
  const [schools, setSchools] = useState([])
  const [allSchedules, setAllSchedules] = useState([]) // tous les horaires de l'année pour la vue liste
  const [selected, setSelected] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Mode ajout
  const [addingDay, setAddingDay] = useState(false)
  const [newDay, setNewDay] = useState('Lundi')
  const [newSlots, setNewSlots] = useState([])

  // Mode édition
  const [editingId, setEditingId] = useState(null)
  const [editDay, setEditDay] = useState('')
  const [editSlots, setEditSlots] = useState([])

  // ── Chargement des écoles ─────────────────────────────────────────────────

  useEffect(() => {
    async function fetchSchools() {
      setLoading(true)
      const [{ data: students }, { data: allSched }] = await Promise.all([
        supabase.from('students').select('school_name').not('school_name', 'is', null),
        supabase.from('school_schedules').select('school_name, slots').eq('school_year', schoolYear),
      ])
      const distinct = [...new Set((students ?? []).map(r => r.school_name).filter(Boolean))].sort()
      setSchools([...distinct, ...EXTRA_SCHOOLS])
      setAllSchedules(allSched ?? [])
      setLoading(false)
    }
    fetchSchools()
  }, [schoolYear])

  // ── Chargement des horaires ───────────────────────────────────────────────

  const fetchSchedules = useCallback(async (schoolName, year) => {
    const { data } = await supabase
      .from('school_schedules')
      .select('*')
      .eq('school_name', schoolName)
      .eq('school_year', year)
      .order('created_at')
    setSchedules(data ?? [])
  }, [])

  const selectSchool = async (name) => {
    setSelected(name)
    setSchedules([])
    setAddingDay(false)
    setEditingId(null)
    setNewSlots([])
    await fetchSchedules(name, schoolYear)
  }

  // Recharge les horaires de l'école active quand l'année change
  useEffect(() => {
    if (selected) {
      setSchedules([])
      fetchSchedules(selected, schoolYear)
    }
  }, [schoolYear, selected, fetchSchedules])

  // Synchronise allSchedules après chaque mutation (ajout, modif, suppression)
  const syncAllSchedules = (updatedRows) => {
    setAllSchedules(prev => {
      const otherSchools = prev.filter(r => r.school_name !== selected)
      return [...otherSchools, ...updatedRows.map(r => ({ school_name: r.school_name, slots: r.slots }))]
    })
  }

  const flash = (msg) => {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  // ── Suppression ───────────────────────────────────────────────────────────

  const deleteDay = async (id) => {
    await supabase.from('school_schedules').delete().eq('id', id)
    setSchedules(s => {
      const next = s.filter(r => r.id !== id)
      syncAllSchedules(next)
      return next
    })
    if (editingId === id) setEditingId(null)
  }

  // ── Ajout ─────────────────────────────────────────────────────────────────

  const toggleNew = (slot) =>
    setNewSlots(s => s.includes(slot) ? s.filter(x => x !== slot) : [...s, slot])

  const saveDay = async () => {
    if (!newDay || newSlots.length === 0) return
    setSaving(true)
    const { data, error } = await supabase
      .from('school_schedules')
      .insert({ school_name: selected, day: newDay, slots: newSlots, school_year: schoolYear })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setSchedules(s => {
        const next = [...s, data]
        syncAllSchedules(next)
        return next
      })
      setAddingDay(false)
      setNewSlots([])
      setNewDay('Lundi')
      flash('Jour enregistré')
    }
  }

  // ── Édition ───────────────────────────────────────────────────────────────

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditDay(row.day)
    setEditSlots(row.slots ?? [])
    setAddingDay(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDay('')
    setEditSlots([])
  }

  const toggleEdit = (slot) =>
    setEditSlots(s => s.includes(slot) ? s.filter(x => x !== slot) : [...s, slot])

  const saveEdit = async () => {
    if (editSlots.length === 0) return
    setSaving(true)
    const { data, error } = await supabase
      .from('school_schedules')
      .update({ day: editDay, slots: editSlots })
      .eq('id', editingId)
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setSchedules(s => {
        const next = s.map(r => r.id === editingId ? data : r)
        syncAllSchedules(next)
        return next
      })
      setEditingId(null)
      setEditDay('')
      setEditSlots([])
      flash('Jour mis à jour')
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Chargement…</span>
      </div>
    )
  }

  if (!selected) {
    const slotsBySchool = schools.reduce((acc, name) => {
      acc[name] = allSchedules.filter(r => r.school_name === name).reduce((s, r) => s + (r.slots?.length ?? 0), 0)
      return acc
    }, {})
    const grandTotal = Object.values(slotsBySchool).reduce((s, n) => s + n, 0)
    const fmt = (min) => {
      const h = Math.floor(min / 60), m = min % 60
      if (min === 0) return '—'
      return [h > 0 && `${h} h`, m > 0 && `${m} min`].filter(Boolean).join(' ')
    }

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-3xl text-foreground">Configuration des écoles</h1>
            <HelpTooltip texte="Définissez ici vos créneaux disponibles par école et par jour. Ces données alimentent le Planning intelligent et le calcul du temps total par établissement." position="bottom" />
          </div>
          <YearSelect value={schoolYear} onChange={setSchoolYear} />
        </div>
        <p className="text-sm text-muted-foreground mb-6">Sélectionnez une école pour configurer ses jours et créneaux.</p>

        {/* Total général */}
        <div className="glass-panel rounded-2xl px-5 py-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total général — {schoolYear}</span>
          <span className="font-semibold text-foreground tabular-nums">{fmt(grandTotal * 15)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {schools.map(name => {
            const min = (slotsBySchool[name] ?? 0) * 15
            return (
              <button
                key={name}
                onClick={() => selectSchool(name)}
                className="glass-panel rounded-2xl p-5 text-left hover:border-guitar-600/50 hover:bg-guitar-600/5 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-overlay border border-border flex items-center justify-center group-hover:bg-guitar-600/10 transition-colors flex-shrink-0">
                    <School className="w-5 h-5 text-muted-foreground group-hover:text-guitar-400" />
                  </div>
                  <span className="font-medium text-foreground">{name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Total hebdomadaire</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(min)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const usedDays = schedules.map(s => s.day)

  const totalMin = schedules.reduce((sum, row) => sum + (row.slots?.length ?? 0) * 15, 0)
  const totalH = Math.floor(totalMin / 60)
  const totalRem = totalMin % 60

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Toutes les écoles
        </button>
        <YearSelect value={schoolYear} onChange={(y) => { setSchoolYear(y); setEditingId(null); setAddingDay(false) }} />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-foreground">{selected}</h1>
          <p className="text-sm text-muted-foreground">{schedules.length} jour{schedules.length !== 1 ? 's' : ''} configuré{schedules.length !== 1 ? 's' : ''}</p>
        </div>
        {savedMsg && (
          <span className="flex items-center gap-1.5 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-1.5">
            <Check className="w-3.5 h-3.5" />{savedMsg}
          </span>
        )}
      </div>

      {/* Jours configurés */}
      <div className="space-y-3 mb-6">
        {schedules.length === 0 && !addingDay && (
          <p className="text-sm text-muted text-center py-8 glass-panel rounded-2xl">
            Aucun jour configuré pour cette école.
          </p>
        )}

        {schedules.map(row => (
          <div key={row.id} className="glass-panel rounded-2xl p-4">
            {/* En-tête de la carte */}
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-foreground">{row.day}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => editingId === row.id ? cancelEdit() : startEdit(row)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                    editingId === row.id
                      ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                      : 'border-border-subtle text-muted hover:text-foreground hover:border-border'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  {editingId === row.id ? 'Annuler' : 'Modifier'}
                </button>
                <button
                  onClick={() => deleteDay(row.id)}
                  className="p-1.5 rounded-lg hover:bg-guitar-600/10 text-muted hover:text-guitar-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mode lecture */}
            {editingId !== row.id && (
              <div className="flex flex-wrap gap-1.5">
                {(row.slots ?? []).map(slot => (
                  <span key={slot} className="text-xs px-2 py-1 rounded-lg bg-guitar-600/10 text-guitar-400 border border-guitar-600/20">
                    {slot}
                  </span>
                ))}
                {(!row.slots || row.slots.length === 0) && (
                  <span className="text-xs text-muted">Aucun créneau</span>
                )}
              </div>
            )}

            {/* Mode édition */}
            {editingId === row.id && (
              <div className="space-y-4 mt-2">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Jour</label>
                  <div className="flex flex-wrap gap-2">
                    {JOURS.map(j => (
                      <button
                        key={j}
                        type="button"
                        disabled={usedDays.includes(j) && j !== editDay}
                        onClick={() => setEditDay(j)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          editDay === j
                            ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                            : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
                        }`}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
                <SlotGrid selected={editSlots} onToggle={toggleEdit} />
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving || editSlots.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer les modifications
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Total hebdomadaire */}
      {schedules.length > 0 && (
        <div className="glass-panel rounded-2xl px-5 py-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total hebdomadaire</span>
          <span className="font-semibold text-foreground tabular-nums">
            {totalH > 0 && <>{totalH} h </>}{totalRem > 0 && <>{totalRem} min</>}{totalMin === 0 && '—'}
          </span>
        </div>
      )}

      {/* Panneau ajout d'un jour */}
      {addingDay ? (
        <div className="glass-panel rounded-2xl p-5 space-y-5">
          <h2 className="font-semibold text-foreground">Nouveau jour</h2>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Jour</label>
            <div className="flex flex-wrap gap-2">
              {JOURS.map(j => (
                <button
                  key={j}
                  type="button"
                  disabled={usedDays.includes(j)}
                  onClick={() => setNewDay(j)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    newDay === j
                      ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                      : 'border-border-subtle bg-surface text-muted-foreground hover:border-border'
                  }`}
                >
                  {j}
                </button>
              ))}
            </div>
          </div>
          <SlotGrid selected={newSlots} onToggle={toggleNew} />
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setAddingDay(false); setNewSlots([]); setNewDay('Lundi') }}
              className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={saveDay}
              disabled={saving || newSlots.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAddingDay(true); setEditingId(null) }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-guitar-600/60 hover:bg-guitar-600/5 text-muted-foreground hover:text-guitar-400 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter un jour
        </button>
      )}
    </div>
  )
}
