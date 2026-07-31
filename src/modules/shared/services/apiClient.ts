const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("VITE_API_URL não configurada");
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) throw new Error((await response.text()) || "Erro na API");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
