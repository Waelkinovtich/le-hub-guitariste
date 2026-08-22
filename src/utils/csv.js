/**
 * Génère et télécharge un fichier CSV depuis le navigateur (aucun serveur).
 * BOM UTF-8 (﻿) ajouté pour la compatibilité avec Excel / LibreOffice.
 *
 * @param {Array<Array<string|number|null>>} lignes — tableau de lignes, chaque ligne = tableau de cellules
 * @param {string} nomFichier — nom du fichier téléchargé (ex: "revenus-2026.csv")
 */
export function téléchargerCSV(lignes, nomFichier) {
  const csv = lignes
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}
