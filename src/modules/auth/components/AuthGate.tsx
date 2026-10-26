import { ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isAuthConfigured, supabase } from "../services/supabase";
import { LoginPage } from "./LoginPage";
import "./mfa.css";

async function mfaRequest(action: "status" | "request" | "verify", code?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
  const apiBase = "__TAURI_INTERNALS__" in window ? String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "") : "";
  const response = await fetch(apiBase + "/api/auth/admin-mfa", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
    body: JSON.stringify({ action, ...(code ? { code } : {}) }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível confirmar sua identidade.");
  return payload as { verified?: boolean; sent?: boolean; destination?: string; expiresAt?: string };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let seq = 0;
    const acceptUser = async (candidate: User | null) => {
      const current = ++seq;
      const allowed = Boolean(candidate);
      
      if (!active || current !== seq) return;
      setUser(allowed ? candidate : null);
      setVerified(false);
      setExpiresAt(null);
      setError("");
      if (allowed) {
        try {
          const status = await mfaRequest("status");
          if (!active || current !== seq) return;
          setVerified(status.verified === true);
          setExpiresAt(status.expiresAt || null);
        } catch {
          if (!active || current !== seq) return;
          setError("A validação de segurança está indisponível. Tente novamente.");
        }
      }
      if (active && current === seq) setLoading(false);
    };
    if (!isAuthConfigured) { setLoading(false); return; }
    void supabase.auth.getUser().then(({ data }) => acceptUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void acceptUser(session?.user ?? null);
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!verified || !expiresAt) return;
    const expiry = Date.parse(expiresAt);
    const remaining = expiry - Date.now();
    if (remaining <= 0) { setVerified(false); return; }
    const timer = window.setTimeout(() => { setVerified(false); setCode(""); setNotice("Sua verificação expirou. Confirme novamente."); }, remaining);
    return () => window.clearTimeout(timer);
  }, [verified, expiresAt]);

  const run = async (action: "request" | "verify") => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await mfaRequest(action, action === "verify" ? code : undefined);
      if (action === "request") setNotice("Código enviado para " + (result.destination || "o e-mail cadastrado") + ". Válido por 5 minutos.");
      if (action === "verify" && result.verified) { setVerified(true); setExpiresAt(result.expiresAt || null); setCode(""); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha na verificação.");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="auth-loading"><img src="/MG.jpg" alt="MG" /><span>Verificando acesso...</span></div>;
  if (!user) return <LoginPage />;
  if (verified) return <>{children}</>;

  return (
    <main className="mg-mfa-screen">
      <section className="mg-mfa-card">
        <img className="mg-mfa-logo" src="/MG_icon.png" alt="MG Refrigerações" />
        <span className="mg-mfa-kicker">ACESSO ADMINISTRATIVO PROTEGIDO</span>
        <h1>Confirme sua identidade</h1>
        <p>Para acessar os orçamentos, solicite o código de segurança enviado para <strong>mat***@hotmail.com</strong>.</p>
        <form onSubmit={(event) => { event.preventDefault(); void run("verify"); }}>
          <label htmlFor="admin-mfa-code">Código de 6 dígitos</label>
          <input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required />
          {error && <p className="mg-mfa-error" role="alert">{error}</p>}
          {notice && <p className="mg-mfa-notice" role="status">{notice}</p>}
          <button type="submit" disabled={busy || code.length !== 6}> {busy ? "Aguarde..." : "Confirmar e entrar"} </button>
        </form>
        <button className="mg-mfa-link" type="button" disabled={busy} onClick={() => void run("request")}>Enviar / reenviar código por e-mail</button>
        <button className="mg-mfa-link" type="button" disabled={busy} onClick={() => { void supabase.auth.signOut({ scope: "local" }); }}>Sair desta conta</button>
      </section>
    </main>
  );
}
