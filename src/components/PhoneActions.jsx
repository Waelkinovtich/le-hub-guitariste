import { Phone, MessageSquare } from 'lucide-react'
import LongPressMenu from './LongPressMenu'

// Ne garde que chiffres et "+" pour les liens tel:/sms: — l'affichage à
// l'écran, lui, reste le numéro tel que saisi (espaces, points, etc.).
function nettoyerNumero(numero) {
  return numero.replace(/[^\d+]/g, '')
}

// Indicatif France métropolitaine — la quasi-totalité des numéros de l'app
// sont saisis au format local (06 XX XX XX XX ou 04 XX XX XX XX).
const INDICATIF_FRANCE = '+33'

// CAUSE RÉELLE DU BUG SMS : sms: est nettement moins tolérant que tel: sur
// les appareils Apple. tel: fonctionne même avec un numéro local, car l'app
// Téléphone applique elle-même les règles de numérotation nationale. Le lien
// sms:, lui, résout mal — voire ignore silencieusement — un numéro local sans
// indicatif international, alors qu'il fonctionne de façon fiable au format
// E.164 (+33...). L'ancienne version nettoyait le numéro (espaces retirés)
// mais ne l'internationalisait jamais : le tel: "marchait par chance", le
// sms: échouait silencieusement. Convertit donc systématiquement en E.164
// pour les deux liens.
function versFormatInternational(numeroNettoye) {
  if (numeroNettoye.startsWith('+')) return numeroNettoye
  if (numeroNettoye.startsWith('0')) return INDICATIF_FRANCE + numeroNettoye.slice(1)
  return numeroNettoye
}

/**
 * Numéro de téléphone affiché tel quel. Un appui long (~500 ms, voir
 * useLongPressAction) propose "Appeler" / "Envoyer un SMS" — un tap simple ne
 * déclenche rien, pour éviter tout appel accidentel. À insérer là où un
 * numéro est déjà affiché (aucune icône ni libellé fournis par défaut).
 */
export default function PhoneActions({ number }) {
  if (!number) return null
  const numeroLien = versFormatInternational(nettoyerNumero(number))

  return (
    <LongPressMenu
      label={number}
      title="Maintenir pour appeler ou envoyer un SMS"
      actions={[
        { href: `tel:${numeroLien}`, label: 'Appeler', icon: Phone },
        { href: `sms:${numeroLien}`, label: 'Envoyer un SMS', icon: MessageSquare },
      ]}
    />
  )
}
