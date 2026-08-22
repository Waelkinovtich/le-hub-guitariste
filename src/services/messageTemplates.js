import { supabase } from '../lib/supabase'

const SELECT = 'id, teacher_id, title, content, audience_type, created_at, updated_at'

export async function fetchTemplates(teacherId) {
  const { data, error } = await supabase
    .from('message_templates')
    .select(SELECT)
    .eq('teacher_id', teacherId)
    .order('title')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createTemplate(teacherId, { title, content, audience_type }) {
  const { data, error } = await supabase
    .from('message_templates')
    .insert({ teacher_id: teacherId, title: title.trim(), content, audience_type: audience_type || null })
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateTemplate(id, { title, content, audience_type }) {
  const { data, error } = await supabase
    .from('message_templates')
    .update({ title: title.trim(), content, audience_type: audience_type || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('message_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Remplace les variables {prenom}, {nom}, {ecole}, {jour}, {heure}, {duree}
// par les données de l'élève fourni.
export function applyVariables(content, student) {
  if (!content || !student) return content
  const map = {
    '{prenom}': student.firstName  ?? student.first_name  ?? '',
    '{nom}':    student.lastName   ?? student.last_name   ?? '',
    '{ecole}':  student.schoolName ?? student.school_name ?? '',
    '{jour}':   '',
    '{heure}':  '',
    '{duree}':  '',
  }
  return content.replace(/\{[^}]+\}/g, (match) => map[match] ?? match)
}

export const AUDIENCE_TYPES = [
  { value: 'eleve_tutoiement',    label: 'Élève (tutoiement)' },
  { value: 'parents_vouvoiement', label: 'Parents (vouvoiement)' },
  { value: 'groupe_vouvoiement',  label: "Groupe d'élèves (vouvoiement)" },
]

// Formule de clôture paramétrée — le prénom vient de useAuth() côté appelant
export function getClosingFormula(audienceType, firstName) {
  const prénom = firstName ?? 'Votre professeur'
  const formules = {
    eleve_tutoiement:    `Porte-toi bien, à bientôt !\n${prénom}`,
    parents_vouvoiement: `Portez-vous bien, à bientôt !\n${prénom}`,
    groupe_vouvoiement:  `Portez-vous bien, à bientôt !\n${prénom}`,
  }
  return formules[audienceType] ?? `À bientôt !\n${prénom}`
}

export const REGISTER_HINT = {
  eleve_tutoiement:    "Registre tutoiement — message destiné directement à l'élève.",
  parents_vouvoiement: 'Registre vouvoiement — message destiné aux parents.',
  groupe_vouvoiement:  "Registre vouvoiement — message destiné à un groupe d'élèves.",
}

// Variables qui font référence à un élève individuel (incompatibles avec envoi groupé non personnalisé)
export const INDIVIDUAL_VARS = ['{prenom}', '{nom}']
