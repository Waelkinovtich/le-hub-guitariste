// Modal d'émargement de groupe pour la PlanningPage.
// S'ouvre quand l'enseignant clique sur l'icône émargement d'une tuile de groupe.
// Wrap GroupMembresPanel dans un overlay centré avec le nom du groupe et la date.

import { X } from 'lucide-react'
import GroupMembresPanel from './GroupMembresPanel'

/**
 * @param {object}   lesson          Objet lesson complet (lesson._groupSessionId, lesson._groupId, lesson.topic, lesson.lessonDate, lesson.groupType, lesson.schoolName, lesson.sessionStatus)
 * @param {string}   teacherId       UUID de l'enseignant
 * @param {Function} onClose         () → ferme le modal
 * @param {Function} onSummaryChange ({ present, total }) → met à jour le badge tuile dans PlanningPage
 * @param {Function} [onCancelled]   () → callback après annulation de la séance
 */
export default function GroupAttendanceModal({ lesson, teacherId, onClose, onSummaryChange, onCancelled }) {
  if (!lesson) return null

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={handleBackdrop}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-surface-raised border border-border-subtle shadow-2xl p-5"
        style={{ maxHeight: '80vh', overflowY: 'auto' }}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{lesson.topic ?? 'Groupe'}</h2>
            {lesson.lessonDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(lesson.lessonDate).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panneau membres */}
        <GroupMembresPanel
          sessionId={lesson._groupSessionId}
          groupId={lesson._groupId}
          teacherId={teacherId}
          onSummaryChange={onSummaryChange}
          groupType={lesson.groupType}
          lessonDate={lesson.lessonDate}
          lessonTime={lesson.lessonTime}
          durationMinutes={lesson.durationMinutes}
          schoolName={lesson.schoolName}
          sessionDbStatus={lesson.sessionStatus}
          onCancelled={onCancelled ?? onClose}
        />
      </div>
    </div>
  )
}
