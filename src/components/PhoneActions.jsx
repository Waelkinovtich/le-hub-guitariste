import { Phone, MessageSquare } from 'lucide-react'

// Ne garde que chiffres et "+" pour les liens tel:/sms: — l'affichage à
// l'écran, lui, reste le numéro tel que saisi (espaces, points, etc.).
function nettoyerNumeroPourLien(numero) {
  return numero.replace(/[^\d+]/g, '')
}

/**
 * Numéro de téléphone affiché tel quel, accompagné de deux liens discrets
 * (appeler, SMS). À insérer là où un numéro est déjà affiché — ne fournit ni
 * icône de contact ni libellé, pour rester composable dans n'importe quelle
 * mise en page existante (liste, ligne de fiche, tableau…).
 *
 * Volontairement discret (icônes petites, gris neutre) plutôt qu'en boutons
 * proéminents : sur un poste de travail (Mac) sans app Téléphone/Messages
 * configurée, un clic ne fait rien de visible — des icônes très visibles
 * donneraient l'impression d'être cassées. Les liens restent cliquables et
 * fonctionnent normalement sur les appareils qui savent les ouvrir (iPhone,
 * Mac avec Reprise d'appel/Continuity activée…).
 */
export default function PhoneActions({ number }) {
  if (!number) return null
  const numeroPourLien = nettoyerNumeroPourLien(number)

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{number}</span>
      <a
        href={`tel:${numeroPourLien}`}
        title="Appeler"
        className="p-0.5 rounded text-muted hover:text-guitar-400 transition-colors"
      >
        <Phone className="w-3.5 h-3.5" />
      </a>
      <a
        href={`sms:${numeroPourLien}`}
        title="Envoyer un SMS"
        className="p-0.5 rounded text-muted hover:text-guitar-400 transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </a>
    </span>
  )
}
