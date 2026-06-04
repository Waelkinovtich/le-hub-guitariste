import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-void text-foreground">
          <div className="glass-panel rounded-2xl p-8 max-w-md text-center">
            <h1 className="text-lg font-semibold text-guitar-400 mb-2">Erreur d&apos;affichage</h1>
            <p className="text-sm text-muted-foreground mb-4">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl guitar-gradient text-white text-sm font-medium"
            >
              Recharger
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
