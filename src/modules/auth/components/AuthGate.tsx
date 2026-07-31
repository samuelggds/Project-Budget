import { ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { authorizedEmail, isAuthConfigured, supabase } from "../services/supabase";
import { LoginPage } from "./LoginPage";

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const acceptUser = async (candidate: User | null) => {
      const allowed = candidate && (!authorizedEmail || candidate.email?.toLowerCase() === authorizedEmail);
      if (candidate && !allowed) await supabase.auth.signOut({ scope: "local" });
      setUser(allowed ? candidate : null);
      setLoading(false);
    };

    if (!isAuthConfigured) { setLoading(false); return; }
    supabase.auth.getUser().then(({ data }) => acceptUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { void acceptUser(session?.user ?? null); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="auth-loading"><img src="/MG.jpg" alt="MG" /><span>Verificando acesso...</span></div>;
  return user ? children : <LoginPage />;
}
