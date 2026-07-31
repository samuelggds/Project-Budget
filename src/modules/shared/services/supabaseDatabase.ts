import type { Budget, BudgetStatus } from "../../budgets/types/Budget";
import type { Client } from "../../clients/types/Client";
import type { Service } from "../../services/types/Service";
import { supabase } from "../../auth/services/supabase";

type DatabaseStatus = "ENVIADO" | "RECUSADO" | "EM_ANDAMENTO" | "APROVADO" | "PAGO";

const toDatabaseStatus: Record<BudgetStatus, DatabaseStatus> = {
  Enviado: "ENVIADO",
  Recusado: "RECUSADO",
  "Em andamento": "EM_ANDAMENTO",
  Aprovado: "APROVADO",
  Pago: "PAGO",
};

const fromDatabaseStatus: Record<DatabaseStatus, BudgetStatus> = {
  ENVIADO: "Enviado",
  RECUSADO: "Recusado",
  EM_ANDAMENTO: "Em andamento",
  APROVADO: "Aprovado",
  PAGO: "Pago",
};

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number(value || 0);

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: text(row.id), name: text(row.name), document: text(row.document),
    phone: text(row.phone), email: text(row.email), contact: text(row.contact),
    address: text(row.address), city: text(row.city), state: text(row.state), cep: text(row.cep),
  };
}

function mapService(row: Record<string, unknown>): Service {
  return {
    id: text(row.id), code: text(row.code), description: text(row.description),
    unit: text(row.unit), unitPrice: number(row.unit_price),
  };
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadDatabase() {
  const [clientsResult, servicesResult, budgetsResult] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("services").select("*").order("created_at", { ascending: false }),
    supabase.from("budgets").select("*, clients(*), budget_items(*)").order("updated_at", { ascending: false }),
  ]);
  assertNoError(clientsResult.error); assertNoError(servicesResult.error); assertNoError(budgetsResult.error);

  const clients = (clientsResult.data || []).map((row) => mapClient(row as Record<string, unknown>));
  const services = (servicesResult.data || []).map((row) => mapService(row as Record<string, unknown>));
  const budgets: Budget[] = (budgetsResult.data || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const clientRow = row.clients as Record<string, unknown> | null;
    const items = (row.budget_items as Record<string, unknown>[] | null) || [];
    return {
      id: text(row.id), number: text(row.number), issuedAt: text(row.issued_at),
      validDays: number(row.valid_days),
      status: fromDatabaseStatus[row.status as DatabaseStatus],
      client: clientRow ? mapClient(clientRow) : { id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" },
      payment: text(row.payment), notes: text(row.notes), updatedAt: text(row.updated_at),
      pdfSavedAt: row.pdf_url ? text(row.updated_at) : undefined,
      items: items.map((item) => ({
        id: text(item.id), serviceId: text(item.service_id), serviceCode: text(item.service_code),
        description: text(item.description), quantity: number(item.quantity),
        unit: text(item.unit), unitPrice: number(item.unit_price),
      })),
    };
  });
  return { clients, services, budgets };
}

export async function saveClientToDatabase(client: Client) {
  const { data, error } = await supabase.from("clients").upsert({
    id: client.id, name: client.name, document: client.document || null,
    phone: client.phone || null, email: client.email || null, contact: client.contact || null,
    address: client.address || null, city: client.city || null, state: client.state || null,
    cep: client.cep || null, updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error); return mapClient(data as Record<string, unknown>);
}

export async function saveServiceToDatabase(service: Service) {
  const { data, error } = await supabase.from("services").upsert({
    id: service.id, code: service.code, description: service.description,
    unit: service.unit, unit_price: service.unitPrice, updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error); return mapService(data as Record<string, unknown>);
}

export async function deleteServiceFromDatabase(id: string) {
  const { error } = await supabase.from("services").delete().eq("id", id);
  assertNoError(error);
}

export async function saveBudgetToDatabase(budget: Budget) {
  const updatedAt = new Date().toISOString();
  let client = budget.client;
  if (!client.id && client.name.trim()) {
    client = await saveClientToDatabase({ ...client, id: crypto.randomUUID() });
  }
  const { error: budgetError } = await supabase.from("budgets").upsert({
    id: budget.id, number: budget.number, client_id: client.id || null,
    issued_at: budget.issuedAt, valid_days: budget.validDays,
    status: toDatabaseStatus[budget.status], payment: budget.payment || null,
    notes: budget.notes || null, updated_at: updatedAt,
  });
  assertNoError(budgetError);

  const { error: deleteError } = await supabase.from("budget_items").delete().eq("budget_id", budget.id);
  assertNoError(deleteError);
  if (budget.items.length) {
    const { error: itemsError } = await supabase.from("budget_items").insert(budget.items.map((item) => ({
      id: item.id, budget_id: budget.id, service_id: item.serviceId || null,
      service_code: item.serviceCode || null, description: item.description || "Item ou serviço",
      quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice,
    })));
    assertNoError(itemsError);
  }
  return { ...budget, client, updatedAt };
}

export async function deleteBudgetFromDatabase(id: string) {
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  assertNoError(error);
}
