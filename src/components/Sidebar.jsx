import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, BookOpen, LogOut, Guitar, ClipboardList, TrendingUp, ClipboardCheck, Settings, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const teacherLinks = [
  { to: '/professeur', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/professeur/élèves', icon: Users, label: '\u00c9l\u00e8ves' },
  { to: '/professeur/planning', icon: Calendar, label: 'Planning' },
  { to: '/professeur/emargement', icon: ClipboardCheck, label: '\u00c9margement' },
  { to: '/professeur/exercices', icon: BookOpen, label: 'Exercices' },
  { to: '/professeur/rattrapage', icon: RotateCcw, label: 'Rattrapage' },
  { to: '/professeur/reglages', icon: Settings, label: 'Réglages' },
]

const studentLinks = [
  { to: '/élève', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/élève/exercices', icon: ClipboardList, label: 'Mes exercices' },
  { to: '/élève/progression', icon: TrendingUp, label: 'Progression' },
  { to: '/élève/cours', icon: Calendar, label: 'Mes cours' },
]

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' + (isActive ? 'bg-guitar-600/15 text-guitar-400 border border-guitar-600/25' : 'text-muted-foreground hover:text-foreground hover:bg-surface-overlay')}>
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
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
            <p className="text-xs text-muted capitalize">{isTeacher ? 'Espace professeur' : 'Espace \u00e9l\u00e8ve'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => <NavItem key={link.to} {...link} />)}
      </nav>

      <div className="p-4 border-t border-border-subtle">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted truncate">{user?.email}</p>
        </div>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-guitar-400 hover:bg-guitar-600/10 transition-all">
          <LogOut className="w-4 h-4" />
          D\u00e9connexion
        </button>
      </div>
    </aside>
  )
}
