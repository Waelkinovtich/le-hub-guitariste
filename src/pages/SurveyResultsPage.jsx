import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, User, Calendar, School, Mail, Phone, MapPin, Guitar, Users, BookOpen, ClipboardList, Clock, Check, Loader2, Pencil, Trash2, Home } from 'lucide-react'
import { supabase } from '../lib/supabase'
import HelpTooltip from '../components/HelpTooltip'
import PhoneActions from '../components/PhoneActions'
import EmailActions from '../components/EmailActions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtAvailabilities(avail) {
  if (!avail || typeof avail !== 'object' || Object.keys(avail).length === 0) return null
  const ORDRE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const entries = Object.entries(avail).sort(([a], [b]) => ORDRE.indexOf(a) - ORDRE.indexOf(b))
  return entries.map(([jour, slots]) => ({
    jour,
    slots: Array.isArray(slots) ? slots : [],
  }))
}

// ─── Composants d'affichage ───────────────────────────────────────────────────

// phone/email : bascule value vers PhoneActions/EmailActions (appui long →
// appeler/SMS/mail) au lieu d'un simple texte — les autres champs (adresse…)
// sont inchangés.
function InfoRow({ icon: Icon, label, value, phone = false, email = false }) {
  if (!value && value !== false) return null
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm text-foreground">
          {phone ? <PhoneActions number={value} /> : email ? <EmailActions email={value} /> : String(value)}
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-border-subtle" />
}

// ─── Vue détail ───────────────────────────────────────────────────────────────

function DetailView({ response, onBack }) {
  const availabilities = fmtAvailabilities(response.availabilities)
  const hasGuardian1 = response.guardian1_name || response.guardian1_phone || response.guardian1_email
  const hasGuardian2 = response.guardian2_name || response.guardian2_phone || response.guardian2_email

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Toutes les réponses
      </button>

      <div className="mb-6">
        <h1 className="font-display text-3xl text-foreground">
          {response.first_name || '—'} {response.last_name || ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Soumis le {fmt(response.submitted_at)}
          {response.school_name && <> · {response.school_name}</>}
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <Section title="Identité">
          {response.assigned_day && (
            <InfoRow icon={Clock} label="Créneau confirmé" value={`${response.assigned_day} ${response.assigned_time ?? ''}`.trim()} />
          )}
          <InfoRow icon={User}     label="Année de naissance" value={response.birth_year} />
          <InfoRow icon={Mail}     label="Email"              value={response.email} email />
          <InfoRow icon={Phone}    label="Téléphone"          value={response.phone} phone />
          <InfoRow icon={School}   label="École"              value={response.school_name} />
          <InfoRow icon={MapPin}   label="Adresse"            value={response.address ?? response.city} />
        </Section>

        <Divider />

        <Section title="Niveau">
          <InfoRow icon={Guitar}    label="Années de pratique" value={response.practice_years != null ? `${response.practice_years} an${response.practice_years > 1 ? 's' : ''}` : null} />
          <InfoRow icon={Guitar}    label="Niveau"             value={response.level} />
          <InfoRow icon={BookOpen}  label="Diplômes"           value={response.diplomas} />
        </Section>

        <Divider />

        <Section title="Pratique">
          <InfoRow icon={Guitar} label="Instrument"           value={response.instrument} />
          <InfoRow icon={Users}  label="Cours collectifs"     value={response.open_to_group === true ? 'Oui' : response.open_to_group === false ? 'Non' : null} />
        </Section>

        {(hasGuardian1 || hasGuardian2) && (
          <>
            <Divider />
            <Section title="Contacts tuteurs">
              {hasGuardian1 && (
                <div className="glass-panel rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">{response.guardian1_name}</p>
                  {response.guardian1_phone && <p className="text-xs text-muted-foreground"><PhoneActions number={response.guardian1_phone} /></p>}
                  {response.guardian1_email && <p className="text-xs text-muted-foreground"><EmailActions email={response.guardian1_email} /></p>}
                  {response.guardian1_contact_purpose && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-md bg-surface border border-border text-muted-foreground">
                      {response.guardian1_contact_purpose}
                    </span>
                  )}
                </div>
              )}
              {hasGuardian2 && (
                <div className="glass-panel rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">{response.guardian2_name}</p>
                  {response.guardian2_phone && <p className="text-xs text-muted-foreground"><PhoneActions number={response.guardian2_phone} /></p>}
                  {response.guardian2_email && <p className="text-xs text-muted-foreground"><EmailActions email={response.guardian2_email} /></p>}
                  {response.guardian2_contact_purpose && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-md bg-surface border border-border text-muted-foreground">
                      {response.guardian2_contact_purpose}
                    </span>
                  )}
                </div>
              )}
            </Section>
          </>
        )}

        {availabilities && availabilities.length > 0 && (
          <>
            <Divider />
            <Section title="Disponibilités">
              <div className="space-y-3">
                {availabilities.map(({ jour, slots }) => (
                  <div key={jour} className="rounded-xl bg-surface border border-border-subtle p-3">
                    <p className="text-sm font-medium text-foreground mb-2">{jour}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map(slot => (
                        <span key={slot} className="text-xs px-2 py-1 rounded-lg bg-guitar-600/10 text-guitar-400 border border-guitar-600/20">
                          {slot}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {response.expectations && (
          <>
            <Divider />
            <Section title="Attentes">
              <div className="rounded-xl bg-surface border border-border-subtle px-4 py-3">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{response.expectations}</p>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Helpers attribution ──────────────────────────────────────────────────────

const JOURS_ORDER = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function nextDateForDay(dayName) {
  const target = JOURS_ORDER.indexOf(dayName)
  const today = new Date()
  let diff = target - today.getDay()
  if (diff <= 0) diff += 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function parseStartTime(slot) {
  return slot.split('–')[0].trim()
}

async function getTeacherId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('id', user.id).single()
  return data?.id ?? null
}

async function createRecurringLessons(teacherId, studentId, dayName, startTime, durationMinutes) {
  const groupId = crypto.randomUUID()
  const startDate = nextDateForDay(dayName)
  const endDate = '2027-06-30'
  const rows = []
  let current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    const pad = (n) => String(n).padStart(2, '0')
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    rows.push({
      teacher_id: teacherId,
      student_id: studentId,
      lesson_date: iso,
      lesson_time: startTime,
      duration_minutes: durationMinutes,
      status: 'planifie',
      topic: 'Cours de guitare',
      recurrence_group: groupId,
    })
    current.setDate(current.getDate() + 7)
  }
  const { error } = await supabase.from('lessons').insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

// ─── Panneau attribution de créneau ───────────────────────────────────────────

function SlotAssignPanel({ response, onConfirmed, onClose }) {
  // selectedSlots: array of slot strings all on the same day, consecutive
  const [selection, setSelection] = useState({ day: null, slots: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const avail = response.availabilities ?? {}
  const ORDRE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const jours = Object.entries(avail)
    .sort(([a], [b]) => ORDRE.indexOf(a) - ORDRE.indexOf(b))
    .filter(([, slots]) => Array.isArray(slots) && slots.length > 0)

  const handleSlotClick = (jour, slot, slotsForDay) => {
    const idx = slotsForDay.indexOf(slot)
    if (selection.day !== jour || selection.slots.length === 0) {
      // different day or empty — start fresh
      setSelection({ day: jour, slots: [slot] })
      return
    }
    // same day
    const selIdxs = selection.slots.map(s => slotsForDay.indexOf(s))
    const minIdx = Math.min(...selIdxs)
    const maxIdx = Math.max(...selIdxs)
    if (selIdxs.includes(idx)) {
      // deselect: allow removing from either end only
      if (idx === minIdx || idx === maxIdx) {
        const next = selection.slots.filter(s => s !== slot)
        setSelection({ day: jour, slots: next.length ? next : [] })
      }
      return
    }
    // not yet selected — must be adjacent
    if (idx === maxIdx + 1 || idx === minIdx - 1) {
      if (selection.slots.length >= 4) return // max 4 slots
      setSelection({ day: jour, slots: [...selection.slots, slot].sort((a, b) => slotsForDay.indexOf(a) - slotsForDay.indexOf(b)) })
    } else {
      // not adjacent — reset to this slot
      setSelection({ day: jour, slots: [slot] })
    }
  }

  if (Object.keys(avail).length === 0) {
    return (
      <div className="mt-3 rounded-xl bg-surface border border-border-subtle p-4 text-sm text-muted-foreground">
        Aucune disponibilité renseignée par cet élève.
      </div>
    )
  }

  const totalMinutes = selection.slots.length * 15

  const handleConfirm = async () => {
    if (!selection.day || selection.slots.length === 0) return
    setSaving(true)
    setError('')
    try {
      const teacherId = await getTeacherId()
      if (!teacherId) throw new Error('Impossible de récupérer le compte enseignant.')
      const startTime = parseStartTime(selection.slots[0])
      const count = await createRecurringLessons(teacherId, response.student_id, selection.day, startTime, totalMinutes)
      const { error: updErr } = await supabase
        .from('survey_responses')
        .update({ status: 'confirme', assigned_day: selection.day, assigned_time: parseStartTime(selection.slots[0]) })
        .eq('id', response.id)
      if (updErr) throw new Error(updErr.message)
      onConfirmed(count, { day: selection.day, slot: selection.slots[0] })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="mt-3 rounded-xl bg-green-600/8 border border-green-600/20 p-4 flex items-center gap-2 text-sm text-green-400">
        <Check className="w-4 h-4 flex-shrink-0" />
        Cours créés avec succès — élève confirmé.
      </div>
    )
  }

  const hasSelection = selection.day !== null && selection.slots.length > 0

  return (
    <div className="mt-3 rounded-xl bg-surface border border-border-subtle p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted" />
          Choisir un créneau
        </p>
        <button onClick={onClose} className="text-xs text-muted hover:text-foreground transition-colors">Fermer</button>
      </div>

      {jours.map(([jour, slots]) => (
        <div key={jour}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{jour}</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map(slot => {
              const active = selection.day === jour && selection.slots.includes(slot)
              const selIdxs = selection.day === jour ? selection.slots.map(s => slots.indexOf(s)) : []
              const minIdx = selIdxs.length ? Math.min(...selIdxs) : -1
              const maxIdx = selIdxs.length ? Math.max(...selIdxs) : -1
              const idx = slots.indexOf(slot)
              const isFirst = active && idx === minIdx
              const isLast = active && idx === maxIdx
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleSlotClick(jour, slot, slots)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                    active
                      ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                      : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                  }`}
                >
                  {isFirst && <Check className="w-3 h-3 flex-shrink-0" />}
                  {slot}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {hasSelection && (
        <p className="text-xs text-muted-foreground">
          {totalMinutes} min sélectionnée{totalMinutes > 1 ? 's' : ''}
          {selection.slots.length > 1 && (
            <span className="ml-1 text-muted/70">({selection.slots.length} créneaux)</span>
          )}
        </p>
      )}

      {error && (
        <p className="text-xs text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!hasSelection || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {hasSelection
          ? `Confirmer — ${selection.day} ${selection.slots[0]}${selection.slots.length > 1 ? ` (${totalMinutes} min)` : ''}`
          : 'Sélectionner un créneau'}
      </button>
    </div>
  )
}

// ─── Carte de réponse ─────────────────────────────────────────────────────────

function RegistrationsList({ registrations }) {
  if (!registrations || registrations.length === 0) return null
  return (
    <div className="px-5 pb-4 pt-1">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
        Inscriptions ({registrations.length})
      </p>
      <div className="space-y-1.5">
        {registrations.map((reg) => {
          // Créneaux disponibles des personnes supplémentaires (champ JSONB — migration T1b)
          const avail = reg.availabilities && typeof reg.availabilities === 'object'
            ? Object.entries(reg.availabilities)
            : []
          const totalSlots = avail.reduce((s, [, slots]) => s + slots.length, 0)
          return (
            <div key={reg.id}
              className="text-xs px-3 py-2 rounded-lg bg-surface border border-border-subtle space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {reg.is_respondent && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-guitar-600/15 text-guitar-400 border border-guitar-600/25 flex-shrink-0">
                    Répondant
                  </span>
                )}
                {!reg.is_respondent && reg.registration_type === 'reinscription' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25 flex-shrink-0">
                    Réinscription
                  </span>
                )}
                <span className="font-medium text-foreground">
                  {reg.prenom || '—'} {reg.nom || ''}
                  {reg.birth_year && <span className="ml-1 font-normal text-muted-foreground">({reg.birth_year})</span>}
                </span>
                {reg.choix_structure === 'cesu' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1 flex-shrink-0">
                    <Home className="w-2.5 h-2.5" />CESU
                  </span>
                ) : reg.school_name ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-raised border border-border-subtle text-muted-foreground flex-shrink-0">
                    {reg.school_name}
                  </span>
                ) : null}
                {reg.email && <span className="text-muted-foreground truncate">{reg.email}</span>}
                {reg.telephone && (
                  <span className="text-muted-foreground flex-shrink-0"><PhoneActions number={reg.telephone} /></span>
                )}
              </div>
              {/* Créneaux disponibles — visibles uniquement pour les personnes supplémentaires */}
              {!reg.is_respondent && totalSlots > 0 && (
                <div className="pt-1 border-t border-border-subtle/50">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                    Disponibilités ({totalSlots} créneau{totalSlots > 1 ? 'x' : ''})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {avail.map(([jour, slots]) => (
                      <span key={jour} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-border-subtle text-muted-foreground">
                        {jour} : {slots.length} créneau{slots.length > 1 ? 'x' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResponseCard({ r, registrations, openPanelId, setOpenPanelId, onSelect, onConfirmed, onReassign, onDelete }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div
        onClick={() => onSelect(r)}
        className="w-full p-5 text-left hover:bg-guitar-600/5 transition-all group cursor-pointer"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0 group-hover:bg-guitar-600/10 transition-colors">
              <User className="w-5 h-5 text-muted-foreground group-hover:text-guitar-400" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">
                {r.first_name || '—'} {r.last_name || ''}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {r.school_name || 'École non précisée'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
              r.status === 'confirme'
                ? 'border-green-600/40 bg-green-600/10 text-green-400'
                : 'border-border-subtle bg-surface text-muted-foreground'
            }`}>
              {r.status === 'confirme'
                ? r.assigned_day
                  ? `Confirmé — ${r.assigned_day} ${r.assigned_time ?? ''}`
                  : 'Confirmé'
                : 'En attente'}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Calendar className="w-3.5 h-3.5" />
              {fmt(r.submitted_at)}
            </div>
          </div>
        </div>
      </div>

      <RegistrationsList registrations={registrations} />

      <div className="px-5 pb-4 border-t border-border-subtle pt-3 flex flex-wrap gap-2">
        {r.status !== 'confirme' && (
          <button
            onClick={(e) => { e.stopPropagation(); setOpenPanelId(openPanelId === r.id ? null : r.id) }}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              openPanelId === r.id
                ? 'border-guitar-600/40 bg-guitar-600/10 text-guitar-400'
                : 'border-border-subtle text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Attribuer un créneau
          </button>
        )}

        {r.status === 'confirme' && (
          <button
            onClick={(e) => { e.stopPropagation(); onReassign(r) }}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border-subtle text-muted-foreground hover:border-border hover:text-foreground transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier le créneau
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Supprimer la réponse de ${r.first_name || ''} ${r.last_name || ''} ? Cette action est irréversible.`)) {
              onDelete(r)
            }
          }}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border-subtle text-muted-foreground hover:border-guitar-600/40 hover:text-guitar-400 hover:bg-guitar-600/8 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer
        </button>

        {openPanelId === r.id && (
          <div className="w-full">
            <SlotAssignPanel
              response={r}
              onClose={() => setOpenPanelId(null)}
              onConfirmed={onConfirmed}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children, count }) {
  return (
    <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
      {children} <span className="text-muted/60">({count})</span>
    </h2>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SurveyResultsPage() {
  const [responses, setResponses] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [openPanelId, setOpenPanelId] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [survRes, regsRes] = await Promise.all([
        supabase.from('survey_responses').select('*').order('submitted_at', { ascending: false }),
        supabase.from('survey_registrations').select('*').order('created_at', { ascending: true }),
      ])
      setFetchError(survRes.error?.message ?? null)
      setResponses(survRes.data ?? [])
      setRegistrations(regsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const regsByToken = useMemo(() => {
    const map = {}
    for (const reg of registrations) {
      if (!map[reg.token_id]) map[reg.token_id] = []
      map[reg.token_id].push(reg)
    }
    return map
  }, [registrations])

  const handleConfirmed = (count, slot) => {
    setResponses(prev => prev.map(x =>
      x.id === openPanelId ? { ...x, status: 'confirme' } : x
    ))
    setOpenPanelId(null)
  }

  const handleDelete = async (r) => {
    const { error } = await supabase
      .from('survey_responses')
      .delete()
      .eq('id', r.id)
    if (!error) {
      setResponses(prev => prev.filter(x => x.id !== r.id))
    }
  }

  const handleReassign = async (r) => {
    const today = new Date().toISOString().slice(0, 10)
    await supabase
      .from('survey_responses')
      .update({ status: 'attente', assigned_day: null, assigned_time: null })
      .eq('id', r.id)
    await supabase
      .from('lessons')
      .delete()
      .eq('student_id', r.student_id)
      .gte('lesson_date', today)
      .lte('lesson_date', '2027-06-30')
    setResponses(prev => prev.map(x => x.id === r.id ? { ...x, status: 'attente' } : x))
    setOpenPanelId(r.id)
  }

  if (selected) {
    return <DetailView response={selected} onBack={() => setSelected(null)} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Chargement…</span>
      </div>
    )
  }

  const confirmes = responses.filter(r => r.status === 'confirme')
  const attente   = responses.filter(r => r.status !== 'confirme')

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-3xl text-foreground mb-1">Réponses au sondage</h1>
          <HelpTooltip texte="Chaque réponse correspond à un formulaire d'inscription rempli par une famille. Cliquez sur une ligne pour voir le détail complet avec les disponibilités." position="bottom" />
        </div>
        <p className="text-sm text-muted-foreground">
          {responses.length} réponse{responses.length !== 1 ? 's' : ''} au total
        </p>
        {fetchError && (
          <p className="mt-2 text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
            Erreur Supabase : {fetchError}
          </p>
        )}
      </div>

      {responses.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <ClipboardList className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune réponse enregistrée.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {confirmes.length > 0 && (
            <div>
              <SectionTitle count={confirmes.length}>Élèves confirmés</SectionTitle>
              <div className="space-y-3">
                {confirmes.map(r => (
                  <ResponseCard
                    key={r.id}
                    r={r}
                    registrations={regsByToken[r.token_id] ?? []}
                    openPanelId={openPanelId}
                    setOpenPanelId={setOpenPanelId}

                    onSelect={setSelected}
                    onConfirmed={handleConfirmed}
                    onReassign={handleReassign}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
          {attente.length > 0 && (
            <div>
              <SectionTitle count={attente.length}>Liste d&apos;attente</SectionTitle>
              <div className="space-y-3">
                {attente.map(r => (
                  <ResponseCard
                    key={r.id}
                    r={r}
                    registrations={regsByToken[r.token_id] ?? []}
                    openPanelId={openPanelId}
                    setOpenPanelId={setOpenPanelId}

                    onSelect={setSelected}
                    onConfirmed={handleConfirmed}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
