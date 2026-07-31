import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const isAuthConfigured = Boolean(url && publishableKey);

export const supabase = createClient(
  url || "https://configuracao-ausente.supabase.co",
  publishableKey || "configuracao-ausente",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export const authorizedEmail = (import.meta.env.VITE_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
