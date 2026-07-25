import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  flushAttemptSyncQueue,
  registerAttemptOnlineFlush,
} from "@/data/repositories/DualAttemptRepository";
import { flushManifestSyncQueue, registerManifestOnlineFlush } from "@/data/manifestStore";
import { attemptSyncQueue, type SyncQueueItem } from "@/data/sync/syncQueue";
import { manifestSyncQueue, type ManifestSyncItem } from "@/data/sync/manifestSyncQueue";
import { deriveSyncDisplayState, SYNC_DISPLAY_LABELS } from "@/data/sync/syncStatus";
import { WRITES_ENABLED } from "@/lib/supabase";

export function SyncStatusIndicator() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [manifestItems, setManifestItems] = useState<ManifestSyncItem[]>([]);
  const [persistenceFailure, setPersistenceFailure] = useState(false);
  const [manifestPersistenceFailure, setManifestPersistenceFailure] = useState(false);

  const refresh = useCallback(() => {
    if (!userId || !WRITES_ENABLED) {
      setItems([]);
      setManifestItems([]);
      setPersistenceFailure(false);
      setManifestPersistenceFailure(false);
      return;
    }
    try {
      setItems(attemptSyncQueue.list(userId));
      setManifestItems(manifestSyncQueue.list(userId));
      setPersistenceFailure(attemptSyncQueue.hasPersistenceFailure(userId));
      setManifestPersistenceFailure(manifestSyncQueue.hasPersistenceFailure(userId));
    } catch {
      setPersistenceFailure(true);
      setManifestPersistenceFailure(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId || !WRITES_ENABLED || typeof window === "undefined") return;
    const unsubscribeAttempts = attemptSyncQueue.subscribe(userId, refresh);
    const unsubscribeManifests = manifestSyncQueue.subscribe(userId, refresh);
    const unregisterAttemptOnline = registerAttemptOnlineFlush(userId);
    const unregisterManifestOnline = registerManifestOnlineFlush(userId);
    const handleOnline = () => {
      setOnline(true);
      void retryBoth(userId);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) void retryBoth(userId, false);
    return () => {
      unsubscribeAttempts();
      unsubscribeManifests();
      unregisterAttemptOnline();
      unregisterManifestOnline();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh, userId]);

  const state = deriveSyncDisplayState({
    writesEnabled: WRITES_ENABLED,
    online,
    items,
    manifestItems,
    persistenceFailure,
    manifestPersistenceFailure,
  });

  return (
    <div
      role="status"
      className="mb-3 flex min-h-9 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
    >
      <div>
        <span>{SYNC_DISPLAY_LABELS[state]}</span>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Tentativas: {queueLabel(items, persistenceFailure)} · Sessões:{" "}
          {queueLabel(manifestItems, manifestPersistenceFailure)}
        </p>
      </div>
      {state === "failed" && userId && (
        <button
          type="button"
          className="font-semibold text-purple-700"
          onClick={() => void retryBoth(userId)}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

async function retryBoth(userId: string, force = true): Promise<void> {
  await Promise.all([flushAttemptSyncQueue(userId, force), flushManifestSyncQueue(userId, force)]);
}

function queueLabel(items: readonly { status: string }[], persistenceFailure: boolean): string {
  if (!WRITES_ENABLED) return "local";
  if (persistenceFailure || items.some((item) => item.status === "failed")) return "falha";
  if (items.length > 0) return "pendente";
  return "ok";
}
