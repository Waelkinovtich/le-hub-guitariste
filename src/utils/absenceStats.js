// ─── Référentiel des statuts d'émargement ────────────────────────────────────
// Seuls ces trois statuts signifient que le cours a été traité par l'émargement.
// 'planifie' et 'annule_prof' sont exclus : pas encore émargés ou hors périmètre.
const STATUTS_EMARGEMENT = new Set(['present', 'absent', 'excuse'])

// Parmi les cours émargés, ces deux statuts constituent une absence élève.
const STATUTS_ABSENCE = new Set(['absent', 'excuse'])

/**
 * Calcule le taux d'absence à partir d'une liste de cours.
 *
 * Formule : (absent + excuse) / (present + absent + excuse) × 100
 * Les cours non émargés (planifie, annule_prof, …) n'entrent pas au dénominateur.
 *
 * Utilisable pour un élève seul ou pour l'ensemble des élèves d'un professeur.
 *
 * @param {Array}       lessons   - Cours (champ `status` requis ;
 *                                  `lessonDate` ou `lesson_date` pour le filtre de date).
 * @param {string|null} dateDebut - Borne inférieure ISO "YYYY-MM-DD" (incluse). null = sans borne.
 * @param {string|null} dateFin   - Borne supérieure ISO "YYYY-MM-DD" (incluse). null = sans borne.
 * @returns {{ taux: number|null, nbCours: number, nbAbsences: number }}
 *   `taux` est null quand aucun cours n'est encore émargé
 *   (distingue "0 % d'absence" de "aucune donnée").
 */
export function calculerTauxAbsence(lessons, dateDebut = null, dateFin = null) {
  // Filtrage par plage de dates si au moins une borne est fournie
  const dansPeriode = (dateDebut || dateFin)
    ? lessons.filter((l) => {
        const d = l.lessonDate ?? l.lesson_date
        if (!d) return false
        if (dateDebut && d < dateDebut) return false
        if (dateFin   && d > dateFin)   return false
        return true
      })
    : lessons

  // Dénominateur : cours réellement émargés
  const emarks     = dansPeriode.filter((l) => STATUTS_EMARGEMENT.has(l.status))
  const nbCours    = emarks.length
  const nbAbsences = emarks.filter((l) => STATUTS_ABSENCE.has(l.status)).length

  // null quand nbCours = 0 : évite d'afficher "0 %" en l'absence de données
  const taux = nbCours > 0 ? Math.round((nbAbsences / nbCours) * 100) : null

  return { taux, nbCours, nbAbsences }
}
