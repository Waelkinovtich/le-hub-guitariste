import { supabase } from '../lib/supabase'

// Barème kilométrique URSSAF 2025 — valeurs indicatives, non contractuelles
// Source : https://www.urssaf.fr/portail/home/taux-et-baremes/baremes-indemnites-kilome.html
export const DEFAULT_RATES = [
  { vehicle_type: 'voiture', fiscal_cv: 3, rate_per_km: 0.529, label: 'Barème URSSAF 2025 – 3 CV', year: 2025 },
  { vehicle_type: 'voiture', fiscal_cv: 4, rate_per_km: 0.606, label: 'Barème URSSAF 2025 – 4 CV', year: 2025 },
  { vehicle_type: 'voiture', fiscal_cv: 5, rate_per_km: 0.636, label: 'Barème URSSAF 2025 – 5 CV', year: 2025 },
  { vehicle_type: 'voiture', fiscal_cv: 6, rate_per_km: 0.665, label: 'Barème URSSAF 2025 – 6 CV', year: 2025 },
  { vehicle_type: 'voiture', fiscal_cv: 7, rate_per_km: 0.697, label: 'Barème URSSAF 2025 – 7 CV', year: 2025 },
  { vehicle_type: 'deux_roues_motorise', fiscal_cv: null, rate_per_km: 0.395, label: 'Barème URSSAF 2025 – deux-roues motorisé (> 50 cm³)', year: 2025 },
  { vehicle_type: 'velo_electrique',     fiscal_cv: null, rate_per_km: 0.25,  label: 'Barème URSSAF 2025 – vélo électrique (estimation)', year: 2025 },
  { vehicle_type: 'velo',                fiscal_cv: null, rate_per_km: 0.25,  label: 'Forfait vélo – 0,25 €/km (estimation)', year: 2025 },
]

export async function fetchMileageRates(teacherId) {
  const { data, error } = await supabase
    .from('mileage_rates')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('vehicle_type')
    .order('fiscal_cv')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function upsertMileageRate(teacherId, rate) {
  const { id, ...rest } = rate
  const payload = { ...rest, teacher_id: teacherId, updated_at: new Date().toISOString() }
  if (id) {
    const { data, error } = await supabase.from('mileage_rates').update(payload).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return data
  } else {
    const { data, error } = await supabase.from('mileage_rates').insert(payload).select('*').single()
    if (error) throw new Error(error.message)
    return data
  }
}

export async function deleteMileageRate(rateId) {
  const { error } = await supabase.from('mileage_rates').delete().eq('id', rateId)
  if (error) throw new Error(error.message)
}

export async function seedDefaultRates(teacherId) {
  const rows = DEFAULT_RATES.map((r) => ({ ...r, teacher_id: teacherId }))
  const { data, error } = await supabase.from('mileage_rates').insert(rows).select('*')
  if (error) throw new Error(error.message)
  return data ?? []
}
