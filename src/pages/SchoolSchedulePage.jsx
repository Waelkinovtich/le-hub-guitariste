import { useState, useEffect, useCallback, useMemo } from 'react'
import { School, ChevronLeft, LayoutGrid, List, Plus, X } from 'lucide-react'
import HelpTooltip from '../components/HelpTooltip'
import WeekGridPlanning from '../components/WeekGridPlanning'
import { supabase } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const EXTRA_SCHOOLS = ['CESU']

// Couleur fixe pour les créneaux disponibles (vert discret, distinct des cours élèves)
const SLOT_COLOR = '#16a34a'

// Plage horaire pour la vue liste (8h–20h par tranches de 15 min)
const HEURE_DEBUT = 8
const HEURE_FIN   = 20

// ─── Helpers : conversion jours ↔ dates ISO ───────────────────────────────────
//
// WeekGridPlanning travaille avec des dates ISO réelles ; on génère une
// "semaine de référence" (lundi de la semaine courante) pour mapper les jours
// abstraits (Lundi, Mardi…) → dates. Le contenu affiché est hebdomadaire
// récurrent — aucun créneau n'est daté réellement.

const JOUR_TO_JS_DAY = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6, Dimanche: 0 }
const JS_DAY_TO_JOUR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function getMondayISO() {
  const d = new Date()
  const dow = d.getDay() || 7 // 1=Lun, 7=Dim
  d.setDate(d.getDate() - dow + 1)
  return d.toISOString().slice(0, 10)
}

function jourToISO(jourFr, mondayISO) {
  const jsFr = JOUR_TO_JS_DAY[jourFr]
  const offset = jsFr === 0 ? 6 : jsFr - 1
  const d = new Date(mondayISO + 'T12:00:00')
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function isoToJour(iso) {
  return JS_DAY_TO_JOUR[new Date(iso + 'T12:00:00').getDay()]
}

// Développe lessonTime + durationMinutes → tableau de strings "HH:MM–HH:MM"
function expandToSlots(lessonTime, durationMinutes) {
  const slots = []
  const [startH, startM] = lessonTime.split(':').map(Number)
  let totalMin = startH * 60 + startM
  const endMin = totalMin + durationMinutes
  while (totalMin < endMin) {
    const sh = String(Math.floor(totalMin / 60)).padStart(2, '0')
    const sm = String(totalMin % 60).padStart(2, '0')
    const em = totalMin + 15
    const eh = String(Math.floor(em / 60)).padStart(2, '0')
    const mm = String(em % 60).padStart(2, '0')
    slots.push(`${sh}:${sm}–${eh}:${mm}`)
    totalMin += 15
  }
  return slots
}

// Génère tous les créneaux de 15 min entre HEURE_DEBUT et HEURE_FIN
function allSlots() {
  const result = []
  for (let m = HEURE_DEBUT * 60; m < HEURE_FIN * 60; m += 15) {
    const sh = String(Math.floor(m / 60)).padStart(2, '0')
    const sm = String(m % 60).padStart(2, '0')
    const em = m + 15
    const eh = String(Math.floor(em / 60)).padStart(2, '0')
    const mm = String(em % 60).padStart(2, '0')
    result.push(`${sh}:${sm}–${eh}:${mm}`)
  }
  return result
}

const ALL_SLOTS = allSlots()

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

// ─── Vue liste : grille de créneaux par jour ──────────────────────────────────

function SlotGrid({ schedules, onToggleSlot, onRemoveDay, onAddDay }) {
  const [ajoutJour, setAjoutJour] = useState(null)
  const joursActifs = schedules.map(r => r.day)
  const joursDisponibles = JOURS.filter(j => !joursActifs.includes(j))

  return (
    <div className="space-y-4">
      {schedules.map((row) => {
        const slotsActifs = new Set(row.slots ?? [])
        return (
          <div key={row.id} className="glass-panel rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-foreground">{row.day}</span>
              <button
                onClick={() => onRemoveDay(row)}
                className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Supprimer ce jour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Grille de créneaux : colonne par heure entière, ligne = quart */}
            <div className="overflow-x-auto">
              <div className="flex gap-1 flex-wrap">
                {ALL_SLOTS.map((slot) => {
                  const actif = slotsActifs.has(slot)
                  return (
                    <button
                      key={slot}
                      onClick={() => onToggleSlot(row, slot)}
                      title={slot}
                      className={[
                        'text-[10px] px-1.5 py-0.5 rounded transition-all font-mono tabular-nums',
                        actif
                          ? 'bg-green-600/80 text-white border border-green-500'
                          : 'bg-surface-overlay border border-border-subtle text-muted-foreground hover:border-guitar-600/50 hover:text-foreground',
                      ].join(' ')}
                    >
                      {slot.split('–')[0]}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {slotsActifs.size} créneau{slotsActifs.size > 1 ? 'x' : ''} sélectionné{slotsActifs.size > 1 ? 's' : ''}
            </p>
          </div>
        )
      })}

      {/* Panneau Ajouter un jour */}
      {joursDisponibles.length > 0 && (
        ajoutJour == null ? (
          <button
            onClick={() => setAjoutJour(joursDisponibles[0])}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border-subtle text-sm text-muted-foreground hover:text-foreground hover:border-guitar-600/50 transition-all w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            Ajouter un jour
          </button>
        ) : (
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <select
              value={ajoutJour}
              onChange={e => setAjoutJour(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-sm text-foreground focus:border-guitar-600 outline-none"
            >
              {joursDisponibles.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <button
              onClick={() => { onAddDay(ajoutJour); setAjoutJour(null) }}
              className="px-4 py-1.5 rounded-lg bg-guitar-600 text-white text-sm hover:bg-guitar-700 transition-colors"
            >
              Ajouter
            </button>
            <button
              onClick={() => setAjoutJour(null)}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Annuler
            </button>
          </div>
        )
      )}

      {schedules.length === 0 && ajoutJour == null && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun créneau configuré. Ajoutez un jour pour commencer.
        </p>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function SchoolSchedulePage() {
  const [schoolYear, setSchoolYear] = useState('2026-2027')
  const [schools, setSchools] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [selected, setSelected] = useState(null)
  const [schedules, setSchedules] = useState([])   // [{ id, school_name, day, slots: string[] }]
  const [loading, setLoading] = useState(true)
  // 'grille' = WeekGridPlanning, 'liste' = SlotGrid par jour
  const [vue, setVue] = useState('grille')

  // Lundi de la semaine courante — clé stable pour toute la session
  const mondayISO = useMemo(getMondayISO, [])

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

  const fetchSchedules = useCallback(async (schoolName, year) => {
    const { data } = await supabase
      .from('school_schedules').select('*')
      .eq('school_name', schoolName).eq('school_year', year).order('created_at')
    setSchedules(data ?? [])
  }, [])

  const selectSchool = async (name) => {
    setSelected(name); setSchedules([])
    await fetchSchedules(name, schoolYear)
  }

  useEffect(() => {
    if (selected) { setSchedules([]); fetchSchedules(selected, schoolYear) }
  }, [schoolYear, selected, fetchSchedules])

  // ── Helpers partagés : écriture en base ──────────────────────────────────

  const mergeSlots = useCallback(async (jourFr, newSlots) => {
    // Ajoute newSlots dans le jour jourFr (fusion sans doublons)
    const existing = schedules.find((r) => r.day === jourFr)
    if (existing) {
      const merged = [...new Set([...(existing.slots ?? []), ...newSlots])]
      const { data } = await supabase
        .from('school_schedules').update({ slots: merged }).eq('id', existing.id).select().single()
      if (data) setSchedules((s) => s.map((r) => r.id === existing.id ? data : r))
    } else {
      const { data } = await supabase
        .from('school_schedules')
        .insert({ school_name: selected, day: jourFr, slots: newSlots, school_year: schoolYear })
        .select().single()
      if (data) setSchedules((s) => [...s, data])
    }
  }, [schedules, selected, schoolYear])

  const removeSlot = useCallback(async (rowId, slotStr) => {
    // Retire slotStr de la ligne rowId ; supprime la ligne si elle devient vide
    const row = schedules.find((r) => r.id === rowId)
    if (!row) return
    const updatedSlots = (row.slots ?? []).filter((s) => s !== slotStr)
    if (updatedSlots.length === 0) {
      await supabase.from('school_schedules').delete().eq('id', row.id)
      setSchedules((s) => s.filter((r) => r.id !== row.id))
    } else {
      const { data } = await supabase
        .from('school_schedules').update({ slots: updatedSlots }).eq('id', row.id).select().single()
      if (data) setSchedules((s) => s.map((r) => r.id === row.id ? data : r))
    }
  }, [schedules])

  // ── Conversion schedules → faux cours pour WeekGridPlanning ──────────────
  //
  // nonMovable=false → les créneaux peuvent être déplacés par glisser-déposer.
  // onMoveLesson sur WeekGridPlanning intercepte le déplacement et met à jour
  // school_schedules au lieu d'appeler updateLesson (qui vise la table lessons).

  const fakeLessons = useMemo(() => {
    const result = []
    for (const row of schedules) {
      const iso = jourToISO(row.day, mondayISO)
      for (const slotStr of (row.slots ?? [])) {
        const lessonTime = slotStr.split('–')[0]
        result.push({
          id:              `sch_${row.id}_${slotStr}`,
          lessonDate:      iso,
          lessonTime,
          durationMinutes: 15,
          schoolName:      selected,
          lessonType:      'ecole',
          studentName:     '',
          timeLabel:       slotStr,
          nonMovable:      false,
          // Méta pour retrouver la ligne source lors du déplacement / suppression
          _rowId:   row.id,
          _slotStr: slotStr,
          _day:     row.day,
        })
      }
    }
    return result
  }, [schedules, mondayISO, selected])

  const weekDays = useMemo(() => JOURS.map((jour) => ({
    label:   jour.slice(0, 3).toUpperCase(),
    dayNum:  JOUR_TO_JS_DAY[jour] === 0 ? 7 : JOUR_TO_JS_DAY[jour],
    iso:     jourToISO(jour, mondayISO),
    isToday: false,
  })), [mondayISO])

  // ── Ajout : glisser dans une zone vide de la grille ───────────────────────

  const handleNewLesson = useCallback(async ({ lessonDate, lessonTime, durationMinutes }) => {
    const jourFr  = isoToJour(lessonDate)
    const newSlots = expandToSlots(lessonTime, durationMinutes)
    await mergeSlots(jourFr, newSlots)
  }, [mergeSlots])

  // ── Déplacement : créneau existant glissé vers un autre jour/heure ────────
  //
  // On ne chaîne pas removeSlot → mergeSlots (closures sur schedules stale).
  // On effectue les deux opérations directement en base puis on recharge depuis
  // Supabase pour garantir la cohérence de l'état local.

  const handleMoveLesson = useCallback(async ({ lesson, newDate, newTime, durationMinutes }) => {
    const ancienJour  = lesson._day
    const ancienSlot  = lesson._slotStr
    const nouveauJour = isoToJour(newDate)
    const newSlots    = expandToSlots(newTime, durationMinutes ?? 15)

    if (ancienJour === nouveauJour && newSlots.includes(ancienSlot) && newSlots.length === 1) {
      return
    }

    // Lire l'état courant depuis la base pour éviter les conflits de closure
    const { data: rows } = await supabase
      .from('school_schedules').select('*')
      .eq('school_name', selected).eq('school_year', schoolYear)
    const current = rows ?? []

    // 1. Retirer l'ancien créneau
    const srcRow = current.find(r => r.id === lesson._rowId)
    if (srcRow) {
      const sans = (srcRow.slots ?? []).filter(s => s !== ancienSlot)
      if (sans.length === 0) {
        await supabase.from('school_schedules').delete().eq('id', srcRow.id)
      } else {
        await supabase.from('school_schedules').update({ slots: sans }).eq('id', srcRow.id)
      }
    }

    // 2. Ajouter le(s) nouveau(x) créneau(x) dans le jour cible
    // On relit current (post-suppression) : current est en mémoire, donc on
    // distingue le cas où srcRow et dstRow sont le même enregistrement.
    const dstRowFromCurrent = current.find(r => r.day === nouveauJour)
    const srcWasDeleted = srcRow && ancienJour === nouveauJour && (srcRow.slots ?? []).filter(s => s !== ancienSlot).length === 0

    if (dstRowFromCurrent && !srcWasDeleted) {
      const merged = [...new Set([...(dstRowFromCurrent.slots ?? []).filter(s => s !== ancienSlot), ...newSlots])]
      await supabase.from('school_schedules').update({ slots: merged }).eq('id', dstRowFromCurrent.id)
    } else if (!dstRowFromCurrent || srcWasDeleted) {
      // Créer une nouvelle ligne ou recréer si l'unique ligne du jour a été supprimée
      const existing = srcWasDeleted ? null : dstRowFromCurrent
      if (!existing) {
        await supabase.from('school_schedules')
          .insert({ school_name: selected, day: nouveauJour, slots: newSlots, school_year: schoolYear })
      }
    }

    // Recharger l'état complet depuis la base
    const { data: refreshed } = await supabase
      .from('school_schedules').select('*')
      .eq('school_name', selected).eq('school_year', schoolYear).order('created_at')
    setSchedules(refreshed ?? [])
  }, [selected, schoolYear])

  // ── Suppression : bouton poubelle sur un faux cours ───────────────────────

  const handleDeleteLesson = useCallback(async (lesson) => {
    await removeSlot(lesson._rowId, lesson._slotStr)
  }, [removeSlot])

  // ── Vue liste : bascule de créneau ───────────────────────────────────────

  const handleToggleSlot = useCallback(async (row, slot) => {
    const slotsActifs = row.slots ?? []
    if (slotsActifs.includes(slot)) {
      await removeSlot(row.id, slot)
    } else {
      await mergeSlots(row.day, [slot])
    }
  }, [removeSlot, mergeSlots])

  const handleRemoveDay = useCallback(async (row) => {
    await supabase.from('school_schedules').delete().eq('id', row.id)
    setSchedules((s) => s.filter((r) => r.id !== row.id))
  }, [])

  const handleAddDay = useCallback(async (jourFr) => {
    const { data } = await supabase
      .from('school_schedules')
      .insert({ school_name: selected, day: jourFr, slots: [], school_year: schoolYear })
      .select().single()
    if (data) setSchedules((s) => [...s, data])
  }, [selected, schoolYear])

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
    const fmtMin = (min) => {
      const h = Math.floor(min / 60), m = min % 60
      if (min === 0) return '—'
      return [h > 0 && `${h} h`, m > 0 && `${m} min`].filter(Boolean).join(' ')
    }

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-3xl text-foreground">Configuration des écoles</h1>
            <HelpTooltip texte="Définissez vos créneaux disponibles par école. Glissez dans la grille hebdomadaire pour ajouter des créneaux, cliquez sur la poubelle pour en supprimer. La vue liste permet de basculer des créneaux individuels." position="bottom" />
          </div>
          <YearSelect value={schoolYear} onChange={setSchoolYear} />
        </div>
        <p className="text-sm text-muted-foreground mb-6">Sélectionnez une école pour configurer ses créneaux.</p>

        <div className="glass-panel rounded-2xl px-5 py-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total général — {schoolYear}</span>
          <span className="font-semibold text-foreground tabular-nums">{fmtMin(grandTotal * 15)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {schools.map(name => {
            const min = (slotsBySchool[name] ?? 0) * 15
            return (
              <button key={name} onClick={() => selectSchool(name)}
                className="glass-panel rounded-2xl p-5 text-left hover:border-guitar-600/50 hover:bg-guitar-600/5 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-overlay border border-border flex items-center justify-center group-hover:bg-guitar-600/10 transition-colors flex-shrink-0">
                    <School className="w-5 h-5 text-muted-foreground group-hover:text-guitar-400" />
                  </div>
                  <span className="font-medium text-foreground">{name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Total hebdomadaire</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{fmtMin(min)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const totalMin  = schedules.reduce((s, r) => s + (r.slots?.length ?? 0) * 15, 0)
  const totalH    = Math.floor(totalMin / 60)
  const totalRem  = totalMin % 60

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Toutes les écoles
        </button>
        <YearSelect value={schoolYear} onChange={(y) => { setSchoolYear(y) }} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">{selected}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {schedules.reduce((s, r) => s + (r.slots?.length ?? 0), 0)} créneaux —{' '}
            {totalH > 0 && `${totalH} h `}{totalRem > 0 && `${totalRem} min`}{totalMin === 0 && '—'} / semaine
          </p>
        </div>

        {/* Bascule grille / liste */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-overlay border border-border-subtle">
          <button
            onClick={() => setVue('grille')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
              vue === 'grille'
                ? 'bg-guitar-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Grille
          </button>
          <button
            onClick={() => setVue('liste')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
              vue === 'liste'
                ? 'bg-guitar-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <List className="w-3.5 h-3.5" />
            Liste
          </button>
        </div>
      </div>

      {vue === 'grille' ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            <span className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: SLOT_COLOR + '50', border: `2px solid ${SLOT_COLOR}` }} />
            Glissez pour ajouter des créneaux · Glissez un créneau existant pour le déplacer · Cliquez sur 🗑 pour supprimer.
          </p>

          <WeekGridPlanning
            weekDays={weekDays}
            lessons={fakeLessons}
            onNewLesson={handleNewLesson}
            onSelectLesson={() => {}}
            onDeleteLesson={handleDeleteLesson}
            onMoveLesson={handleMoveLesson}
          />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            Cliquez sur un créneau pour l'activer ou le désactiver. Utilisez ✕ pour supprimer un jour entier.
          </p>

          <SlotGrid
            schedules={schedules}
            onToggleSlot={handleToggleSlot}
            onRemoveDay={handleRemoveDay}
            onAddDay={handleAddDay}
          />
        </>
      )}
    </div>
  )
}
