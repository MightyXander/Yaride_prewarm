import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportError } from './lib/errorReporter.ts'

// Issue #470: любая необработанная ошибка фронта — трейсом в БД (error_traces).
// Дедуп/лимиты/молчаливое глотание сбоев отправки — внутри reportError.
window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, {
    handler: 'window.error',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { handler: 'window.unhandledrejection' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
