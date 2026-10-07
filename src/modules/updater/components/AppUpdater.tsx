import { useCallback, useEffect, useRef, useState } from "react";

type UpdateHandle = {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  downloadAndInstall: (
    onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ) => Promise<void>;
  close?: () => Promise<void>;
};

export function AppUpdater() {
  const [update, setUpdate] = useState<UpdateHandle | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const checkedOnce = useRef(false);

  const checkForUpdate = useCallback(async (silent = true) => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;

      setChecking(true);
      if (!silent) setError("");
      const { check } = await import("@tauri-apps/plugin-updater");
      const next = await check();
      setUpdate((next as UpdateHandle | null) || null);
    } catch (cause) {
      if (!silent) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível verificar atualizações.",
        );
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (checkedOnce.current) return;
    checkedOnce.current = true;

    const startup = window.setTimeout(() => void checkForUpdate(true), 2500);
    const interval = window.setInterval(
      () => void checkForUpdate(true),
      30 * 60 * 1000,
    );

    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [checkForUpdate]);

  const install = async () => {
    if (!update) return;
    setInstalling(true);
    setError("");
    setProgress(0);

    let downloaded = 0;
    let total = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = Number(event.data?.contentLength || 0);
          downloaded = 0;
          setProgress(total ? 0 : null);
        } else if (event.event === "Progress") {
          downloaded += Number(event.data?.chunkLength || 0);
          if (total > 0) {
            setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao instalar a atualização.",
      );
      setInstalling(false);
    }
  };

  if (!update && !error) return null;

  return (
    <aside className="app-update-banner" role="status">
      <div>
        <strong>
          {update
            ? "Nova versão do MG Orçamentos disponível"
            : "Não foi possível verificar atualizações"}
        </strong>
        {update ? (
          <span>
            Versão {update.version}
            {update.body ? " · " + update.body.slice(0, 160) : ""}
          </span>
        ) : (
          <span>{error}</span>
        )}
        {installing && (
          <span>
            {progress === null
              ? "Baixando atualização..."
              : "Atualizando... " + progress + "%"}
          </span>
        )}
      </div>
      <div className="app-update-actions">
        {update && (
          <>
            <button
              className="button primary"
              onClick={() => void install()}
              disabled={installing}
            >
              {installing ? "Instalando..." : "Atualizar agora"}
            </button>
            {!installing && (
              <button className="button" onClick={() => setUpdate(null)}>
                Mais tarde
              </button>
            )}
          </>
        )}
        {!update && (
          <button
            className="button"
            onClick={() => void checkForUpdate(false)}
            disabled={checking}
          >
            {checking ? "Verificando..." : "Tentar novamente"}
          </button>
        )}
      </div>
    </aside>
  );
}
