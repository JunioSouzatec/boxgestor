import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { APP_NAME } from '@/lib/app-brand'
import './index.css'
import App from './App'

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('[Craft PWA] App pronto para uso offline.')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary titulo={`Erro fatal ao carregar o ${APP_NAME}`}>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
