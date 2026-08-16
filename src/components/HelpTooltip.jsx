import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

// Largeur fixe de la bulle (correspond à w-64 = 256 px)
const BULLE_W = 256
// Hauteur estimée de la bulle (conservatrice — sert uniquement au flip préventif)
const BULLE_H = 100
// Marge minimale entre la bulle et les bords du viewport
const MARGE_BORD = 8
// Espace entre l'ancre (icône) et la bulle
const GAP = 8

/**
 * Calcule les coordonnées fixed (viewport) de la bulle en tenant compte
 * d'un flip automatique si la bulle sortirait du viewport dans la direction préférée.
 */
function calculerCoords(rect, positionPréférée) {
  const W = window.innerWidth
  const H = window.innerHeight

  // Coordonnées candidates pour chaque direction (positionnement fixed)
  const candidats = {
    top:    { top: rect.top  - BULLE_H - GAP, left: rect.left + rect.width / 2 - BULLE_W / 2 },
    bottom: { top: rect.bottom + GAP,          left: rect.left + rect.width / 2 - BULLE_W / 2 },
    left:   { top: rect.top  + rect.height / 2 - BULLE_H / 2, left: rect.left  - BULLE_W - GAP },
    right:  { top: rect.top  + rect.height / 2 - BULLE_H / 2, left: rect.right + GAP },
  }

  // Flip si débordement dans la direction préférée
  let pos = positionPréférée
  if (pos === 'top'    && candidats.top.top < MARGE_BORD)                      pos = 'bottom'
  if (pos === 'bottom' && candidats.bottom.top + BULLE_H > H - MARGE_BORD)    pos = 'top'
  if (pos === 'left'   && candidats.left.left < MARGE_BORD)                    pos = 'right'
  if (pos === 'right'  && candidats.right.left + BULLE_W > W - MARGE_BORD)    pos = 'left'

  const coord = { ...candidats[pos] }
  // Clamp horizontal pour ne jamais déborder de l'écran
  coord.left = Math.max(MARGE_BORD, Math.min(coord.left, W - BULLE_W - MARGE_BORD))
  // Clamp vertical
  coord.top  = Math.max(MARGE_BORD, Math.min(coord.top,  H - BULLE_H - MARGE_BORD))

  return coord
}

/**
 * Icône "?" cliquable affichant une bulle d'aide contextuelle via portal.
 * Le portal ancre la bulle dans document.body (positionnement fixed) :
 * elle ne peut donc jamais être coupée par un conteneur parent ou la
 * barre de navigation, quel que soit l'endroit de l'écran.
 *
 * Props :
 *   texte    — contenu de la bulle (string)
 *   position — direction préférée : 'top' | 'bottom' | 'left' | 'right' (défaut : 'top')
 *              Flip automatique si la bulle sortirait du viewport.
 */
export default function HelpTooltip({ texte, position = 'top' }) {
  const [ouvert, setOuvert]   = useState(false)
  const [coords, setCoords]   = useState({ top: 0, left: 0 })
  const btnRef     = useRef(null)
  const bulleRef   = useRef(null)

  const fermer = useCallback(() => setOuvert(false), [])

  function ouvrir() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setCoords(calculerCoords(rect, position))
    }
    setOuvert(true)
  }

  function toggleOuvert() {
    ouvert ? fermer() : ouvrir()
  }

  // Fermeture au clic extérieur (bouton ET bulle exclus) et touche Échap
  useEffect(() => {
    if (!ouvert) return

    function handleClickDehors(e) {
      const dansBouton = btnRef.current?.contains(e.target)
      const dansBulle  = bulleRef.current?.contains(e.target)
      if (!dansBouton && !dansBulle) fermer()
    }

    function handleÉchap(e) {
      if (e.key === 'Escape') { fermer(); btnRef.current?.focus() }
    }

    document.addEventListener('mousedown',  handleClickDehors)
    document.addEventListener('touchstart', handleClickDehors)
    document.addEventListener('keydown',    handleÉchap)
    return () => {
      document.removeEventListener('mousedown',  handleClickDehors)
      document.removeEventListener('touchstart', handleClickDehors)
      document.removeEventListener('keydown',    handleÉchap)
    }
  }, [ouvert, fermer])

  return (
    <span className="inline-flex items-center shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOuvert}
        className="w-4 h-4 text-muted-foreground/50 hover:text-guitar-400 transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-guitar-400 rounded"
        aria-label="Aide"
        aria-expanded={ouvert}
        aria-haspopup="true"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {ouvert && createPortal(
        <span
          ref={bulleRef}
          role="tooltip"
          style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999 }}
          className="w-64 px-3 py-2.5 rounded-xl bg-surface-overlay border border-border-subtle
                     text-xs text-muted-foreground shadow-lg leading-relaxed whitespace-normal"
        >
          {texte}
        </span>,
        document.body
      )}
    </span>
  )
}
