import type { Client } from "../types/Client";
import { apiRequest } from "../../shared/services/apiClient";

export const clientApi = {
  list: () => apiRequest<Client[]>("/clients"),
  create: (client: Omit<Client, "id">) => apiRequest<Client>("/clients", { method: "POST", body: JSON.stringify(client) }),
  update: (client: Client) => apiRequest<Client>(`/clients/${client.id}`, { method: "PUT", body: JSON.stringify(client) }),
};
