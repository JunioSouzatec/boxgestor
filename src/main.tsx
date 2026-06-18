import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { iniciarRegistroPwa } from '@/lib/pwa-update'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { APP_NAME } from '@/lib/app-brand'
import './index.css'
import App from './App'

iniciarRegistroPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary titulo={`Erro fatal ao carregar o ${APP_NAME}`}>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
