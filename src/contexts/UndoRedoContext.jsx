// Architecture undo/redo global — T7 (best-effort)
//
// Chaque action undoable appelle pushAction({ label, undo, redo }).
// Ctrl+Z exécute undo() de l'action la plus récente.
// Ctrl+Shift+Z (ou Ctrl+Y) exécute redo().
// Stack limité à MAX_STACK entrées pour éviter les fuites mémoire.

import { createContext, useContext, useRef, useCallback, useState } from 'react'

const MAX_STACK = 30

const UndoRedoContext = createContext(null)

export function UndoRedoProvider({ children }) {
  // Tableaux mutés directement (useRef) pour éviter des re-renders à chaque push
  const undoStack = useRef([])  // [{ label, undo, redo }, ...]
  const redoStack = useRef([])  // vidé à chaque nouveau pushAction

  // Label de la dernière opération annulée/rétablie — déclenche le badge de feedback
  const [feedback, setFeedback] = useState(null) // { text: string, id: number } | null
  const feedbackTimer = useRef(null)

  const showFeedback = useCallback((text) => {
    clearTimeout(feedbackTimer.current)
    setFeedback({ text, id: Date.now() })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2000)
  }, [])

  const pushAction = useCallback(({ label, undo, redo }) => {
    redoStack.current = []
    undoStack.current.push({ label, undo, redo })
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift()
  }, [])

  const undoLast = useCallback(async () => {
    const action = undoStack.current.pop()
    if (!action) return
    try {
      await action.undo()
      redoStack.current.push(action)
      showFeedback(`Annulé : ${action.label}`)
    } catch (e) {
      // L'annulation a échoué — on remet l'action dans le stack
      undoStack.current.push(action)
      showFeedback(`Impossible d'annuler : ${e.message}`)
    }
  }, [showFeedback])

  const redoLast = useCallback(async () => {
    const action = redoStack.current.pop()
    if (!action) return
    try {
      await action.redo()
      undoStack.current.push(action)
      showFeedback(`Rétabli : ${action.label}`)
    } catch (e) {
      redoStack.current.push(action)
      showFeedback(`Impossible de rétablir : ${e.message}`)
    }
  }, [showFeedback])

  const canUndo = useCallback(() => undoStack.current.length > 0, [])
  const canRedo = useCallback(() => redoStack.current.length > 0, [])

  return (
    <UndoRedoContext.Provider value={{ pushAction, undoLast, redoLast, canUndo, canRedo, feedback }}>
      {children}
    </UndoRedoContext.Provider>
  )
}

export function useUndoRedo() {
  return useContext(UndoRedoContext)
}
