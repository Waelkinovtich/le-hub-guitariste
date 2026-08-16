import { useCallback, useRef, useState } from 'react'

// Seuil communément retenu pour distinguer un appui long d'un tap (ni trop
// court — risque de déclenchement accidentel au simple tap/scroll —, ni trop
// long — l'action semblerait ne pas répondre).
const DUREE_APPUI_LONG_MS = 500

/**
 * Détecte un appui long (~500 ms) sans librairie externe, via les événements
 * pointer (fonctionnent aussi bien à la souris qu'au tactile). Un tap simple
 * — relâché avant le seuil — ou un pointeur qui quitte la zone ne déclenche
 * rien : seul un maintien suffisamment long ouvre le menu d'actions.
 *
 * Réutilisé par PhoneActions et EmailActions (via LongPressMenu) pour un
 * comportement identique entre téléphone et email.
 */
export function useLongPressAction() {
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  const onPointerDown = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => setOpen(true), DUREE_APPUI_LONG_MS)
  }, [clearTimer])

  return {
    open,
    close:    () => setOpen(false),
    // Ouverture immédiate — utilisée par la navigation clavier (Enter/Espace)
    // pour éviter d'attendre le timeout de 500 ms conçu pour les pointeurs.
    openNow:  () => setOpen(true),
    triggerProps: {
      onPointerDown,
      onPointerUp:    clearTimer,
      onPointerLeave: clearTimer,
      onPointerCancel: clearTimer,
    },
  }
}
