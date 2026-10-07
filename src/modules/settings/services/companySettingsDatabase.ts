import { supabase } from "../../auth/services/supabase";

export type CompanySettings = {
  companyName: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: "MG Refrigeração",
  cnpj: "31.263.081/0001-46",
  phone: "(85) 98932-3113",
  email: "contato@mgrefrigeracoes.com.br",
  address: "Rua Francisco Calaça, 1688 — Fortaleza/CE — CEP 60.336-232",
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

function mapCompanySettings(row: Record<string, unknown>): CompanySettings {
  return {
    companyName: text(row.company_name, DEFAULT_COMPANY_SETTINGS.companyName),
    cnpj: text(row.cnpj),
    phone: text(row.phone),
    email: text(row.email),
    address: text(row.address),
  };
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadCompanySettings(): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("company_name, cnpj, phone, email, address")
    .eq("id", "company")
    .maybeSingle();

  assertNoError(error);
  return data
    ? mapCompanySettings(data as Record<string, unknown>)
    : DEFAULT_COMPANY_SETTINGS;
}

export async function saveCompanySettingsToDatabase(
  settings: CompanySettings,
): Promise<CompanySettings> {
  const payload = {
    id: "company",
    company_name: settings.companyName.trim(),
    cnpj: settings.cnpj.trim(),
    phone: settings.phone.trim(),
    email: settings.email.trim(),
    address: settings.address.trim(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("company_settings")
    .upsert(payload, { onConflict: "id" })
    .select("company_name, cnpj, phone, email, address")
    .single();

  assertNoError(error);
  return mapCompanySettings(data as Record<string, unknown>);
}
