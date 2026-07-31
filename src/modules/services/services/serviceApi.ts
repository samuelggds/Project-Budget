import type { Service } from "../types/Service";
import { apiRequest } from "../../shared/services/apiClient";

export const serviceApi = {
  list: () => apiRequest<Service[]>("/services"),
  findByCode: (code: string) => apiRequest<Service>(`/services/code/${encodeURIComponent(code)}`),
  create: (service: Omit<Service, "id">) => apiRequest<Service>("/services", { method: "POST", body: JSON.stringify(service) }),
  update: (service: Service) => apiRequest<Service>(`/services/${service.id}`, { method: "PUT", body: JSON.stringify(service) }),
};
