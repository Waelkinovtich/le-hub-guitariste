import { supabase } from '../lib/supabase'
import { currentSchoolYear } from './schools'

export { currentSchoolYear }

export async function fetchIncomeEntries(teacherId, { from, to } = {}) {
  let q = supabase
    .from('income_entries')
    .select('id, school_id, label, amount, hours, entry_date, school_year, notes, created_at, schools(name, structure_type)')
    .eq('teacher_id', teacherId)
    .order('entry_date', { ascending: false })

  if (from) q = q.gte('entry_date', from)
  if (to)   q = q.lte('entry_date', to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({
    ...e,
    school_name:      e.schools?.name           ?? null,
    school_structure: e.schools?.structure_type ?? null,
  }))
}

export async function createIncomeEntry(teacherId, fields) {
  const { data, error } = await supabase
    .from('income_entries')
    .insert({ teacher_id: teacherId, ...fields })
    .select('id, school_id, label, amount, hours, entry_date, school_year, notes, created_at, schools(name, structure_type)')
    .single()
  if (error) throw new Error(error.message)
  return { ...data, school_name: data.schools?.name ?? null, school_structure: data.schools?.structure_type ?? null }
}

export async function updateIncomeEntry(entryId, fields) {
  const { data, error } = await supabase
    .from('income_entries')
    .update(fields)
    .eq('id', entryId)
    .select('id, school_id, label, amount, hours, entry_date, school_year, notes, created_at, schools(name, structure_type)')
    .single()
  if (error) throw new Error(error.message)
  return { ...data, school_name: data.schools?.name ?? null, school_structure: data.schools?.structure_type ?? null }
}

export async function deleteIncomeEntry(entryId) {
  const { error } = await supabase.from('income_entries').delete().eq('id', entryId)
  if (error) throw new Error(error.message)
}
