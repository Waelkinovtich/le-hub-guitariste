import { useState, useEffect, useRef } from 'react'
import { HelpCircle } from 'lucide-react'

/**
 * Icône "?" cliquable affichant une bulle d'aide contextuelle.
 * Déclenchement au clic/tap : fonctionne aussi bien sur souris que sur tactile.
 * La bulle se ferme au clic extérieur ou en recliquant l'icône.
 *
 * Props :
 *   texte   — contenu de la bulle (string)
 *   position — 'top' | 'bottom' | 'left' | 'right' (défaut : 'top')
 */
export default function HelpTooltip({ texte, position = 'top' }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef(null)

  // Ferme la bulle au clic en dehors du composant
  useEffect(() => {
    if (!ouvert) return
    function handleClickDehors(e) {
      if (ref.current && !ref.current.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', handleClickDehors)
    document.addEventListener('touchstart', handleClickDehors)
    return () => {
      document.removeEventListener('mousedown', handleClickDehors)
      document.removeEventListener('touchstart', handleClickDehors)
    }
  }, [ouvert])

  // Classes de positionnement de la bulle selon la prop position
  const POSITION_CLS = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <span ref={ref} className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-4 h-4 text-muted-foreground/50 hover:text-guitar-400 transition-colors focus:outline-none"
        aria-label="Aide"
        aria-expanded={ouvert}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {ouvert && (
        <span
          role="tooltip"
          className={
            'absolute z-50 w-64 px-3 py-2.5 rounded-xl bg-surface-overlay border border-border-subtle ' +
            'text-xs text-muted-foreground shadow-lg leading-relaxed whitespace-normal ' +
            (POSITION_CLS[position] ?? POSITION_CLS.top)
          }
        >
          {texte}
        </span>
      )}
    </span>
  )
}
