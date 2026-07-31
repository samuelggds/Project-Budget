import type { Budget, BudgetStatus } from "../types/Budget";
import { apiRequest } from "../../shared/services/apiClient";

export const budgetApi = {
  list: () => apiRequest<Budget[]>("/budgets"),
  save: (budget: Budget) => apiRequest<Budget>(`/budgets/${budget.id}`, { method: "PUT", body: JSON.stringify(budget) }),
  changeStatus: (id: string, status: BudgetStatus) => apiRequest<Budget>(`/budgets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  uploadPdf: (id: string, pdf: Blob) => {
    const data = new FormData(); data.append("pdf", pdf, `orcamento-${id}.pdf`);
    return apiRequest<{ url: string }>(`/budgets/${id}/pdf`, { method: "POST", body: data, headers: {} });
  },
};
