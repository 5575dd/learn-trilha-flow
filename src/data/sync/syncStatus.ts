import type { SyncQueueItem } from "@/data/sync/syncQueue";

export type SyncDisplayState = "local" | "syncing" | "synced" | "failed" | "offline";

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
