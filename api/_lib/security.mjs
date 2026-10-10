const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://mgrefrigeracoes.com.br",
  "https://www.mgrefrigeracoes.com.br",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:5173",
]);

export function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "",
  );
  return { url, key };
}

function supabaseSecretConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!url || !key) throw new Error("Configuração segura do Supabase ausente.");
  if (!url.startsWith("https://")) throw new Error("SUPABASE_URL inválida.");
  if (!key.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY inválida.");
  return { url, key };
}

export async function requireAdmin(req, res) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    sendJson(res, 401, { error: "Sessão ausente." });
    return null;
  }

  const { url, key } = supabaseConfig();
  if (!url || !key) {
    sendJson(res, 500, { error: "Configuração do servidor incompleta." });
    return null;
  }

  let response;
  try {
    response = await fetch(url + "/auth/v1/user", {
      headers: {
        apikey: key,
        Authorization: "Bearer " + token,
      },
    });
  } catch {
    sendJson(res, 503, { error: "Não foi possível validar a sessão." });
    return null;
  }

  if (!response.ok) {
    sendJson(res, 401, { error: "Sessão inválida ou expirada." });
    return null;
  }

  const user = await response.json();
  const allowed = String(process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const email = String(user.email || "").trim().toLowerCase();

  if (!allowed) {
    sendJson(res, 500, { error: "ADMIN_EMAIL não configurado no servidor." });
    return null;
  }

  if (email !== allowed) {
    sendJson(res, 403, { error: "Conta sem permissão para esta operação." });
    return null;
  }

  return { user, token, supabaseUrl: url, supabaseKey: key };
}

export async function supabaseRest(
  context,
  path,
  { method = "GET", body, prefer = "", headers = {} } = {},
) {
  const response = await fetch(context.supabaseUrl + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: context.supabaseKey,
      Authorization: "Bearer " + context.token,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Supabase " + response.status + ": " + detail.slice(0, 400));
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function supabaseSecretRest(
  path,
  { method = "GET", body, prefer = "", headers = {} } = {},
) {
  const { url, key } = supabaseSecretConfig();
  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Supabase server " + response.status + ": " + detail.slice(0, 400));
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function apiBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "mgrefrigeracoes.com.br")
    .split(",")[0]
    .trim();
  return proto + "://" + host;
}
