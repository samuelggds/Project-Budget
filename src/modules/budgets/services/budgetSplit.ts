import type { Budget } from "../types/Budget";
import { calculateBudgetTotal } from "./budgetCalculations";

export const SPLIT_RATE = 0.05;

export const hasSplit = (budget: Budget) =>
  budget.status === "Aprovado" || budget.status === "Pago";

export const calculateBudgetSplit = (budget: Budget) =>
  hasSplit(budget) ? calculateBudgetTotal(budget) * SPLIT_RATE : 0;

export const calculateAllSplits = (budgets: Budget[]) =>
  budgets.reduce((total, budget) => total + calculateBudgetSplit(budget), 0);

export const calculatePendingSplits = (budgets: Budget[]) =>
  budgets.reduce((total, budget) =>
    total + (!budget.splitPaidAt ? calculateBudgetSplit(budget) : 0), 0);
