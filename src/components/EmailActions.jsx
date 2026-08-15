import { Mail } from 'lucide-react'
import LongPressMenu from './LongPressMenu'

/**
 * Adresse email affichée telle quelle. Un appui long (~500 ms, voir
 * useLongPressAction) propose "Envoyer un email" — même principe que
 * PhoneActions, pour un comportement cohérent entre les deux types de
 * contact. Un tap simple ne déclenche rien.
 */
export default function EmailActions({ email }) {
  if (!email) return null

  return (
    <LongPressMenu
      label={email}
      title="Maintenir pour envoyer un email"
      actions={[{ href: `mailto:${email}`, label: 'Envoyer un email', icon: Mail }]}
    />
  )
}
