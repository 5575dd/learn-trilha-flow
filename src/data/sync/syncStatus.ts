import type { SyncQueueItem } from "@/data/sync/syncQueue";
import type { ManifestSyncItem } from "@/data/sync/manifestSyncQueue";

export type SyncDisplayState = "local" | "syncing" | "synced" | "failed" | "offline";

export const SYNC_DISPLAY_LABELS: Record<SyncDisplayState, string> = {
  local: "Salvo neste dispositivo",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  failed: "Falha ao sincronizar",
  offline: "Offline — salvo neste dispositivo",
};

export function deriveSyncDisplayState({
  writesEnabled,
  online,
  items,
  manifestItems = [],
  persistenceFailure = false,
  manifestPersistenceFailure = false,
}: {
  writesEnabled: boolean;
  online: boolean;
  items: readonly SyncQueueItem[];
  manifestItems?: readonly ManifestSyncItem[];
  persistenceFailure?: boolean;
  manifestPersistenceFailure?: boolean;
}): SyncDisplayState {
  if (!writesEnabled) return "local";
  if (!online) return "offline";
  if (
    persistenceFailure ||
    manifestPersistenceFailure ||
    items.some((item) => item.status === "failed") ||
    manifestItems.some((item) => item.status === "failed")
  ) {
    return "failed";
  }
  if (items.length > 0 || manifestItems.length > 0) return "syncing";
  return "synced";
}
