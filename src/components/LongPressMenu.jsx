import { useEffect } from 'react'
import { useLongPressAction } from '../hooks/useLongPressAction'

/**
 * Valeur affichée telle quelle (numéro, email…) ; un appui long (voir
 * useLongPressAction) ouvre un petit menu d'actions ancré juste en dessous.
 * Un tap/clic simple ne déclenche rien — évite tout appel ou email envoyé
 * par accident.
 *
 * Accessibilité clavier : Enter ou Espace ouvrent le menu (même comportement
 * que l'appui long) ; Échap ferme le menu ouvert.
 */
export default function LongPressMenu({ label, title, actions }) {
  const { open, close, openNow, triggerProps } = useLongPressAction()

  // Fermeture au clavier (Échap) — sans empêcher la propagation vers le document
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  function handleKeyDownTrigger(e) {
    // Enter ou Espace : ouvre le menu (équivalent de l'appui long pour le clavier)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      // Ouverture immédiate sans timer (contrairement au pointer qui attend 500 ms)
      if (!open) openNow()
    }
    if (e.key === 'Escape' && open) close()
  }

  return (
    <span className="relative inline-block">
      {/* Le span trigger est rendu focusable et actionnable au clavier */}
      <span
        {...triggerProps}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onKeyDown={handleKeyDownTrigger}
        className="cursor-default select-none focus:outline-none focus-visible:underline focus-visible:text-guitar-400"
      >
        {label}
      </span>

      {open && (
        <>
          {/* Fond invisible plein écran : ferme le menu au clic/tap ailleurs */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <span
            role="menu"
            className="absolute z-50 top-full left-0 mt-1 flex flex-col rounded-lg border border-border-subtle bg-surface-raised shadow-lg overflow-hidden whitespace-nowrap"
          >
            {actions.map(({ href, label: actionLabel, icon: Icon }, i) => (
              <a
                key={href}
                href={href}
                role="menuitem"
                onClick={close}
                className={
                  'flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-surface-overlay transition-colors ' +
                  'focus:outline-none focus-visible:bg-surface-overlay ' +
                  (i > 0 ? 'border-t border-border-subtle' : '')
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {actionLabel}
              </a>
            ))}
          </span>
        </>
      )}
    </span>
  )
}
