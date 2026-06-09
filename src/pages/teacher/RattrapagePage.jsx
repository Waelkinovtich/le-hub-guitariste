import { useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchCancelledLessons } from '../../services/lessons'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { getRaisonLabel } from '../../utils/lessonStatus'
import { RotateCcw } from 'lucide-react'

function minutesToLabel(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return m + ' min'
  if (m === 0) return h + 'h'
  return h + 'h' + String(m).padStart(2, '0')
}

export default function RattrapagePage() {
  const { user } = useAuth()

  const load = useCallback(() => fetchCancelledLessons({ teacherId: user.id }), [user.id])
  const { data: lessons, loading, error, reload } = useFetch(load, [user.id])

  const { global: globalStats, parÉcole, parÉlève } = useMemo(() => {
    const all = lessons ?? []
    const annulés = all.filter((l) => l.status === 'annule_prof' && l.lessonType !== 'cesu')
    const rattrapés = all.filter((l) => l.status === 'rattrape' && l.lessonType !== 'cesu')
    const annulésCesu = all.filter((l) => l.status === 'annule_prof' && l.lessonType === 'cesu')

    let totalAnnulé = 0
    let totalRattrapé = 0
    const écoles = {}
    const élèves = {}

    annulés.forEach((l) => {
      totalAnnulé += l.durationMinutes ?? 0
      const école = l.lessonType === 'cesu' ? 'Cours particuliers (CESU)' : (l.schoolName || 'École de musique')
      if (!écoles[école]) écoles[école] = { annulé: 0, rattrapé: 0 }
      écoles[école].annulé += l.durationMinutes ?? 0
      const nom = l.studentName || 'Élève'
      if (!élèves[nom]) élèves[nom] = { annulé: 0, rattrapé: 0, studentId: l.studentId }
      élèves[nom].annulé += l.durationMinutes ?? 0
    })

    rattrapés.forEach((l) => {
      totalRattrapé += l.durationMinutes ?? 0
      const école = l.student?.schoolName || 'Cours particuliers'
      if (!écoles[école]) écoles[école] = { annulé: 0, rattrapé: 0 }
      écoles[école].rattrapé += l.durationMinutes ?? 0
      const nom = l.studentName || 'Élève'
      if (!élèves[nom]) élèves[nom] = { annulé: 0, rattrapé: 0, studentId: l.studentId }
      élèves[nom].rattrapé += l.durationMinutes ?? 0
    })

    return {
      global: { annulé: totalAnnulé, rattrapé: totalRattrapé, restant: totalAnnulé - totalRattrapé },
      parÉcole: Object.entries(écoles).map(([nom, v]) => ({ nom, ...v, restant: v.annulé - v.rattrapé })),
      parÉlève: Object.entries(élèves).map(([nom, v]) => ({ nom, ...v, restant: v.annulé - v.rattrapé })),
    }
  }, [lessons])

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-guitar-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Heures à rattraper</h1>
            <p className="text-muted-foreground mt-1">Cours annulés par le professeur</p>
          </div>
        </div>
      </header>

      {loading ? <LoadingBlock label="Chargement" /> : error ? <ErrorBlock message={error} onRetry={reload} /> : (
        <>
          {/* Compteur global */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-guitar-400">{minutesToLabel(globalStats.annulé)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total annulé</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-green-400">{minutesToLabel(globalStats.rattrapé)}</p>
              <p className="text-sm text-muted-foreground mt-1">Déjà rattrapé</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-amber-400">{minutesToLabel(globalStats.restant)}</p>
              <p className="text-sm text-muted-foreground mt-1">Restant à rattraper</p>
            </div>
          </div>

          {/* Par école */}
          {parÉcole.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Par école</h2>
              <div className="space-y-3">
                {parÉcole.map((e) => (
                  <div key={e.nom} className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <p className="font-medium">{e.nom}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-guitar-400">{minutesToLabel(e.annulé)} annulés</span>
                      <span className="text-green-400">{minutesToLabel(e.rattrapé)} rattrapés</span>
                      <span className="text-amber-400 font-semibold">{minutesToLabel(e.restant)} restants</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Par élève */}
          {parÉlève.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Par élève</h2>
              <div className="space-y-3">
                {parÉlève.map((e) => (
                  <div key={e.nom} className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <p className="font-medium">{e.nom}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-guitar-400">{minutesToLabel(e.annulé)} annulés</span>
                      <span className="text-green-400">{minutesToLabel(e.rattrapé)} rattrapés</span>
                      <span className="text-amber-400 font-semibold">{minutesToLabel(e.restant)} restants</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {parÉlève.length === 0 && <EmptyBlock message="Aucun cours annulé pour le moment." />}

          {/* Détail des cours annulés */}
          {(lessons ?? []).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Detail des cours annulés</h2>
              <div className="space-y-2">
                {(lessons ?? []).map((l) => {
                  const raison = getRaisonLabel(l.cancelReason)
                  return (
                    <div key={l.id} className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{l.studentName}</p>
                        <p className="text-sm text-muted-foreground">{l.dateLabel} {l.timeLabel} — {l.durationMinutes} min</p>
                      </div>
                      {raison && (
                        <span className="text-sm px-3 py-1 rounded-full bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
                          {raison.emoji} {raison.label}
                        </span>
                      )}
                      <span className={'text-xs px-2 py-1 rounded-full font-medium ' + (l.status === 'rattrape' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400')}>
                        {l.status === 'rattrape' ? 'Rattrapé' : 'À rattraper'}
                      </span>
                    </div>
                  )
                })}
              </div>
          </section>
          )}
        </>
      )}
    </div>
  )
}
