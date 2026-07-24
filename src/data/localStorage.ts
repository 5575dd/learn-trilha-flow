const PREFIX = "trilha";

export class LocalPersistenceError extends Error {
  constructor(operation: "read" | "write" | "remove", cause?: unknown) {
    super(
      `NÃ£o foi possÃ­vel ${operation === "read" ? "ler" : operation === "write" ? "salvar" : "remover"} os dados locais.`,
    );
    this.name = "LocalPersistenceError";
    this.cause = cause;
  }
}

function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export const storageKeys = {
  attempts: (userId: string, sessionId: string) =>
    `${PREFIX}.user.${segment(userId)}.attempts.${segment(sessionId)}`,
  snapshot: (userId: string, aulaId: number) =>
    `${PREFIX}.user.${segment(userId)}.session.${segment(aulaId)}`,
  progress: (userId: string, name: string) =>
    `${PREFIX}.user.${segment(userId)}.progress.${segment(name)}`,
};

export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error("[storage] local read failed", { name: errorName(error) });
    throw new LocalPersistenceError("read", error);
  }
}

export function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error("[storage] local write failed", { name: errorName(error) });
    throw new LocalPersistenceError("write", error);
  }
}

export function removeLocal(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error("[storage] local remove failed", { name: errorName(error) });
    throw new LocalPersistenceError("remove", error);
  }
}

export function clearTransientUserStorage(userId: string): void {
  if (typeof window === "undefined") return;
  const prefix = `${PREFIX}.user.${segment(userId)}.`;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix) && (key.includes(".session.") || key.includes(".attempts."))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("[storage] user cleanup failed", { name: errorName(error) });
    throw new LocalPersistenceError("remove", error);
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
