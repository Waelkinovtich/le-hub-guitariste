import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Music2, Check, Loader2, AlertCircle, ChevronDown, ChevronUp, Sparkles, X, Link, Search, Trash2, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Algorithme de suggestion de groupes ──────────────────────────────────────

function creneauxCommuns(participants) {
  if (participants.length === 0) return []
  const premier = participants[0].availabilities ?? {}
  const candidats = []
  for (const [jour, slots] of Object.entries(premier)) {
    for (const slot of (slots ?? [])) candidats.push({ jour, slot })
  }
  return candidats.filter(({ jour, slot }) =>
    participants.every((p) => (p.availabilities?.[jour] ?? []).includes(slot))
  )
}

function suggererGroupes(participants) {
  const nonTraites = [...participants]
  const groupes = []
  while (nonTraites.length > 0) {
    const pivot = nonTraites.shift()
    const groupe = [pivot]
    const restants = []
    for (const p of nonTraites) {
      if (creneauxCommuns([pivot, p]).length > 0) groupe.push(p)
      else restants.push(p)
    }
    nonTraites.length = 0
    nonTraites.push(...restants)
    groupes.push({ membres: groupe, creneaux: creneauxCommuns(groupe) })
  }
  return groupes.sort((a, b) => b.membres.length - a.membres.length)
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function totalCreneaux(avail) {
  return Object.values(avail ?? {}).reduce((s, arr) => s + arr.length, 0)
}

const STATUT_COLOR = {
  attente: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  groupe:  'bg-green-500/15 text-green-400 border-green-500/25',
}
const STATUT_LABEL = { attente: 'En attente', groupe: 'Intégré dans un groupe' }

// ─── Panneau disponibilités ───────────────────────────────────────────────────

function DisponibilitesDetail({ availabilities }) {
  const jours = Object.keys(availabilities ?? {})
  if (jours.length === 0) return <p className="text-xs text-muted-foreground">Aucune disponibilité renseignée.</p>
  return (
    <div className="space-y-1">
      {jours.map((jour) => (
        <div key={jour} className="flex flex-wrap gap-1 items-center">
          <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">{jour}</span>
          <div className="flex flex-wrap gap-1">
            {(availabilities[jour] ?? []).map((slot) => (
              <span key={slot} className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay border border-border-subtle">{slot}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Badge compétence (oui/non/non renseigné) ────────────────────────────────

function BadgeCompetence({ label, value }) {
  if (value === null || value === undefined) return null
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${
      value ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface-overlay text-muted-foreground border-border-subtle'
    }`}>
      {value ? '✓' : '✗'} {label}
    </span>
  )
}

// ─── Carte participant ────────────────────────────────────────────────────────

function CarteParticipant({ reponse, showDispos, onRapprocher, onVoirFiche }) {
  const p = reponse.ensemble_participants
  const nb = totalCreneaux(reponse.availabilities)
  const estEleve = p?.est_deja_eleve === true
  const dejaLie  = !!p?.student_id

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-raised hover:border-border transition-colors cursor-pointer" onClick={() => onVoirFiche?.(reponse)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onVoirFiche?.(reponse)}>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Nom + statut */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{p?.prenom} {p?.nom}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUT_COLOR[reponse.status] ?? ''}`}>
            {STATUT_LABEL[reponse.status] ?? reponse.status}
          </span>
          {estEleve && (
            <span className="text-xs px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">
              Déjà élève
            </span>
          )}
          {dejaLie && (
            <span className="text-xs px-1.5 py-0.5 rounded border bg-guitar-600/10 text-guitar-400 border-guitar-600/20">
              ✓ Lié
            </span>
          )}
        </div>

        {/* Infos de base */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {p?.birth_year    && <span>🎂 {p.birth_year}</span>}
          {p?.instrument    && <span>🎸 {p.instrument}</span>}
          {p?.niveau        && <span>📊 {p.niveau}</span>}
          {p?.annees_pratique != null && <span>{p.annees_pratique} an{p.annees_pratique > 1 ? 's' : ''} de pratique</span>}
          {p?.email         && <span>{p.email}</span>}
          <span>📅 {fmtDate(reponse.submitted_at)}</span>
          <span>{nb} créneau{nb > 1 ? 'x' : ''}</span>
        </div>

        {/* Compétences musicales (seulement pour les externes) */}
        {!estEleve && (
          <div className="flex flex-wrap gap-1">
            <BadgeCompetence label="Partitions"      value={p?.lecture_partition} />
            <BadgeCompetence label="Tablatures"      value={p?.lecture_tablature} />
            <BadgeCompetence label="Solfège"         value={p?.solfege_rythmique} />
            <BadgeCompetence label="Harmonie"        value={p?.harmonie} />
            <BadgeCompetence label="Exp. groupe"     value={p?.experience_groupe} />
            {p?.experience_groupe && p?.experience_groupe_duree && (
              <span className="text-xs text-muted-foreground italic">{p.experience_groupe_duree}</span>
            )}
          </div>
        )}

        {showDispos && (
          <div className="mt-2">
            <DisponibilitesDetail availabilities={reponse.availabilities} />
          </div>
        )}

        {/* Action rapprochement — stopPropagation pour ne pas ouvrir la fiche */}
        {estEleve && !dejaLie && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRapprocher(reponse) }}
            className="mt-1 flex items-center gap-1.5 text-xs text-guitar-400 hover:text-guitar-300 transition-colors"
          >
            <Link className="w-3 h-3" />
            Rapprocher d'un élève existant
          </button>
        )}
      </div>
      {/* Indicateur "voir fiche" */}
      <Eye className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5" />
    </div>
  )
}

// ─── Modale rapprochement ─────────────────────────────────────────────────────

function ModaleRapprochement({ reponse, onClose, onLier }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const p = reponse.ensemble_participants

  const rechercher = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, prenom, nom, school_name')
      .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%`)
      .limit(10)
    setResults(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => rechercher(query), 300)
    return () => clearTimeout(t)
  }, [query, rechercher])

  async function handleLier(student) {
    setSaving(true)
    await onLier(reponse.ensemble_participants.id, student.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Rapprocher d'un élève existant</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Participant : <strong>{p?.prenom} {p?.nom}</strong>
          {p?.email && <span className="ml-1">({p.email})</span>}
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par prénom ou nom…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors"
            autoFocus
          />
        </div>

        <div className="min-h-[80px] space-y-1">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />Recherche…
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun élève trouvé pour « {query} ».</p>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={saving}
              onClick={() => handleLier(s)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-raised hover:border-guitar-600/40 hover:bg-guitar-600/5 text-sm transition-all text-left disabled:opacity-50"
            >
              <span>
                <span className="font-medium">{s.prenom} {s.nom}</span>
                {s.school_name && <span className="ml-2 text-xs text-muted-foreground">{s.school_name}</span>}
              </span>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5 text-guitar-400" />}
            </button>
          ))}
        </div>

        <button type="button" onClick={onClose}
          className="w-full px-4 py-2 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:border-border transition-colors">
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Modale de validation d'un groupe ─────────────────────────────────────────

function ModaleValiderGroupe({ groupe, onClose, onValidate, saving }) {
  const [nom, setNom] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Valider ce groupe d'ensemble</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Ce groupe ({groupe.membres.length} participants) sera créé dans <strong>Groupes & Répétitions</strong> avec
          le type <em>Ensemble</em>. Les participants déjà liés à un élève seront ajoutés.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Nom du groupe <span className="text-guitar-400">*</span></label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="ex : Groupe jazz débutants mercredi"
            maxLength={100}
            className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Membres :</p>
          {groupe.membres.map((m) => {
            const p = m.ensemble_participants
            return (
              <p key={m.participant_id ?? m.id} className="text-xs text-foreground">
                • {p?.prenom} {p?.nom}
                {p?.instrument && ` — ${p.instrument}`}
                {p?.student_id && <span className="text-guitar-400"> ✓ lié</span>}
                {p?.est_deja_eleve && !p?.student_id && <span className="text-amber-400"> (élève non lié)</span>}
              </p>
            )
          })}
        </div>

        {groupe.creneaux.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Créneaux communs :</p>
            <div className="flex flex-wrap gap-1">
              {groupe.creneaux.slice(0, 8).map(({ jour, slot }) => (
                <span key={`${jour}-${slot}`} className="text-xs px-1.5 py-0.5 rounded bg-guitar-600/10 border border-guitar-600/25 text-guitar-400">
                  {jour} {slot}
                </span>
              ))}
              {groupe.creneaux.length > 8 && <span className="text-xs text-muted-foreground">+{groupe.creneaux.length - 8}</span>}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-border-subtle text-sm text-muted-foreground hover:border-border transition-colors">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onValidate(nom)}
            disabled={!nom.trim() || saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-500 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Créer le groupe
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fiche détail + Suppression ──────────────────────────────────────────────

function FicheDetailReponse({ reponse, onClose, onSupprimer }) {
  const p = reponse.ensemble_participants
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [supprimant,   setSupprimant]   = useState(false)

  async function handleSupprimer() {
    setSupprimant(true)
    await onSupprimer(reponse)
    // onSupprimer ferme la fiche si succès (via setFicheOuverte(null))
    setSupprimant(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-panel rounded-2xl border border-border-subtle p-6 w-full max-w-lg space-y-5 overflow-y-auto max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">{p?.prenom} {p?.nom}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Réponse reçue le {fmtDate(reponse.submitted_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Statut */}
        <span className={`inline-flex text-xs px-2 py-0.5 rounded border ${STATUT_COLOR[reponse.status] ?? ''}`}>
          {STATUT_LABEL[reponse.status] ?? reponse.status}
        </span>

        {/* Identité */}
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identité</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {p?.email      && <span className="col-span-2 text-muted-foreground">{p.email}</span>}
            {p?.telephone  && <span className="col-span-2 text-muted-foreground">{p.telephone}</span>}
            {p?.birth_year && <span>Né·e en <strong>{p.birth_year}</strong></span>}
            <span>{p?.est_deja_eleve ? '✓ Déjà élève' : 'Participant externe'}</span>
          </div>
        </section>

        {/* Instrument & niveau (seulement pour les externes) */}
        {!p?.est_deja_eleve && (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instrument & Niveau</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {p?.instrument      && <span>🎸 {p.instrument}</span>}
              {p?.niveau          && <span>📊 {p.niveau}</span>}
              {p?.annees_pratique != null && <span>{p.annees_pratique} an{p.annees_pratique > 1 ? 's' : ''} de pratique</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <BadgeCompetence label="Partitions"  value={p?.lecture_partition} />
              <BadgeCompetence label="Tablatures"  value={p?.lecture_tablature} />
              <BadgeCompetence label="Solfège"     value={p?.solfege_rythmique} />
              <BadgeCompetence label="Harmonie"    value={p?.harmonie} />
              <BadgeCompetence label="Exp. groupe" value={p?.experience_groupe} />
              {p?.experience_groupe && p?.experience_groupe_duree && (
                <span className="text-xs text-muted-foreground italic">{p.experience_groupe_duree}</span>
              )}
            </div>
          </section>
        )}

        {/* Disponibilités */}
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disponibilités</p>
          <DisponibilitesDetail availabilities={reponse.availabilities} />
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          {!confirmSuppr ? (
            <button
              type="button"
              onClick={() => setConfirmSuppr(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer cette réponse
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Supprimer définitivement ?</span>
              <button
                type="button"
                onClick={handleSupprimer}
                disabled={supprimant}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {supprimant ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Oui, supprimer
              </button>
              <button type="button" onClick={() => setConfirmSuppr(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Annuler
              </button>
            </div>
          )}
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleResponsesPage() {
  const { user } = useAuth()
  const [reponses,        setReponses]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [erreur,          setErreur]          = useState(null)
  const [showDispos,      setShowDispos]      = useState(false)
  const [modeSuggestion,  setModeSuggestion]  = useState(false)
  const [groupeAValider,  setGroupeAValider]  = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [succesMsg,       setSuccesMsg]       = useState('')
  const [rapprochement,   setRapprochement]   = useState(null) // reponse à rapprocher
  const [ficheOuverte,    setFicheOuverte]    = useState(null) // reponse dont la fiche est ouverte

  // ── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('ensemble_responses')
        .select(`id, availabilities, submitted_at, status, participant_id,
          ensemble_participants(
            id, prenom, nom, email, telephone, instrument, niveau, student_id,
            birth_year, est_deja_eleve, annees_pratique,
            lecture_partition, lecture_tablature, solfege_rythmique,
            harmonie, experience_groupe, experience_groupe_duree
          )`)
        .eq('teacher_id', user.id)
        .order('submitted_at', { ascending: false })
      if (!cancelled) {
        if (error) setErreur(error.message)
        else setReponses(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const reponsesEnAttente = useMemo(
    () => reponses.filter((r) => r.status === 'attente'),
    [reponses],
  )

  const suggestions = useMemo(
    () => (modeSuggestion ? suggererGroupes(reponsesEnAttente) : []),
    [modeSuggestion, reponsesEnAttente],
  )

  // ── Rapprochement : lier un participant à un élève existant ──────────────────

  async function handleLier(participantId, studentId) {
    const { error } = await supabase
      .from('ensemble_participants')
      .update({ student_id: studentId })
      .eq('id', participantId)
    if (error) { alert('Erreur : ' + error.message); return }
    // Mise à jour locale sans rechargement
    setReponses((prev) =>
      prev.map((r) =>
        r.ensemble_participants?.id === participantId
          ? { ...r, ensemble_participants: { ...r.ensemble_participants, student_id: studentId } }
          : r
      )
    )
    setRapprochement(null)
    setSuccesMsg('Participant lié à l\'élève avec succès.')
    setTimeout(() => setSuccesMsg(''), 4000)
  }

  // ── Suppression d'une réponse ensemble (et du participant si aucune autre réponse) ──

  async function handleSupprimer(reponse) {
    const participantId = reponse.participant_id ?? reponse.ensemble_participants?.id
    try {
      // 1. Supprimer la réponse
      const { error: rErr } = await supabase.from('ensemble_responses').delete().eq('id', reponse.id)
      if (rErr) throw rErr

      // 2. Vérifier si le participant a d'autres réponses avant de le supprimer
      if (participantId) {
        const { count } = await supabase
          .from('ensemble_responses')
          .select('id', { count: 'exact', head: true })
          .eq('participant_id', participantId)
        if (count === 0) {
          // Aucune autre réponse — supprimer le participant orphelin
          await supabase.from('ensemble_participants').delete().eq('id', participantId)
        }
      }

      setReponses((prev) => prev.filter((r) => r.id !== reponse.id))
      setFicheOuverte(null)
      setSuccesMsg('Réponse supprimée.')
      setTimeout(() => setSuccesMsg(''), 4000)
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message)
    }
  }

  // ── Validation d'un groupe suggéré ──────────────────────────────────────────

  async function handleValiderGroupe(nomGroupe) {
    if (!groupeAValider || !nomGroupe.trim()) return
    setSaving(true)
    try {
      const { data: groupData, error: gErr } = await supabase
        .from('music_groups')
        .insert({ teacher_id: user.id, name: nomGroupe.trim(), type: 'ensemble' })
        .select('id')
        .single()
      if (gErr) throw gErr

      // Uniquement les membres déjà liés à un student_id (group_members l'exige)
      const membresAInserer = groupeAValider.membres
        .filter((r) => r.ensemble_participants?.student_id)
        .map((r) => ({
          group_id:   groupData.id,
          student_id: r.ensemble_participants.student_id,
          role:       r.ensemble_participants?.instrument ?? null,
        }))

      if (membresAInserer.length > 0) {
        const { error: mErr } = await supabase.from('group_members').insert(membresAInserer)
        if (mErr) throw mErr
      }

      const ids = groupeAValider.membres.map((r) => r.id)
      const { error: sErr } = await supabase.from('ensemble_responses').update({ status: 'groupe' }).in('id', ids)
      if (sErr) throw sErr

      setReponses((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, status: 'groupe' } : r))
      setSuccesMsg(`Groupe "${nomGroupe}" créé avec succès.`)
      setGroupeAValider(null)
      setModeSuggestion(false)
      setTimeout(() => setSuccesMsg(''), 4000)
    } catch (err) {
      alert('Erreur lors de la création du groupe : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Chargement…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-guitar-400" />
          <div>
            <h1 className="text-lg font-semibold">Réponses — Répétitions d'ensemble</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {reponses.length} réponse{reponses.length > 1 ? 's' : ''} reçue{reponses.length > 1 ? 's' : ''}
              {reponsesEnAttente.length > 0 && ` · ${reponsesEnAttente.length} en attente`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDispos((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle text-xs text-muted-foreground hover:border-border transition-colors"
          >
            {showDispos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDispos ? 'Masquer dispos' : 'Afficher dispos'}
          </button>

          {reponsesEnAttente.length >= 2 && (
            <button
              type="button"
              onClick={() => setModeSuggestion((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                modeSuggestion
                  ? 'bg-guitar-600/15 border-guitar-600/30 text-guitar-400'
                  : 'border-border-subtle text-muted-foreground hover:border-border'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Suggestions de groupes
            </button>
          )}
        </div>
      </div>

      {erreur && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />{erreur}
        </div>
      )}

      {succesMsg && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/25 px-4 py-3 rounded-xl">
          <Check className="w-4 h-4 shrink-0" />{succesMsg}
        </div>
      )}

      {/* ── Suggestions de groupes ─────────────────────────────────────── */}
      {modeSuggestion && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-guitar-400" />
            <p className="text-sm font-medium">Groupes suggérés selon les disponibilités communes</p>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun groupe possible — aucune disponibilité commune trouvée.</p>
          ) : (
            suggestions.map((g, idx) => {
              if (g.membres.length < 2) return null
              return (
                <div key={idx} className="rounded-xl border border-guitar-600/30 bg-guitar-600/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Groupe suggéré #{idx + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.membres.length} participants · {g.creneaux.length} créneau{g.creneaux.length > 1 ? 'x' : ''} commun{g.creneaux.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGroupeAValider(g)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-guitar-600 text-white text-xs font-medium hover:bg-guitar-500 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Valider ce groupe
                    </button>
                  </div>

                  <div className="space-y-1">
                    {g.membres.map((m) => {
                      const p = m.ensemble_participants
                      return (
                        <div key={m.id} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{p?.prenom} {p?.nom}</span>
                          {p?.instrument && <span className="text-muted-foreground">{p.instrument}</span>}
                          {p?.niveau && <span className="text-muted-foreground">· {p.niveau}</span>}
                          {p?.student_id && <span className="text-guitar-400">✓ lié</span>}
                        </div>
                      )
                    })}
                  </div>

                  {g.creneaux.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground mr-1">Créneaux communs :</span>
                      {g.creneaux.slice(0, 6).map(({ jour, slot }) => (
                        <span key={`${jour}-${slot}`} className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay border border-border-subtle">
                          {jour} {slot}
                        </span>
                      ))}
                      {g.creneaux.length > 6 && <span className="text-xs text-muted-foreground">+{g.creneaux.length - 6}</span>}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {suggestions.filter((g) => g.membres.length < 2).length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Sans créneau commun avec d'autres :</p>
              {suggestions
                .filter((g) => g.membres.length < 2)
                .map((g) => g.membres[0])
                .map((r) => {
                  const p = r?.ensemble_participants
                  return (
                    <p key={r?.id} className="text-xs text-muted-foreground">
                      • {p?.prenom} {p?.nom} {p?.instrument ? `— ${p.instrument}` : ''}
                    </p>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Liste des réponses ─────────────────────────────────────────── */}
      {reponses.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Music2 className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Aucune réponse reçue pour l'instant.</p>
          <p className="text-xs text-muted-foreground">Créez des liens d'inscription dans "Liens — Ensemble" et envoyez-les aux participants.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3">
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-2xl font-semibold">{reponsesEnAttente.length}</p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3">
              <p className="text-xs text-muted-foreground">Intégrés</p>
              <p className="text-2xl font-semibold">{reponses.filter((r) => r.status === 'groupe').length}</p>
            </div>
          </div>

          {reponses.map((r) => (
            <CarteParticipant
              key={r.id}
              reponse={r}
              showDispos={showDispos}
              onRapprocher={setRapprochement}
              onVoirFiche={setFicheOuverte}
            />
          ))}
        </div>
      )}

      {/* Fiche détail d'une réponse */}
      {ficheOuverte && (
        <FicheDetailReponse
          reponse={ficheOuverte}
          onClose={() => setFicheOuverte(null)}
          onSupprimer={handleSupprimer}
        />
      )}

      {/* Modale rapprochement */}
      {rapprochement && (
        <ModaleRapprochement
          reponse={rapprochement}
          onClose={() => setRapprochement(null)}
          onLier={handleLier}
        />
      )}

      {/* Modale validation groupe */}
      {groupeAValider && (
        <ModaleValiderGroupe
          groupe={groupeAValider}
          onClose={() => setGroupeAValider(null)}
          onValidate={handleValiderGroupe}
          saving={saving}
        />
      )}
    </div>
  )
}
