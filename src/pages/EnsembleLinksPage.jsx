import { useState, useEffect } from 'react'
import { Music2, Plus, Copy, Check, Link2, Users, Loader2, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Construit l'URL publique du formulaire ensemble à partir du token
function buildUrl(token) {
  return `${window.location.origin}/sondage-ensemble/${token}`
}

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600 transition-colors'
const selectCls = inputCls + ' cursor-pointer'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Composant copie-lien ─────────────────────────────────────────────────────

function CopyButton({ url }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs text-muted-foreground hover:text-guitar-400 hover:border-guitar-600/40 transition-colors"
      title="Copier le lien"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-guitar-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copié !' : 'Copier'}
    </button>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EnsembleLinksPage() {
  const { user } = useAuth()
  const [tokens,  setTokens]  = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur,  setErreur]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  // Formulaire de création
  const [formType,  setFormType]  = useState('generique')
  const [formLabel, setFormLabel] = useState('')
  const [formErr,   setFormErr]   = useState('')

  // ── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('ensemble_tokens')
        .select('id, token, token_type, label, used_at, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        if (error) setErreur(error.message)
        else setTokens(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // ── Création d'un token ─────────────────────────────────────────────────────

  async function handleCreer(e) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    const { data, error } = await supabase
      .from('ensemble_tokens')
      .insert({
        teacher_id: user.id,
        token_type: formType,
        label:      formLabel.trim() || null,
      })
      .select('id, token, token_type, label, used_at, created_at')
      .single()
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    setTokens((prev) => [data, ...prev])
    setFormLabel('')
    setFormType('generique')
  }

  // ── Suppression ─────────────────────────────────────────────────────────────

  async function handleSupprimer(id) {
    if (!window.confirm('Supprimer ce lien ? Les réponses déjà reçues ne seront pas supprimées.')) return
    const { error } = await supabase.from('ensemble_tokens').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    setTokens((prev) => prev.filter((t) => t.id !== id))
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
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Link2 className="w-5 h-5 text-guitar-400" />
        <div>
          <h1 className="text-lg font-semibold">Liens d'inscription — Répétitions d'ensemble</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Créez des liens à envoyer aux participants pour recueillir leurs disponibilités.
          </p>
        </div>
      </div>

      {erreur && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />{erreur}
        </div>
      )}

      {/* ── Formulaire de création ──────────────────────────────────────── */}
      <form onSubmit={handleCreer} className="glass-panel rounded-xl p-5 space-y-4 border border-border">
        <p className="text-sm font-medium">Créer un lien</p>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Type de lien</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'generique',   label: 'Générique',   desc: 'Partageable à tous (lien réutilisable)' },
              { value: 'individuel',  label: 'Individuel',  desc: 'Usage unique — pour une personne précise' },
            ].map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormType(value)}
                className={`px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                  formType === value
                    ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                    : 'border-border-subtle bg-surface-raised text-muted-foreground hover:border-border'
                }`}
              >
                <p className="font-medium">{label}</p>
                <p className="text-xs mt-0.5 opacity-70">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Libellé <span className="opacity-60">(optionnel)</span></label>
          <input
            type="text"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="ex : Répét jazz automne 2026"
            maxLength={120}
            className={inputCls}
          />
        </div>

        {formErr && <p className="text-xs text-red-400">{formErr}</p>}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-guitar-600 text-white text-sm font-medium hover:bg-guitar-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Créer le lien
        </button>
      </form>

      {/* ── Liste des tokens ────────────────────────────────────────────── */}
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Aucun lien créé pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{tokens.length} lien{tokens.length > 1 ? 's' : ''}</p>
          {tokens.map((t) => {
            const url = buildUrl(t.token)
            const isUsed = t.used_at && t.token_type === 'individuel'
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-raised hover:border-border transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      t.token_type === 'generique'
                        ? 'bg-guitar-600/15 text-guitar-400 border-guitar-600/25'
                        : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                    }`}>
                      {t.token_type === 'generique' ? 'Générique' : 'Individuel'}
                    </span>
                    {t.label && <span className="text-sm font-medium">{t.label}</span>}
                    {isUsed && (
                      <span className="text-xs px-1.5 py-0.5 rounded border bg-surface-overlay text-muted-foreground border-border-subtle">
                        Utilisé le {fmtDate(t.used_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{url}</p>
                  <p className="text-xs text-muted-foreground">Créé le {fmtDate(t.created_at)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isUsed && <CopyButton url={url} />}
                  <button
                    type="button"
                    onClick={() => handleSupprimer(t.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Supprimer ce lien"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
