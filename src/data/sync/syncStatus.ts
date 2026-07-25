import type { SyncQueueItem } from "@/data/sync/syncQueue";

export type SyncDisplayState = "local" | "syncing" | "synced" | "failed" | "offline";

export const SYNC_DISPLAY_LABELS: Record<SyncDisplayState, string> = {
  local: "Salvo neste dispositivo",
  syncing: "Sincronizando tentativas",
  synced: "Tentativas sincronizadas",
  failed: "Falha ao sincronizar tentativas",
  offline: "Offline — salvo neste dispositivo",
};

export function deriveSyncDisplayState({
  writesEnabled,
  online,
  items,
  persistenceFailure = false,
}: {
  writesEnabled: boolean;
  online: boolean;
  items: readonly SyncQueueItem[];
  persistenceFailure?: boolean;
}): SyncDisplayState {
  if (!writesEnabled) return "local";
  if (!online) return "offline";
  if (persistenceFailure || items.some((item) => item.status === "failed")) return "failed";
  if (items.length > 0) return "syncing";
  return "synced";
}
