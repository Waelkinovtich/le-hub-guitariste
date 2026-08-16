import { useState, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import Sidebar from './Sidebar'
import { LoadingBlock } from './DataState'

// Clé localStorage : persiste la préférence sans passer par la base de données
const LS_KEY = 'sidebar_ouverte'

// Largeur de la sidebar en px (doit correspondre à w-64 de Sidebar.jsx)
const SIDEBAR_W = 256

function lirePréférenceSidebar() {
  try { return localStorage.getItem(LS_KEY) !== 'false' }
  // Si localStorage est indisponible (mode privé restrictif), défaut = ouverte
  catch { return true }
}

export default function Layout() {
  const [ouvert, setOuvert] = useState(lirePréférenceSidebar)

  function toggle() {
    setOuvert((v) => {
      const next = !v
      try { localStorage.setItem(LS_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    // h-screen (et non min-h-screen) : borne le conteneur exactement à la hauteur du
    // viewport. Sans cette contrainte, un contenu long fait grandir ce div au-delà du
    // viewport → le body défile → position:sticky de la sidebar est cassé par le
    // overflow:hidden de son wrapper. Avec h-screen, seul <main> défile, jamais le body.
    // overflow-x-hidden : empêche le scroll horizontal causé par la transition de largeur.
    <div className="h-screen flex overflow-x-hidden">
      {/* Wrapper sidebar : transition de largeur → slide vers la gauche */}
      <div
        style={{
          width: ouvert ? SIDEBAR_W : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.3s ease-in-out',
        }}
      >
        <Sidebar />
      </div>

      {/*
        Bouton de bascule — fixed, suit le bord droit de la sidebar.
        Toujours accessible même quand la sidebar est masquée.
        top: 16px (4 * 4 px) pour s'aligner visuellement avec le logo.
      */}
      <button
        type="button"
        onClick={toggle}
        aria-label={ouvert ? 'Réduire la navigation' : 'Afficher la navigation'}
        style={{
          position: 'fixed',
          left: ouvert ? SIDEBAR_W - 40 : 8,
          top: 12,
          zIndex: 60,
          transition: 'left 0.3s ease-in-out',
        }}
        className="w-8 h-8 rounded-lg bg-surface border border-border-subtle
                   flex items-center justify-center
                   text-muted-foreground hover:text-foreground hover:bg-surface-overlay
                   shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-guitar-400"
      >
        {/* Rotation 180° quand sidebar masquée pour indiquer le sens d'ouverture */}
        <PanelLeft
          className="w-4 h-4 transition-transform duration-300"
          style={{ transform: ouvert ? 'rotate(0deg)' : 'rotate(180deg)' }}
        />
      </button>

      {/* Zone de contenu : occupe tout l'espace libéré par la sidebar */}
      <main className="flex-1 overflow-auto min-w-0">
        {/*
          Suspense interne : la sidebar reste visible pendant le chargement
          d'une page chargée en différé (React.lazy). Seul le contenu change.
        */}
        <Suspense fallback={<LoadingBlock />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
