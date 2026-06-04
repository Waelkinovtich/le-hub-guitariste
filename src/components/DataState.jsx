export function LoadingBlock({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-8 h-8 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="glass-panel rounded-2xl p-6 text-center max-w-md mx-auto my-8">
      <p className="text-guitar-400 text-sm mb-4">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-foreground hover:text-guitar-400 transition-colors"
        >
          Réessayer
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ message }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-12">{message}</p>
  )
}
