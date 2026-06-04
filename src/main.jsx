import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * 0 = test minimal (vérifie que React + Vite marchent)
 * 1 = application complète (connexion, dashboards…)
 */
const APP_MODE = 1

const rootEl = document.getElementById('root')

function showFatalError(message) {
  if (!rootEl) return
  rootEl.innerHTML = `
    <div style="min-height:100vh;padding:2rem;font-family:system-ui;background:#060608;color:#fafafa">
      <h1 style="color:#dc2626;margin:0 0 1rem">Erreur de chargement</h1>
      <pre style="white-space:pre-wrap;color:#fca5a5;font-size:14px">${message}</pre>
      <p style="color:#a1a1aa;margin-top:1rem">Ouvrez la console (F12) pour plus de détails.</p>
    </div>
  `
}

if (!rootEl) {
  document.body.innerHTML =
    '<p style="color:red;padding:2rem;font-family:system-ui">Erreur : #root introuvable</p>'
} else if (APP_MODE === 0) {
  createRoot(rootEl).render(
    <StrictMode>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          background: '#060608',
          color: '#fafafa',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#dc2626', margin: 0 }}>
          React fonctionne
        </p>
        <p style={{ fontSize: '1.125rem', margin: 0 }}>Hub du Guitariste — test d&apos;affichage</p>
        <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0 }}>
          Passez <strong>APP_MODE</strong> à <strong>1</strong> dans <code>src/main.jsx</code> pour l&apos;app complète.
        </p>
      </div>
    </StrictMode>,
  )
} else {
  import('./bootstrap.jsx')
    .then(({ mountApp }) => mountApp(rootEl))
    .catch((err) => {
      console.error('[main] échec chargement app:', err)
      showFatalError(err?.message || String(err))
    })
}
