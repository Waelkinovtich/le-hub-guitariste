import { useState, useEffect, useMemo } from 'react'
import { Users, Music2, Check, Loader2, AlertCircle, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Algorithme de suggestion de groupes ──────────────────────────────────────

/**
 * Calcule les créneaux communs entre plusieurs participants.
 * availabilities : { "Lundi": ["09:00–09:30", ...], ... }
 * Retourne un tableau de { jour, slot } communs à TOUS les participants.
 */
function creneauxCommuns(participants) {
  if (participants.length === 0) return []
  // Commence par tous les créneaux du premier participant, puis intersecte
  const premier = participants[0].availabilities ?? {}
  const candidats = []
  for (const [jour, slots] of Object.entries(premier)) {
    for (const slot of (slots ?? [])) {
      candidats.push({ jour, slot })
    }
  }
  return candidats.filter(({ jour, slot }) =>
    participants.every((p) => (p.availabilities?.[jour] ?? []).includes(slot))
  )
}

/**
 * Regroupe les participants par disponibilités communes (au moins 1 créneau partagé).
 * Algorithme glouton : prend le premier participant non traité, cherche tous ceux
 * qui ont au moins 1 créneau en commun avec lui, forme un groupe.
 * Retourne un tableau de { membres: participant[], creneaux: {jour,slot}[] }.
 */
function suggererGroupes(participants) {
  const nonTraites = [...participants]
  const groupes = []

  while (nonTraites.length > 0) {
    const pivot = nonTraites.shift()
    const groupe = [pivot]
    const restants = []

    for (const p of nonTraites) {
      // Test si p partage au moins 1 créneau avec le pivot
      const commun = creneauxCommuns([pivot, p])
      if (commun.length > 0) {
        groupe.push(p)
      } else {
        restants.push(p)
      }
    }
    nonTraites.length = 0
    nonTraites.push(...restants)

    // Calcul des créneaux communs à TOUS les membres du groupe
    const creneaux = creneauxCommuns(groupe)
    groupes.push({ membres: groupe, creneaux })
  }

  // Trie par taille de groupe décroissante (les plus gros groupes d'abord)
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

// ─── Panneau disponibilités d'un participant ──────────────────────────────────

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
              <span key={slot} className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay border border-border-subtle">
                {slot}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Carte participant ─────────────────────────────────────────────────────────

function CarteParticipant({ reponse, showDispos }) {
  const p = reponse.ensemble_participants
  const nb = totalCreneaux(reponse.availabilities)
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-raised hover:border-border transition-colors">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{p?.prenom} {p?.nom}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUT_COLOR[reponse.status] ?? ''}`}>
            {STATUT_LABEL[reponse.status] ?? reponse.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {p?.instrument && <span>🎸 {p.instrument}</span>}
          {p?.niveau     && <span>📊 {p.niveau}</span>}
          {p?.email      && <span>{p.email}</span>}
          <span>📅 {fmtDate(reponse.submitted_at)}</span>
          <span>{nb} créneau{nb > 1 ? 'x' : ''}</span>
        </div>
        {showDispos && (
          <div className="mt-2">
            <DisponibilitesDetail availabilities={reponse.availabilities} />
          </div>
        )}
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
          le type <em>Ensemble</em>. Les participants déjà élèves seront liés si possible.
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
          {groupe.membres.map((m) => (
            <p key={m.participant_id ?? m.id} className="text-xs text-foreground">
              • {m.ensemble_participants?.prenom} {m.ensemble_participants?.nom}
              {m.ensemble_participants?.instrument && ` — ${m.ensemble_participants.instrument}`}
            </p>
          ))}
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
              {groupe.creneaux.length > 8 && (
                <span className="text-xs text-muted-foreground">+{groupe.creneaux.length - 8}</span>
              )}
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

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleResponsesPage() {
  const { user } = useAuth()
  const [reponses, setReponses] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [erreur,   setErreur]   = useState(null)
  const [showDispos, setShowDispos] = useState(false)
  const [modeSuggestion, setModeSuggestion] = useState(false)
  const [groupeAValider, setGroupeAValider] = useState(null)
  const [saving, setSaving] = useState(false)
  const [succesMsg, setSuccesMsg] = useState('')

  // ── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('ensemble_responses')
        .select('id, availabilities, submitted_at, status, participant_id, ensemble_participants(id, prenom, nom, email, telephone, instrument, niveau, student_id)')
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

  // ── Suggestions de groupes (Tâche 4) ───────────────────────────────────────

  // Ne travaille que sur les réponses en 'attente' (non encore intégrées)
  const reponsesEnAttente = useMemo(
    () => reponses.filter((r) => r.status === 'attente'),
    [reponses],
  )

  const suggestions = useMemo(
    () => (modeSuggestion ? suggererGroupes(reponsesEnAttente) : []),
    [modeSuggestion, reponsesEnAttente],
  )

  // ── Validation d'un groupe suggéré → music_groups + group_members ──────────

  async function handleValiderGroupe(nomGroupe) {
    if (!groupeAValider || !nomGroupe.trim()) return
    setSaving(true)
    try {
      // 1. Créer le groupe dans music_groups (type 'ensemble' déjà existant dans le projet)
      const { data: groupData, error: gErr } = await supabase
        .from('music_groups')
        .insert({
          teacher_id: user.id,
          name:       nomGroupe.trim(),
          type:       'ensemble',
        })
        .select('id')
        .single()
      if (gErr) throw gErr

      // 2. Ajouter les membres dans group_members
      //    student_id nullable : si le participant est aussi élève (student_id non null),
      //    on le lie ; sinon on laisse null (participant externe).
      const membresAInserer = groupeAValider.membres.map((r) => ({
        group_id:   groupData.id,
        student_id: r.ensemble_participants?.student_id ?? null,
        // instrument du participant copié pour info dans le groupe
        role:       r.ensemble_participants?.instrument ?? null,
      })).filter((m) => m.student_id !== null) // group_members requiert student_id — on n'insère que les élèves liés

      if (membresAInserer.length > 0) {
        const { error: mErr } = await supabase.from('group_members').insert(membresAInserer)
        if (mErr) throw mErr
      }

      // 3. Marquer les réponses correspondantes comme 'groupe'
      const ids = groupeAValider.membres.map((r) => r.id)
      const { error: sErr } = await supabase
        .from('ensemble_responses')
        .update({ status: 'groupe' })
        .in('id', ids)
      if (sErr) throw sErr

      // Mise à jour locale sans rechargement
      setReponses((prev) =>
        prev.map((r) => ids.includes(r.id) ? { ...r, status: 'groupe' } : r)
      )
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

      {/* ── Suggestions de groupes (Tâche 4) ─────────────────────────── */}
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
                <div
                  key={idx}
                  className="rounded-xl border border-guitar-600/30 bg-guitar-600/5 p-4 space-y-3"
                >
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
                      {g.creneaux.length > 6 && (
                        <span className="text-xs text-muted-foreground">+{g.creneaux.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Participants sans groupe compatible */}
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
          <p className="text-xs text-muted-foreground">Créez des liens d'inscription dans "Liens d'inscription — Ensemble" et envoyez-les aux participants.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reponses.length > 0 && (
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
          )}

          {reponses.map((r) => (
            <CarteParticipant key={r.id} reponse={r} showDispos={showDispos} />
          ))}
        </div>
      )}

      {/* Modale de validation */}
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
