import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { X, Search } from 'lucide-react'

export default function AddMemberModal({ groupId, onClose, onAdded }) {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('eleve')
  const [freeForm, setFreeForm] = useState({ first_name: '', last_name: '', instrument: '', school: '' })
  const [saving, setSaving] = useState(false)
  const [addErr, setAddErr] = useState(null)

  // eslint-disable-next-line no-use-before-define
  useEffect(() => { fetchStudents() }, [])

  async function fetchStudents() {
    const { data } = await supabase.from('students').select('id, first_name, last_name, instrument, school_name').order('first_name')
    setStudents(data || [])
  }

  async function addStudent(student) {
    setSaving(true)
    // ignoreDuplicates : si l'élève est déjà membre de ce groupe, on ne lève pas d'erreur.
    await supabase.from('group_members')
      .upsert({ group_id: groupId, student_id: student.id, is_external: false },
               { onConflict: 'group_id,student_id', ignoreDuplicates: true })
    setSaving(false)
    onAdded()
    onClose()
  }

  async function addExternal() {
    if (!freeForm.first_name.trim() || !freeForm.last_name.trim()) return
    setSaving(true)
    setAddErr(null)
    try {
      // 1. Créer ou retrouver la fiche ensemble_participants (dédoublonnage prénom+nom)
      let participantId = null
      const { data: existing } = await supabase
        .from('ensemble_participants')
        .select('id')
        .eq('teacher_id', user.id)
        .ilike('prenom', freeForm.first_name.trim())
        .ilike('nom', freeForm.last_name.trim())
        .maybeSingle()
      if (existing) {
        participantId = existing.id
      } else {
        const { data: created, error: eErr } = await supabase
          .from('ensemble_participants')
          .insert({
            teacher_id: user.id,
            prenom: freeForm.first_name.trim(),
            nom: freeForm.last_name.trim(),
            instrument: freeForm.instrument.trim() || null,
            est_eleve: false,
          })
          .select('id')
          .single()
        if (eErr) throw eErr
        participantId = created.id
      }

      // 2. Insérer dans group_members avec le participant_id
      const { error: mErr } = await supabase.from('group_members').insert({
        group_id: groupId,
        is_external: true,
        participant_id: participantId,
        free_first_name: freeForm.first_name.trim(),
        free_last_name: freeForm.last_name.trim(),
        free_instrument: freeForm.instrument.trim() || null,
        free_school: freeForm.school.trim() || null,
      })
      if (mErr) throw mErr

      onAdded()
      onClose()
    } catch (e) {
      setAddErr(e.message ?? 'Erreur lors de l\'ajout')
    } finally {
      setSaving(false)
    }
  }

  const filtered = students.filter(s =>
    (s.first_name + ' ' + s.last_name).toLowerCase().includes(search.toLowerCase())
  )

  const inputClass = "w-full px-3 py-2 rounded-xl bg-surface-overlay border border-border-subtle text-sm focus:outline-none focus:border-guitar-600"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display">Ajouter un membre</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setMode('eleve')}
            className={"flex-1 py-2 rounded-xl text-sm font-medium transition-all " + (mode === 'eleve' ? 'bg-guitar-600 text-white' : 'border border-border-subtle text-muted')}>
            Mes eleves
          </button>
          <button onClick={() => setMode('externe')}
            className={"flex-1 py-2 rounded-xl text-sm font-medium transition-all " + (mode === 'externe' ? 'bg-guitar-600 text-white' : 'border border-border-subtle text-muted')}>
            Personne exterieure
          </button>
        </div>

        {mode === 'eleve' ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className={inputClass + " pl-9"}
                placeholder="Rechercher un eleve..." />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {filtered.length === 0 && <p className="text-xs text-muted text-center py-4">Aucun eleve trouve</p>}
              {filtered.map(s => (
                <button key={s.id} onClick={() => addStudent(s)} disabled={saving}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-overlay transition-all text-left">
                  <div>
                    <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-muted">{s.instrument} {s.school_name ? '· ' + s.school_name : ''}</p>
                  </div>
                  <span className="text-xs text-guitar-400">Ajouter</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
           <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Prenom *</label>
                <input value={freeForm.first_name} onChange={e => setFreeForm({...freeForm, first_name: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Nom *</label>
                <input value={freeForm.last_name} onChange={e => setFreeForm({...freeForm, last_name: e.target.value})} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Instrument</label>
              <input value={freeForm.instrument} onChange={e => setFreeForm({...freeForm, instrument: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Ecole / Structure</label>
              <input value={freeForm.school} onChange={e => setFreeForm({...freeForm, school: e.target.value})} className={inputClass} />
            </div>
            {addErr && <p className="text-xs text-red-400 px-1">{addErr}</p>}
            <button onClick={addExternal} disabled={saving || !freeForm.first_name.trim() || !freeForm.last_name.trim()}
              className="w-full px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-700 disabled:opacity-50 transition-all">
              {saving ? 'Enregistrement...' : 'Ajouter ce membre'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
