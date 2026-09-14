// ─── Tri chronologique des créneaux horaires ──────────────────────────────────
// Format attendu : "HH:MM–HH:MM" (ex : "09:00–09:15", "17:30–18:00").
// Un tri lexicographique serait incorrect : "9:00" > "17:00" alphabétiquement,
// d'où la conversion en minutes depuis minuit comme clé de tri.

/**
 * Convertit le début d'un créneau "HH:MM–HH:MM" en minutes depuis minuit.
 * Pur et sans effet de bord.
 */
export function slotStartMinutes(slot) {
  const [h, m] = slot.split('–')[0].split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Trie un tableau de créneaux "HH:MM–HH:MM" par heure de début croissante.
 * Pur : renvoie un nouveau tableau sans muter l'original.
 */
export function trierSlots(slots) {
  return [...(slots ?? [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b))
}

/**
 * Trie les créneaux à l'intérieur de chaque ligne school_schedule.
 * Pur : renvoie de nouveaux objets sans muter les originaux.
 *
 * @param {Array<{day: string, slots: string[]}>} rows
 * @returns {Array<{day: string, slots: string[]}>}
 */
export function trierSlotsDesLignes(rows) {
  return (rows ?? []).map(row => ({ ...row, slots: trierSlots(row.slots) }))
}
