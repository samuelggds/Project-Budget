import type { BudgetStatus } from "../types/Budget";

export const BUDGET_STATUSES: BudgetStatus[] = [
  "Enviado",
  "Recusado",
  "Em andamento",
  "Aprovado",
  "Pago",
];

export function getAllowedNextStatuses(status: BudgetStatus): BudgetStatus[] {
  if (status === "Enviado") return ["Em andamento", "Recusado"];
  if (status === "Em andamento") return ["Aprovado", "Recusado"];
  if (status === "Aprovado") return ["Pago"];
  return [];
}

export function canChangeBudgetStatus(from: BudgetStatus, to: BudgetStatus) {
  return getAllowedNextStatuses(from).includes(to);
}

export const isFinalBudgetStatus = (status: BudgetStatus) =>
  status === "Recusado" || status === "Pago";
