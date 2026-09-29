import { supabase } from '../lib/supabase'

export async function fetchSalaryPayments(teacherId, { from, to } = {}) {
  let q = supabase
    .from('salary_payments')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('received_date', { ascending: false })
  if (from) q = q.gte('received_date', from)
  if (to)   q = q.lte('received_date', to)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createSalaryPayment(teacherId, fields) {
  const { data, error } = await supabase
    .from('salary_payments')
    .insert({ teacher_id: teacherId, ...fields })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteSalaryPayment(id) {
  const { error } = await supabase.from('salary_payments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
