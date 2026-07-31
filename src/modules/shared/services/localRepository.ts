export function readLocal<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as T[];
  } catch {
    return [];
  }
}

export function writeLocal<T>(key: string, values: T[]) {
  localStorage.setItem(key, JSON.stringify(values));
}
