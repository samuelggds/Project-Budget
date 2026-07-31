import type { Budget } from "../types/Budget";

const STORAGE_KEY = "mg-orcamentos";

export function listBudgets(): Budget[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export function persistBudgets(budgets: Budget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
}
