import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Guitar, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { supabasePublic as supabase } from '../lib/supabase'

// ─── Jours ordonnés pour l'affichage ──────────────────────────────────────────
const ORDRE_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function triJours(slots) {
  if (!slots) return []
  return ORDRE_JOURS
    .filter(j => slots[j]?.length > 0)
    .map(j => ({ jour: j, creneaux: slots[j] }))
}

// ─── États possibles de la page ───────────────────────────────────────────────
const ETATS = {
  CHARGEMENT:  'chargement',
  SELECTION:   'selection',
  CONFIRMATION: 'confirmation',
  ERREUR:      'erreur',
}

export default function CreneauPage() {
  const { token } = useParams()
  const [etat, setEtat]           = useState(ETATS.CHARGEMENT)
  const [tokenData, setTokenData] = useState(null)
  const [erreurMsg, setErreurMsg] = useState('')
  const [selection, setSelection] = useState(null) // { jour, creneau }
  const [envoi, setEnvoi]         = useState(false)

  // Charge et vérifie le token au montage
  useEffect(() => {
    if (!token) {
      setErreurMsg('Lien invalide.')
      setEtat(ETATS.ERREUR)
      return
    }

    async function chargerToken() {
      const { data, error } = await supabase
        .from('survey_tokens')
        .select('token_type, used_at, expires_at, slots_proposes, linked_response_id, student_id')
        .eq('token', token)
        .single()

      if (error || !data) {
        setErreurMsg('Ce lien est invalide ou a expiré.')
        setEtat(ETATS.ERREUR)
        return
      }

      if (data.token_type !== 'creneau') {
        setErreurMsg('Ce lien n\'est pas un lien de choix de créneau.')
        setEtat(ETATS.ERREUR)
        return
      }

      if (data.used_at) {
        setErreurMsg('Ce lien a déjà été utilisé. Ton créneau a bien été enregistré.')
        setEtat(ETATS.ERREUR)
        return
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setErreurMsg('Ce lien a expiré. Contacte ton professeur pour en obtenir un nouveau.')
        setEtat(ETATS.ERREUR)
        return
      }

      if (!data.linked_response_id) {
        setErreurMsg('Ce lien n\'est pas associé à une réponse. Contacte ton professeur.')
        setEtat(ETATS.ERREUR)
        return
      }

      setTokenData(data)
      setEtat(ETATS.SELECTION)
    }

    chargerToken()
  }, [token])

  async function validerCreneau() {
    if (!selection || envoi) return
    setEnvoi(true)

    const { data: result, error } = await supabase.rpc('choose_slot_via_token', {
      p_token: token,
      p_day:   selection.jour,
      p_time:  selection.creneau,
    })

    if (error || result?.ok === false) {
      const code = result?.error
      if (code === 'token_used')    setErreurMsg('Ce lien a déjà été utilisé.')
      else if (code === 'token_expired') setErreurMsg('Ce lien a expiré.')
      else setErreurMsg('Une erreur est survenue. Réessaie ou contacte ton professeur.')
      setEtat(ETATS.ERREUR)
      return
    }

    setEtat(ETATS.CONFIRMATION)
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start py-12 px-4">
      {/* En-tête */}
      <div className="flex items-center gap-2 mb-8 text-guitar-500">
        <Guitar className="w-7 h-7" />
        <span className="font-display text-xl text-foreground">Hub Guitariste</span>
      </div>

      <div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-lg">
        {etat === ETATS.CHARGEMENT && (
          <div className="flex flex-col items-center gap-4 py-8 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-guitar-500" />
            <p className="text-sm">Chargement de tes créneaux…</p>
          </div>
        )}

        {etat === ETATS.ERREUR && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertCircle className="w-10 h-10 text-guitar-400" />
            <p className="text-sm text-muted-foreground">{erreurMsg}</p>
          </div>
        )}

        {etat === ETATS.CONFIRMATION && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <h2 className="font-display text-xl text-foreground">Créneau confirmé !</h2>
            <p className="text-sm text-muted-foreground">
              Ton créneau du <strong>{selection?.jour}</strong> à <strong>{selection?.creneau}</strong> a bien été enregistré.
              <br />Ton professeur te contactera pour la suite.
            </p>
          </div>
        )}

        {etat === ETATS.SELECTION && tokenData && (
          <>
            <h1 className="font-display text-2xl text-foreground mb-2">Choix de créneau</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Sélectionne le créneau qui te convient. Une seule sélection possible.
            </p>

            <div className="space-y-5">
              {triJours(tokenData.slots_proposes).map(({ jour, creneaux }) => (
                <div key={jour}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{jour}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {creneaux.map(c => {
                      const actif = selection?.jour === jour && selection?.creneau === c
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSelection({ jour, creneau: c })}
                          className={[
                            'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                            actif
                              ? 'border-guitar-500 bg-guitar-500/10 text-guitar-400 font-medium'
                              : 'border-border-subtle bg-surface text-foreground hover:border-guitar-400',
                          ].join(' ')}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {triJours(tokenData.slots_proposes).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun créneau disponible. Contacte ton professeur.
              </p>
            )}

            <button
              type="button"
              disabled={!selection || envoi}
              onClick={validerCreneau}
              className="mt-8 w-full py-3 rounded-xl bg-guitar-500 hover:bg-guitar-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {envoi ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              ) : (
                'Confirmer ce créneau'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
