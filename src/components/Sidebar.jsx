import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, BookOpen, LogOut, Guitar,
  ClipboardList, TrendingUp, ClipboardCheck, Settings, RotateCcw,
  Music2, Send, FileText, School, BarChart2, ChevronDown, ChevronUp,
  StickyNote, TableProperties, Euro, MessageSquare, GripVertical, RotateCcw as Reset,
  CalendarDays, X, Brain, Target, Car,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { usePeriod } from '../context/PeriodContext'

// ─── Définition des items de navigation réordonnables ────────────────────────

const sondageLinks = [
  { to: '/admin/envoyer-sondage',  icon: Send,          label: 'Inscription' },
  { to: '/admin/sondages/gerer',   icon: BarChart2,     label: 'Sondages rapides' },
  { to: '/admin/sondages',         icon: FileText,      label: 'Réponses' },
  { to: '/admin/messages',         icon: MessageSquare, label: 'Modèles de messages' },
]

const planningLinks = [
  { to: '/professeur/planning',       icon: Calendar, label: 'Vue du planning' },
  { to: '/admin/planning-intelligent', icon: Brain,    label: 'Planning intelligent' },
]

const ecolesLinks = [
  { to: '/admin/ecoles',            icon: School,          label: 'Créneaux écoles' },
  { to: '/admin/ecoles/liste',      icon: School,          label: 'Écoles et cours particuliers' },
  { to: '/admin/ecoles/comparatif', icon: TableProperties, label: 'Comparatif' },
  { to: '/admin/ecoles/notes',      icon: StickyNote,      label: 'Notes & Événements' },
  { to: '/admin/revenus',           icon: Euro,            label: 'Suivi des revenus' },
  { to: '/admin/deplacements',      icon: Car,             label: 'Déplacements' },
]

const studentLinks = [
  { to: '/eleve',            icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/eleve/exercices',  icon: ClipboardList,   label: 'Mes exercices' },
  { to: '/eleve/progression', icon: TrendingUp,     label: 'Progression' },
  { to: '/eleve/cours',      icon: Calendar,        label: 'Mes cours' },
]

// Items réordonnables (Réglages fixé en bas, non inclus)
const ALL_NAV_ITEMS = [
  { id: 'tableau_de_bord', type: 'link', to: '/professeur',            icon: LayoutDashboard, label: 'Tableau de bord',       end: true },
  { id: 'eleves',          type: 'link', to: '/professeur/eleves',     icon: Users,           label: 'Élèves' },
  { id: 'planning',        type: 'dropdown', label: 'Planning' },
  { id: 'emargement',      type: 'link', to: '/professeur/emargement', icon: ClipboardCheck,  label: 'Émargement' },
  { id: 'groupes',         type: 'link', to: '/professeur/groupes',    icon: Music2,          label: 'Groupes & Répétitions' },
  { id: 'exercices',       type: 'link', to: '/professeur/exercices',  icon: BookOpen,        label: 'Exercices' },
  { id: 'rattrapage',      type: 'link', to: '/professeur/rattrapage', icon: RotateCcw,       label: 'Rattrapage' },
  { id: 'ecoles',          type: 'dropdown', label: 'Écoles' },
  { id: 'sondages',        type: 'dropdown', label: 'Sondages' },
  { id: 'objectifs',       type: 'custom',   label: 'Objectifs & Simulateur' },
]

const DEFAULT_ORDER = ALL_NAV_ITEMS.map((i) => i.id)

function mergeOrder(saved, allIds) {
  const valid   = (saved ?? []).filter((id) => allIds.includes(id))
  const missing = allIds.filter((id) => !valid.includes(id))
  return [...valid, ...missing]
}

// ─── Composants de navigation ─────────────────────────────────────────────────

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to} end={end}
      className={({ isActive }) =>
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' +
        (isActive
          ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
          : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  )
}

function EcolesDropdown() {
  const location = useLocation()
  const isActive = location.pathname.startsWith('/admin/ecoles') || location.pathname.startsWith('/admin/revenus') || location.pathname.startsWith('/admin/deplacements')
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive ? 'text-guitar-400' : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
        }`}
      >
        <div className="flex items-center gap-3">
          <School className="w-4 h-4 shrink-0" />Écoles et cours particuliers
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-border-subtle space-y-0.5">
          {ecolesLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end
              className={({ isActive: a }) =>
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ' +
                (a ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                   : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
              }
            >
              <link.icon className="w-3.5 h-3.5 shrink-0" />{link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function SondagesDropdown({ badges = {} }) {
  const location = useLocation()
  const isActive = location.pathname.startsWith('/admin/sondages')
    || location.pathname.startsWith('/admin/envoyer')
    || location.pathname.startsWith('/admin/messages')
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive ? 'text-guitar-400' : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
        }`}
      >
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 shrink-0" />Messages &amp; Sondages
        </div>
        <div className="flex items-center gap-1.5">
          {/* Badge global visible même dropdown fermé */}
          {!open && badges.sondages > 0 && <NavBadge count={badges.sondages} />}
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-border-subtle space-y-0.5">
          {sondageLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end
              className={({ isActive: a }) =>
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ' +
                (a ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                   : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
              }
            >
              <link.icon className="w-3.5 h-3.5 shrink-0" />
              {link.label}
              {/* Badge sur "Réponses" uniquement (lien vers SurveyResultsPage) */}
              {link.to === '/admin/sondages' && <NavBadge count={badges.sondages} />}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// Objectifs & Simulateur — lien simple depuis la fusion des deux pages
// (ex-dropdown avec 2 sous-liens supprimé, toute la logique est dans ObjectivesPage.jsx)
function ObjectifsNav() {
  return <NavItem to="/admin/objectifs" icon={Target} label="Objectifs & Simulateur" />
}

function PlanningDropdown() {
  const location = useLocation()
  const isActive = location.pathname.startsWith('/professeur/planning')
    || location.pathname.startsWith('/admin/planning-intelligent')
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive ? 'text-guitar-400' : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
        }`}
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 shrink-0" />Planning
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-border-subtle space-y-0.5">
          {planningLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end
              className={({ isActive: a }) =>
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ' +
                (a ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                   : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
              }
            >
              <link.icon className="w-3.5 h-3.5 shrink-0" />{link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Compteurs de badges pour les éléments de navigation ─────────────────────

// Requêtes COUNT uniquement (head:true → aucune ligne transférée).
// RLS garantit que chaque professeur ne voit que ses propres données.
function useBadges(userId) {
  const [badges, setBadges] = useState({ sondages: 0, rattrapage: 0 })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      supabase
        .from('survey_responses')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'attente'),
      supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', userId)
        .eq('status', 'annule_prof'),
    ]).then(([sondResp, rattResp]) => {
      if (cancelled) return
      setBadges({
        sondages:   sondResp.count  ?? 0,
        rattrapage: rattResp.count  ?? 0,
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  return badges
}

// Badge numérique affiché sur un item de nav
function NavBadge({ count }) {
  if (!count) return null
  return (
    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-guitar-600 text-white text-[10px] font-bold px-1">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── Sidebar enseignant avec drag-and-drop ────────────────────────────────────

function TeacherNav({ userId }) {
  const badges = useBadges(userId)
  const [orderedIds, setOrderedIds] = useState(DEFAULT_ORDER)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [loaded, setLoaded]         = useState(false)

  // Refs pour le drag (évite des re-renders pendant le glissement)
  const dragRef = useRef({
    isDragging: false,
    willDrag:   false,
    pointerId:  null,
    pointerType: null,
    sourceId:   null,
    startX:     0,
    startY:     0,
    timer:      null,
    currentOverId: null,
  })

  // Chargement de l'ordre depuis Supabase
  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('sidebar_order')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.sidebar_order) {
          setOrderedIds(mergeOrder(data.sidebar_order, DEFAULT_ORDER))
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [userId])

  const saveOrder = useCallback(async (ids) => {
    if (!userId) return
    await supabase.from('profiles').update({ sidebar_order: ids }).eq('id', userId)
  }, [userId])

  const resetOrder = async () => {
    setOrderedIds(DEFAULT_ORDER)
    await saveOrder(DEFAULT_ORDER)
  }

  // ── Logique drag-and-drop (pointer events) ───────────────────────────────

  function applyDrop(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return
    setOrderedIds((prev) => {
      const next = prev.filter((id) => id !== sourceId)
      const idx  = next.indexOf(targetId)
      next.splice(idx, 0, sourceId)
      return next
    })
  }

  function cleanupDrag() {
    const ds = dragRef.current
    if (ds.timer) { clearTimeout(ds.timer); ds.timer = null }
    ds.isDragging  = false
    ds.willDrag    = false
    ds.sourceId    = null
    ds.pointerId   = null
    ds.currentOverId = null
    setDraggingId(null)
    setDragOverId(null)
  }

  function handlePointerDown(e, id) {
    // Ignorer les clics secondaires (bouton droit, etc.)
    if (e.button !== undefined && e.button !== 0) return
    const ds = dragRef.current
    ds.sourceId    = id
    ds.pointerId   = e.pointerId
    ds.pointerType = e.pointerType
    ds.startX      = e.clientX
    ds.startY      = e.clientY
    ds.isDragging  = false
    ds.willDrag    = false

    // Souris : démarrage immédiat au premier mouvement
    // Touch / stylet : démarrage après 400 ms de maintien
    const delay = e.pointerType === 'mouse' ? 0 : 400
    if (delay === 0) {
      ds.willDrag = true
    } else {
      ds.timer = setTimeout(() => {
        ds.willDrag = true
        navigator.vibrate?.(50)
      }, delay)
    }
  }

  function handlePointerMove(e, id) {
    const ds = dragRef.current
    if (!ds.sourceId) return

    const dx = Math.abs(e.clientX - ds.startX)
    const dy = Math.abs(e.clientY - ds.startY)

    // Si l'utilisateur bouge avant le long-press (touch), annuler
    if (!ds.isDragging && !ds.willDrag && (dx > 8 || dy > 8)) {
      cleanupDrag()
      return
    }

    // Démarrage du drag
    if (ds.willDrag && !ds.isDragging && (dx > 4 || dy > 4 || ds.pointerType === 'touch')) {
      ds.isDragging = true
      e.currentTarget.setPointerCapture(ds.pointerId)
      setDraggingId(ds.sourceId)
    }

    if (!ds.isDragging) return

    // Trouver l'élément sous le curseur
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const wrapper = el?.closest('[data-navid]')
    const targetId = wrapper?.dataset?.navid ?? null
    if (targetId !== ds.currentOverId) {
      ds.currentOverId = targetId
      setDragOverId(targetId)
    }
  }

  function handlePointerUp(e) {
    const ds = dragRef.current
    const { sourceId, currentOverId, isDragging } = ds
    cleanupDrag()
    if (isDragging && sourceId && currentOverId && sourceId !== currentOverId) {
      setOrderedIds((prev) => {
        const next = prev.filter((id) => id !== sourceId)
        const idx  = next.indexOf(currentOverId)
        if (idx === -1) return prev
        next.splice(idx, 0, sourceId)
        saveOrder(next)
        return next
      })
    }
  }

  function handlePointerCancel() {
    cleanupDrag()
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  const orderedItems = orderedIds
    .map((id) => ALL_NAV_ITEMS.find((item) => item.id === id))
    .filter(Boolean)

  if (!loaded) return null

  return (
    <div className="space-y-0.5">
      {orderedItems.map((item) => {
        const isDragging = draggingId === item.id
        const isOver     = dragOverId === item.id && !isDragging

        return (
          <div
            key={item.id}
            data-navid={item.id}
            onPointerDown={(e) => handlePointerDown(e, item.id)}
            onPointerMove={(e) => handlePointerMove(e, item.id)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
              opacity:   isDragging ? 0.45 : 1,
              transform: isDragging ? 'scale(0.97)' : 'scale(1)',
              transition: 'opacity 0.15s, transform 0.15s',
              borderTop: isOver ? '2px solid var(--guitar-600, #c084fc)' : '2px solid transparent',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: dragRef.current.isDragging ? 'none' : 'auto',
            }}
          >
            <div className={`relative group ${draggingId ? 'cursor-grabbing' : 'cursor-default'}`}>
              {/* Poignée de drag — visible au survol */}
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 opacity-0 group-hover:opacity-40 transition-opacity"
                style={{ touchAction: 'none' }}
              >
                <GripVertical className="w-3 h-3 text-muted" />
              </div>

              {item.type === 'link' && item.id === 'rattrapage' ? (
                <NavLink
                  to={item.to} end={item.end}
                  className={({ isActive }) =>
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' +
                    (isActive
                      ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                  <NavBadge count={badges.rattrapage} />
                </NavLink>
              ) : item.type === 'link' ? (
                <NavItem to={item.to} icon={item.icon} label={item.label} end={item.end} />
              ) : null}
              {item.id === 'ecoles' && <EcolesDropdown />}
              {item.id === 'sondages' && <SondagesDropdown badges={badges} />}
              {item.id === 'planning' && <PlanningDropdown />}
              {item.id === 'objectifs' && <ObjectifsNav />}
            </div>
          </div>
        )
      })}

      {/* Bouton réinitialiser l'ordre */}
      <button
        type="button" onClick={resetOrder}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-muted-foreground hover:bg-surface-overlay transition-colors mt-1"
        title="Réinitialiser l'ordre de la navigation"
      >
        <Reset className="w-3 h-3" />
        Réinitialiser l'ordre
      </button>
    </div>
  )
}

// ─── Sélecteur de période ─────────────────────────────────────────────────────

// ─── Génération des listes d'années ──────────────────────────────────────────

function buildSchoolYears() {
  const cur = new Date()
  const curYear = cur.getMonth() + 1 >= 8 ? cur.getFullYear() : cur.getFullYear() - 1
  const maxYear = curYear + 15
  const years = []
  for (let y = 2000; y <= maxYear; y++) years.push(`${y}-${y + 1}`)
  return years // ordre croissant pour les <select>
}

function buildCivilYears() {
  const maxYear = new Date().getFullYear() + 15
  const years = []
  for (let y = 2000; y <= maxYear; y++) years.push(String(y))
  return years
}

const SCHOOL_YEARS_ASC = buildSchoolYears()
const CIVIL_YEARS_ASC  = buildCivilYears()

function periodLabel(period) {
  const { mode, value } = period
  if (mode === 'toutes') return 'Toutes les années'
  if (mode === 'annee_scolaire' || mode === 'annee_civile') {
    if (value && !Array.isArray(value) && value.from && value.to) {
      return value.from === value.to ? value.from : `${value.from} → ${value.to}`
    }
    const arr = Array.isArray(value) ? value : (value ? [value] : [])
    if (!arr.length) return 'Toutes les années'
    if (arr.length === 1) return arr[0]
    return `${arr[0]} → ${arr[arr.length - 1]}`
  }
  if (mode === 'plage_personnalisee' && value?.from) {
    return `${value.from} → ${value.to ?? '…'}`
  }
  return 'Période'
}

// Sélecteur de plage par deux <select> molette
function YearRangeSelect({ years, from, to, onFromChange, onToChange }) {
  const selClass = 'flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-xs outline-none focus:border-guitar-600 appearance-none cursor-pointer'
  return (
    <div className="flex items-center gap-1.5">
      <select value={from} onChange={(e) => onFromChange(e.target.value)} className={selClass}>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <span className="text-xs text-muted shrink-0">→</span>
      <select value={to} onChange={(e) => onToChange(e.target.value)} className={selClass}>
        {years.filter((y) => y >= from).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}

function PeriodSelector() {
  const { period, setPeriod, resetPeriod } = usePeriod()
  const [open, setOpen]             = useState(false)
  const [tab, setTab]               = useState('scolaire')
  const [customFrom, setCustomFrom] = useState(period.value?.from ?? '')
  const [customTo,   setCustomTo]   = useState(period.value?.to   ?? '')

  // Valeurs courantes pour les sélecteurs molette (mode plage)
  const currentScolaire = period.mode === 'annee_scolaire' && period.value && !Array.isArray(period.value)
    ? period.value
    : null
  const currentCivile = period.mode === 'annee_civile' && period.value && !Array.isArray(period.value)
    ? period.value
    : null

  const defaultScolaireFrom = currentScolaire?.from ?? SCHOOL_YEARS_ASC[SCHOOL_YEARS_ASC.length - 2] ?? SCHOOL_YEARS_ASC[0]
  const defaultScolaireYears = SCHOOL_YEARS_ASC.filter((y) => y >= defaultScolaireFrom)
  const defaultScolaireFromYear = SCHOOL_YEARS_ASC[SCHOOL_YEARS_ASC.length - 2] ?? SCHOOL_YEARS_ASC[0]
  const defaultScolaireToYear   = SCHOOL_YEARS_ASC[SCHOOL_YEARS_ASC.length - 1]

  const [scolFrom, setScolFrom] = useState(currentScolaire?.from ?? defaultScolaireFromYear)
  const [scolTo,   setScolTo]   = useState(currentScolaire?.to   ?? defaultScolaireToYear)
  const [civilFrom, setCivilFrom] = useState(currentCivile?.from ?? String(new Date().getFullYear()))
  const [civilTo,   setCivilTo]   = useState(currentCivile?.to   ?? String(new Date().getFullYear()))

  // Garantit que "to" n'est jamais antérieur à "from"
  function handleScolFrom(v) {
    setScolFrom(v)
    if (scolTo < v) setScolTo(v)
  }
  function handleCivilFrom(v) {
    setCivilFrom(v)
    if (civilTo < v) setCivilTo(v)
  }

  function applyRange(mode, from, to) {
    if (!from || !to) return
    const finalTo = to < from ? from : to
    setPeriod(mode, { from, to: finalTo })
    setOpen(false)
  }

  const isActive = period.mode !== 'toutes'
  const label    = periodLabel(period)

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
          isActive
            ? 'bg-guitar-600/15 border border-guitar-600/25 text-guitar-400'
            : 'bg-surface-raised border border-border-subtle text-muted-foreground hover:text-foreground'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <span
              role="button" tabIndex={0}
              onClick={(e) => { e.stopPropagation(); resetPeriod() }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), resetPeriod())}
              className="p-0.5 rounded hover:bg-guitar-600/20" title="Réinitialiser"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-border-subtle rounded-xl shadow-xl overflow-hidden">
          {/* Onglets */}
          <div className="flex border-b border-border-subtle">
            {[
              { key: 'scolaire', label: 'Scolaire' },
              { key: 'civile',   label: 'Civile' },
              { key: 'plage',    label: 'Plage' },
            ].map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? 'text-guitar-400 border-b-2 border-guitar-600'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2">
            {tab === 'scolaire' && (
              <>
                <p className="text-xs text-muted-foreground">De l'année scolaire… à l'année scolaire…</p>
                <YearRangeSelect
                  years={SCHOOL_YEARS_ASC}
                  from={scolFrom} to={scolTo}
                  onFromChange={handleScolFrom}
                  onToChange={setScolTo}
                />
                <button type="button"
                  onClick={() => applyRange('annee_scolaire', scolFrom, scolTo)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400 hover:bg-guitar-600/20 transition-colors"
                >
                  Appliquer
                </button>
              </>
            )}

            {tab === 'civile' && (
              <>
                <p className="text-xs text-muted-foreground">De l'année civile… à l'année civile…</p>
                <YearRangeSelect
                  years={CIVIL_YEARS_ASC}
                  from={civilFrom} to={civilTo}
                  onFromChange={handleCivilFrom}
                  onToChange={setCivilTo}
                />
                <button type="button"
                  onClick={() => applyRange('annee_civile', civilFrom, civilTo)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400 hover:bg-guitar-600/20 transition-colors"
                >
                  Appliquer
                </button>
              </>
            )}

            {tab === 'plage' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Plage de dates précise (jour par jour)</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-surface-raised border border-border-subtle text-xs outline-none focus:border-guitar-600" />
                  <span className="text-xs text-muted">→</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-surface-raised border border-border-subtle text-xs outline-none focus:border-guitar-600" />
                </div>
                {customFrom && customTo && (
                  <button type="button"
                    onClick={() => { setPeriod('plage_personnalisee', { from: customFrom, to: customTo }); setOpen(false) }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400 hover:bg-guitar-600/20 transition-colors"
                  >
                    Appliquer cette plage
                  </button>
                )}
              </div>
            )}

            {/* Réinitialiser */}
            <button type="button"
              onClick={() => { resetPeriod(); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-surface-overlay transition-colors"
            >
              Toutes les années (réinitialiser)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar principale ───────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, logout, isTeacher } = useAuth()

  return (
    // sticky + h-screen : hauteur fixe = section Réglages toujours visible quelle que soit la longueur du contenu principal
    <aside className="w-64 shrink-0 flex flex-col sticky top-0 h-screen border-r border-border-subtle bg-surface/50">
      {/* En-tête */}
      <div className="p-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl guitar-gradient flex items-center justify-center shadow-lg shadow-guitar-600/20">
            <Guitar className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display text-lg leading-tight">Hub du Guitariste</p>
            <p className="text-xs text-muted capitalize">{isTeacher ? 'Espace professeur' : 'Espace élève'}</p>
          </div>
        </div>
      </div>

      {/* Sélecteur de période — hors du nav scrollable pour que son dropdown
          ne soit pas rogné par overflow-y-auto */}
      {isTeacher && (
        <div className="px-4 pt-3 pb-2 border-b border-border-subtle">
          <PeriodSelector />
        </div>
      )}

      {/* Navigation scrollable */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {isTeacher ? (
          <TeacherNav userId={user?.id} />
        ) : (
          <div className="space-y-0.5">
            {studentLinks.map((link) => <NavItem key={link.to} {...link} />)}
          </div>
        )}
      </nav>

      {/* Bas : Réglages + infos + déconnexion */}
      <div className="p-4 border-t border-border-subtle space-y-1">
        {isTeacher && (
          <NavLink
            to="/professeur/reglages"
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' +
              (isActive
                ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
            }
          >
            <Settings className="w-4 h-4 shrink-0" />Réglages
          </NavLink>
        )}
        <div className="px-3 py-1">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted truncate">{user?.email}</p>
        </div>
        <button
          type="button" onClick={logout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-guitar-400 hover:bg-guitar-600/10 transition-all"
        >
          <LogOut className="w-4 h-4" />Déconnexion
        </button>
      </div>
    </aside>
  )
}
