import { useState, useEffect } from 'react'

const STORAGE_KEY = 'hg_theme'
// Préfixe utilisé pour stocker la couleur du thème personnalisé : "personnalise:#rrggbb"
const CUSTOM_PREFIX = 'personnalise:'

export const THEMES = [
  { value: 'sombre', label: 'Sombre',          description: 'Thème par défaut, fond noir.',           emoji: '🌑' },
  { value: 'clair',  label: 'Clair',            description: 'Fond blanc, adapté à la lumière du jour.', emoji: '☀️' },
  { value: 'rose',   label: 'Rose',             description: 'Fond sombre avec accent rose-fuchsia.',   emoji: '🌸' },
  { value: 'vert',   label: 'Vert cacadois 💩',  description: 'Fond sombre avec accent vert citron.',    emoji: '🌿' },
  { value: 'personnalise', label: 'Personnalisé', description: "Choisissez votre couleur d'accent.",     emoji: '🎨' },
]

/** Extrait la couleur hex d'une valeur de thème personnalisé. */
export function customThemeColor(stored) {
  if (!stored || !stored.startsWith(CUSTOM_PREFIX)) return '#a855f7'
  return stored.slice(CUSTOM_PREFIX.length)
}

function applyTheme(stored) {
  const root = document.documentElement
  if (!stored || stored === 'sombre') {
    root.removeAttribute('data-theme')
    root.style.removeProperty('--color-guitar-600')
    root.style.removeProperty('--color-guitar-700')
    return
  }
  if (stored.startsWith(CUSTOM_PREFIX)) {
    const hex = stored.slice(CUSTOM_PREFIX.length)
    root.setAttribute('data-theme', 'personnalise')
    root.style.setProperty('--color-guitar-600', hex)
    // Couleur légèrement assombrie pour guitar-700 (approximation)
    root.style.setProperty('--color-guitar-700', hex)
    return
  }
  root.removeAttribute('data-theme')
  root.style.removeProperty('--color-guitar-600')
  root.style.removeProperty('--color-guitar-700')
  root.setAttribute('data-theme', stored)
}

/** Retourne la clé courte du thème ('sombre' | 'clair' | 'rose' | 'vert' | 'personnalise'). */
function themeKey(stored) {
  if (!stored) return 'sombre'
  if (stored.startsWith(CUSTOM_PREFIX)) return 'personnalise'
  return stored
}

export function useTheme() {
  const [stored, setStored] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? 'sombre' } catch { return 'sombre' }
  })

  const theme = themeKey(stored)

  useEffect(() => {
    applyTheme(stored)
  }, [stored])

  // Application immédiate au montage (avant le premier render React)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) applyTheme(saved)
  }, [])

  /** Passe à un thème nommé ou personnalisé (value = 'sombre' | 'clair' | 'rose' | 'vert' | 'personnalise:#rrggbb'). */
  const setTheme = (value) => {
    setStored(value)
    try { localStorage.setItem(STORAGE_KEY, value) } catch {}
    applyTheme(value)
  }

  return { theme, stored, setTheme, customColor: customThemeColor(stored) }
}
