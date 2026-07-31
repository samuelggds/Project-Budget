import type { Budget, BudgetItem } from '../types/Budget'

export function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

export const calculateItemTotal = (item: BudgetItem) =>
  item.quantity * item.unitPrice

export const calculateBudgetTotal = (budget: Budget) =>
  budget.items.reduce((total, item) => total + calculateItemTotal(item), 0)
