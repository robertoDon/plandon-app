import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { SessionProvider } from './auth/useSession'
import { ToastProvider } from './ui'
import App from './app/App'
import './styles/tokens.css'
import './styles/base.css'

// Dev only: the primitives gallery at /dev/ui, outside the session guard. Dropped from the production build.
const DevUi = import.meta.env.DEV && location.pathname === '/dev/ui' ? lazy(() => import('./ui/DevUi')) : null

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reduced motion: Motion drops transforms and keeps opacity, i.e. cross-fades */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          {DevUi ? (
            <Suspense fallback={null}><DevUi /></Suspense>
          ) : (
            <SessionProvider>
              <App />
            </SessionProvider>
          )}
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
