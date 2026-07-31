import { BudgetApplication } from './modules/budgets/components/BudgetApplication'
import { AuthGate } from './modules/auth/components/AuthGate'

export default function App() {
  return <AuthGate><BudgetApplication /></AuthGate>
}
