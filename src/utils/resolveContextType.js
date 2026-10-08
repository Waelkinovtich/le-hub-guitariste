/**
 * Résout le context_type d'un cours à partir du type d'élève.
 *
 * @test resolveContextType({ lesson_type: 'ecole' })       === 'ecole'
 * @test resolveContextType({ lesson_type: 'particulier' }) === 'cesu'
 * @test resolveContextType({ lesson_type: null })          === null
 * @test resolveContextType(null)                           === null
 *
 * Règle métier : tous les élèves particuliers de ce professeur sont en CESU.
 * La colonne context_type de lessons n'est pas modifiée ici — seule la valeur
 * à insérer à la création est résolue.
 */
export function resolveContextType(student) {
  if (!student) return null
  if (student.lesson_type === 'ecole') return 'ecole'
  if (student.lesson_type === 'particulier') return 'cesu'
  return null
}
