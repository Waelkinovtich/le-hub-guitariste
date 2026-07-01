import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, BookOpen, LogOut, Guitar, ClipboardList, TrendingUp, ClipboardCheck, Settings, RotateCcw, Music2, Send, FileText, School, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const teacherLinks = [
  { to: '/professeur', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/professeur/eleves', icon: Users, label: 'Élèves' },
  { to: '/professeur/planning', icon: Calendar, label: 'Planning' },
  { to: '/professeur/emargement', icon: ClipboardCheck, label: 'Émargement' },
  { to: '/professeur/groupes', icon: Music2, label: 'Groupes & Répétitions' },
  { to: '/professeur/exercices', icon: BookOpen, label: 'Exercices' },
  { to: '/professeur/rattrapage', icon: RotateCcw, label: 'Rattrapage' },
  { to: '/professeur/reglages', icon: Settings, label: 'Réglages' },
]

const sondageLinks = [
  { to: '/admin/envoyer-sondage', icon: Send, label: 'Inscription' },
  { to: '/admin/sondages/gerer', icon: BarChart2, label: 'Sondages rapides' },
  { to: '/admin/sondages', icon: FileText, label: 'Réponses' },
  { to: '/admin/ecoles', icon: School, label: 'Config écoles' },
]

const studentLinks = [
  { to: '/eleve', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/eleve/exercices', icon: ClipboardList, label: 'Mes exercices' },
  { to: '/eleve/progression', icon: TrendingUp, label: 'Progression' },
  { to: '/eleve/cours', icon: Calendar, label: 'Mes cours' },
]

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
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

function SondagesDropdown() {
  const location = useLocation()
  const isActive = location.pathname.startsWith('/admin')
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'text-guitar-400'
            : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay'
        }`}
      >
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 shrink-0" />
          Sondages
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-border-subtle space-y-0.5">
          {sondageLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) =>
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ' +
                (isActive
                  ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')
              }
            >
              <link.icon className="w-3.5 h-3.5 shrink-0" />
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { user, logout, isTeacher } = useAuth()
  const links = isTeacher ? teacherLinks : studentLinks

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-border-subtle bg-surface/50">
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

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map(link => <NavItem key={link.to} {...link} />)}
        {isTeacher && <SondagesDropdown />}
      </nav>

      <div className="p-4 border-t border-border-subtle">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted truncate">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-guitar-400 hover:bg-guitar-600/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
