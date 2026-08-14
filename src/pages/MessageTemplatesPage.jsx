import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, Loader2, Copy,
  AlertCircle, MessageSquare, AlertTriangle, CheckSquare, Square,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchTeacherStudents } from '../services/students'
import {
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate, applyVariables,
  AUDIENCE_TYPES, CLOSING_FORMULA, REGISTER_HINT, INDIVIDUAL_VARS,
} from '../services/messageTemplates'

// ─── Variables disponibles ────────────────────────────────────────────────────

const VARIABLES = [
  { key: '{prenom}',  desc: "Prénom de l'élève" },
  { key: '{nom}',     desc: "Nom de l'élève" },
  { key: '{ecole}',   desc: "Nom de l'école" },
  { key: '{jour}',    desc: 'Jour du cours (à compléter manuellement)' },
  { key: '{heure}',   desc: 'Heure du cours (à compléter manuellement)' },
  { key: '{duree}',   desc: 'Durée du cours (à compléter manuellement)' },
]

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600'

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function audienceLabel(v) {
  return AUDIENCE_TYPES.find((t) => t.value === v)?.label ?? 'Public non défini'
}

// ─── Formulaire création / édition ───────────────────────────────────────────

function TemplateForm({ initial, teacherId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    title:         initial?.title         ?? '',
    content:       initial?.content       ?? '',
    audience_type: initial?.audience_type ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const insertVariable = (key) => {
    setForm((p) => ({ ...p, content: p.content + key }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      setError('Le titre et le contenu sont obligatoires.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = initial?.id
        ? await updateTemplate(initial.id, form)
        : await createTemplate(teacherId, form)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-5 space-y-4">
      <p className="text-xs font-semibold text-guitar-400 uppercase tracking-wider">
        {initial?.id ? 'Modifier le modèle' : 'Nouveau modèle'}
      </p>

      {/* Titre */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Titre du modèle</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Ex : Absence non prévenue, Rappel rentrée…"
          className={inputCls}
          required
        />
      </div>

      {/* Public / registre */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Public visé</label>
        <select
          value={form.audience_type}
          onChange={(e) => setForm((p) => ({ ...p, audience_type: e.target.value }))}
          className={inputCls}
        >
          <option value="">— Choisir le registre —</option>
          {AUDIENCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {form.audience_type && (
          <p className="text-xs text-muted-foreground mt-1.5 bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
            {REGISTER_HINT[form.audience_type]}
          </p>
        )}
      </div>

      {/* Variables + textarea */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Corps du message</label>
        <p className="text-xs text-muted-foreground bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle mb-2 leading-relaxed">
          Rédige ton message ici. Utilise les variables ci-dessous pour insérer automatiquement
          les informations de l'élève. La formule de politesse finale sera ajoutée automatiquement
          lors de la copie — ne l'écris pas ici.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {VARIABLES.map((v) => (
            <button
              key={v.key} type="button" onClick={() => insertVariable(v.key)} title={v.desc}
              className="px-2 py-1 rounded-lg bg-guitar-600/10 border border-guitar-600/20 text-guitar-400 text-xs font-mono hover:bg-guitar-600/20 transition-colors"
            >
              {v.key}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Les variables <code className="text-xs bg-surface-raised px-1 rounded">{'{jour}'}</code>,{' '}
          <code className="text-xs bg-surface-raised px-1 rounded">{'{heure}'}</code> et{' '}
          <code className="text-xs bg-surface-raised px-1 rounded">{'{duree}'}</code> devront être
          ajustées manuellement après génération.
        </p>
        <textarea
          value={form.content}
          onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
          placeholder={'Bonjour {prenom},\nJe vous informe que…'}
          rows={6}
          className={inputCls + ' resize-y'}
          required
        />
      </div>

      {/* Aperçu formule de clôture */}
      {form.audience_type && CLOSING_FORMULA[form.audience_type] && (
        <div className="text-xs text-muted-foreground bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
          <span className="font-medium">Formule de clôture ajoutée automatiquement :</span>{' '}
          <span className="italic whitespace-pre">{CLOSING_FORMULA[form.audience_type]}</span>
        </div>
      )}

      {error && <p className="text-xs text-guitar-400">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initial?.id ? 'Mettre à jour' : 'Créer le modèle'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />Annuler
        </button>
      </div>
    </form>
  )
}

// ─── Sélecteur de destinataires ───────────────────────────────────────────────

function RecipientSelector({ students, selected, onChange }) {
  const schools = useMemo(() => {
    const seen = new Set()
    return students.map((s) => s.schoolName ?? '').filter((n) => { if (!n || seen.has(n)) return false; seen.add(n); return true })
  }, [students])

  const allSelected  = students.length > 0 && students.every((s) => selected.has(s.id))
  const noneSelected = selected.size === 0

  const toggleAll = () => {
    if (allSelected) onChange(new Set())
    else onChange(new Set(students.map((s) => s.id)))
  }

  const toggleSchool = (school) => {
    const inSchool = students.filter((s) => (s.schoolName ?? '') === school).map((s) => s.id)
    const allIn = inSchool.every((id) => selected.has(id))
    const next = new Set(selected)
    if (allIn) inSchool.forEach((id) => next.delete(id))
    else inSchool.forEach((id) => next.add(id))
    onChange(next)
  }

  const toggleOne = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(next)
  }

  const schoolActive = (school) => {
    const inSchool = students.filter((s) => (s.schoolName ?? '') === school)
    return inSchool.length > 0 && inSchool.every((s) => selected.has(s.id))
  }

  return (
    <div className="space-y-2">
      {/* Pills école */}
      <div className="flex flex-wrap gap-1.5">
        {schools.map((school) => (
          <button
            key={school} type="button" onClick={() => toggleSchool(school)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              schoolActive(school)
                ? 'guitar-gradient text-white'
                : 'bg-surface-raised border border-border-subtle text-muted-foreground hover:text-foreground'
            }`}
          >
            {school}
          </button>
        ))}
        <button
          type="button" onClick={toggleAll}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-raised border border-border-subtle text-muted-foreground hover:text-foreground transition-colors"
        >
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>

      {/* Liste élèves */}
      <div className="max-h-48 overflow-y-auto space-y-0.5 bg-surface-raised rounded-xl border border-border-subtle px-2 py-2">
        {students.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 px-1">Aucun élève trouvé.</p>
        )}
        {students.map((s) => (
          <button
            key={s.id} type="button" onClick={() => toggleOne(s.id)}
            className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-surface-overlay transition-colors text-left"
          >
            {selected.has(s.id)
              ? <CheckSquare className="w-4 h-4 text-guitar-400 shrink-0" />
              : <Square      className="w-4 h-4 text-muted shrink-0" />
            }
            <span className="text-xs text-foreground truncate">{s.name}</span>
            {s.schoolName && (
              <span className="ml-auto text-xs text-muted-foreground shrink-0 truncate max-w-[120px]">{s.schoolName}</span>
            )}
          </button>
        ))}
      </div>

      {!noneSelected && (
        <p className="text-xs text-muted-foreground">
          {selected.size} élève{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

// ─── Carte d'un modèle ────────────────────────────────────────────────────────

function TemplateCard({ template, students, onEdit, onDelete, deleting }) {
  const [selected, setSelected] = useState(new Set())
  const [copied, setCopied]     = useState(false)

  const formula = CLOSING_FORMULA[template.audience_type] ?? ''

  const hasIndividualVars = INDIVIDUAL_VARS.some((v) => (template.content ?? '').includes(v))
  const multipleSelected  = selected.size > 1
  const showGroupWarning  = multipleSelected && hasIndividualVars

  const singleStudent = selected.size === 1
    ? students.find((s) => s.id === [...selected][0]) ?? null
    : null

  const bodyText = singleStudent
    ? applyVariables(template.content, singleStudent)
    : template.content

  const fullText = formula ? `${bodyText}\n\n${formula}` : bodyText

  const handleCopy = async () => {
    const ok = await copyToClipboard(fullText)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <MessageSquare className="w-4 h-4 text-guitar-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight">{template.title}</h3>
            {template.audience_type && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-guitar-600/10 border border-guitar-600/20 text-guitar-400">
                {audienceLabel(template.audience_type)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-overlay transition-colors"
            title="Modifier"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} disabled={deleting}
            className="p-1.5 rounded-lg text-muted hover:text-guitar-400 hover:bg-guitar-600/10 transition-colors"
            title="Supprimer"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Étape 1 — Modèle */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          1 · Modèle de base
        </p>
        <div className="bg-surface-raised rounded-xl border border-border-subtle px-3 py-2.5 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {template.content}
        </div>
      </div>

      {/* Étape 2 — Destinataires */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          2 · Choisir les destinataire(s)
        </p>
        <RecipientSelector students={students} selected={selected} onChange={setSelected} />
      </div>

      {/* Avertissement variables individuelles en mode groupe */}
      {showGroupWarning && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Ce modèle contient des variables individuelles ({INDIVIDUAL_VARS.filter((v) => template.content.includes(v)).join(', ')}).
            Pour {selected.size} élèves sélectionnés, le texte sera identique et les variables resteront non remplacées.
          </span>
        </div>
      )}

      {/* Rappel de registre */}
      {template.audience_type && REGISTER_HINT[template.audience_type] && (
        <div className="text-xs text-muted-foreground bg-surface-raised rounded-lg px-3 py-2 border border-border-subtle">
          {REGISTER_HINT[template.audience_type]}
        </div>
      )}

      {/* Étape 3 — Aperçu + copie */}
      {selected.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            3 · Aperçu &amp; copie
          </p>
          <p className="text-xs text-muted-foreground">
            {singleStudent ? `Texte personnalisé pour ${singleStudent.name} :` : 'Texte brut (variables non remplacées) :'}
          </p>
          <div className="bg-surface-raised rounded-xl border border-guitar-600/20 px-3 py-2.5 text-xs whitespace-pre-wrap leading-relaxed">
            {bodyText}
            {formula && (
              <>
                {'\n\n'}
                <span className="text-muted-foreground">{formula}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bouton copier — toujours visible */}
      <button
        onClick={handleCopy}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
          copied
            ? 'bg-green-500/15 border border-green-500/30 text-green-600 dark:text-green-400'
            : 'border border-border-subtle hover:bg-surface-overlay text-muted-foreground hover:text-foreground'
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copié !' : selected.size === 0 ? 'Copier le texte brut' : 'Copier le texte'}
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MessageTemplatesPage() {
  const [teacherId, setTeacherId]       = useState(null)
  const [templates, setTemplates]       = useState([])
  const [students, setStudents]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showForm, setShowForm]         = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deletingId, setDeletingId]     = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Non authentifié'); setLoading(false); return }
      setTeacherId(user.id)
      try {
        const [tmpl, studs] = await Promise.all([
          fetchTemplates(user.id),
          fetchTeacherStudents(user.id),
        ])
        setTemplates(tmpl)
        setStudents(studs)
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleDelete = async (tmpl) => {
    if (!window.confirm(`Supprimer le modèle "${tmpl.title}" ?`)) return
    setDeletingId(tmpl.id)
    try {
      await deleteTemplate(tmpl.id)
      setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id))
    } catch (err) {
      alert('Erreur : ' + err.message)
    }
    setDeletingId(null)
  }

  const handleSaved = (saved) => {
    setTemplates((prev) => {
      const without = prev.filter((t) => t.id !== saved.id)
      return [...without, saved].sort((a, b) => a.title.localeCompare(b.title))
    })
    setShowForm(false)
    setEditingTemplate(null)
  }

  return (
    <div className="p-6 sm:p-8 max-w-3xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Modèles de messages</h1>
          <p className="text-muted-foreground mt-1">
            Rédigez vos messages-types une fois, réutilisez-les en un clic avec les données de chaque élève.
          </p>
        </div>
        {!showForm && !editingTemplate && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />Nouveau modèle
          </button>
        )}
      </header>

      {error && (
        <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </p>
      )}

      {(showForm || editingTemplate) && (
        <TemplateForm
          initial={editingTemplate}
          teacherId={teacherId}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditingTemplate(null) }}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Chargement…
        </div>
      ) : templates.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <MessageSquare className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucun modèle enregistré.</p>
          <p className="text-xs text-muted mt-1">Créez votre premier modèle ci-dessus.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              template={tmpl}
              students={students}
              onEdit={() => { setEditingTemplate(tmpl); setShowForm(false) }}
              onDelete={() => handleDelete(tmpl)}
              deleting={deletingId === tmpl.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
