import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/index.css'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { registerFieldStarServiceWorker } from './pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerFieldStarServiceWorker()
