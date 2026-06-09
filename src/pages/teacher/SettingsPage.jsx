import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { MapPin, Check } from 'lucide-react'

const ZONES = [
  { value: 'A', label: 'Zone A', description: 'Academies de Paris, Versailles, Creteil...' },
  { value: 'B', label: 'Zone B', description: 'Academies de Lille, Nancy, Strasbourg...' },
  { value: 'C', label: 'Zone C', description: 'Academies de Bordeaux, Lyon, Marseille...' },
]

export default function SettingsPage() {
  const { user, setUser } = useAuth()
  const [zone, setZone] = useState(user?.schoolZone ?? 'B')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ school_zone: zone })
      .eq('id', user.id)
    setSaving(false)
    if (err) {
      setError('Erreur lors de la sauvegarde : ' + err.message)
    } else {
      setUser((prev) => ({ ...prev, schoolZone: zone }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Reglages</h1>
        <p className="text-muted-foreground mt-1">Personnalisez votre espace professeur</p>
      </header>

      <section className="glass-panel rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-guitar-400" />
          </div>
          <div>
            <h2 className="font-semibold">Zone scolaire</h2>
            <p className="text-sm text-muted-foreground">Utilisee pour les vacances scolaires dans le planning</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {ZONES.map((z) => (
            <button key={z.value} onClick={() => setZone(z.value)}
              className={'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ' +
                (zone === z.value
                  ? 'border-guitar-600/60 bg-guitar-600/10 text-foreground'
                  : 'border-border-subtle hover:bg-surface-overlay text-muted-foreground')}>
              <div>
                <p className="font-medium text-sm">{z.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{z.description}</p>
              </div>
              {zone === z.value && <Check className="w-4 h-4 text-guitar-400 shrink-0" />}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? 'Sauvegarde...' : saved ? 'Enregistre !' : 'Enregistrer'}
        </button>
      </section>
    </div>
  )
}
