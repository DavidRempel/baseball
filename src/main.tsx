import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/zilla-slab/600.css'
import '@fontsource/zilla-slab/700.css'
import '@fontsource/karla/400.css'
import '@fontsource/karla/600.css'
import '@fontsource/karla/700.css'
import './index.css'
import App from './App.tsx'
import { applyBrandTokens } from './brand.ts'
import { registerFieldStarServiceWorker } from './pwa.ts'

applyBrandTokens()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerFieldStarServiceWorker()
