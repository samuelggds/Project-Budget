import { BudgetApplication } from './modules/budgets/components/BudgetApplication'
import { AuthGate } from './modules/auth/components/AuthGate'
import { AppUpdater } from './modules/updater/components/AppUpdater'
import { LandingPage } from './modules/landing/components/LandingPage'

function isDesktopApp() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export default function App() {
  // Preserve the native desktop app workflow. The marketing homepage exists only on web.
  if (!isDesktopApp() && !window.location.pathname.startsWith('/admin')) {
    return <LandingPage />
  }

  return (
    <AuthGate>
      <BudgetApplication />
      <AppUpdater />
    </AuthGate>
  )
}
