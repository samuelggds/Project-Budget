import type { Budget } from "../../budgets/types/Budget";

export const HISTORY_PAGE_SIZE = 8;

type Filters = { search: string; status: string; period: string };

export function filterBudgets(budgets: Budget[], filters: Filters) {
  const minimum = new Date();
  if (filters.period !== "Todos")
    minimum.setDate(minimum.getDate() - Number(filters.period));

  return budgets
    .filter((budget) =>
      `${budget.number} ${budget.client.name}`
        .toLowerCase()
        .includes(filters.search.toLowerCase()),
    )
    .filter(
      (budget) =>
        filters.status === "Todos" || budget.status === filters.status,
    )
    .filter(
      (budget) =>
        filters.period === "Todos" ||
        new Date(`${budget.issuedAt}T12:00:00`) >= minimum,
    )
    .sort(
      (first, second) =>
        new Date(second.updatedAt || second.issuedAt).getTime() -
        new Date(first.updatedAt || first.issuedAt).getTime(),
    );
}

export const paginateBudgets = (budgets: Budget[], page: number) =>
  budgets.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
