import { FormEvent, useState } from "react";
import { authorizedEmail, isAuthConfigured, supabase } from "../services/supabase";

export function LoginPage() {
  const [email, setEmail] = useState(authorizedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (authorizedEmail && email.trim().toLowerCase() !== authorizedEmail) {
      setError("Esta conta não tem autorização para acessar o sistema.");
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError("E-mail ou senha inválidos.");
    setLoading(false);
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><img src="/MG.jpg" alt="MG Refrigeração" /><div><strong>MG Orçamentos</strong><span>Acesso administrativo</span></div></div>
        <div className="login-heading"><p>ÁREA PROTEGIDA</p><h1>Entre na sua conta</h1><span>Use a conta única de administrador para continuar.</span></div>
        {!isAuthConfigured ? <div className="login-warning"><strong>Configure a autenticação</strong><span>Preencha as variáveis VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY e VITE_ADMIN_EMAIL no arquivo .env.</span></div> : (
          <form onSubmit={submit}>
            <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Senha<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <div className="login-error">{error}</div>}
            <button className="button primary" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
          </form>
        )}
        <small>Não existe cadastro público. A conta é criada somente pelo administrador.</small>
      </section>
    </main>
  );
}
