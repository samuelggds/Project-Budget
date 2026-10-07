import { BudgetApplication } from './modules/budgets/components/BudgetApplication'
import { AuthGate } from './modules/auth/components/AuthGate'
import { AppUpdater } from './modules/updater/components/AppUpdater'

export default function App() {
  return (
    <AuthGate>
      <BudgetApplication />
      <AppUpdater />
    </AuthGate>
  )
}
