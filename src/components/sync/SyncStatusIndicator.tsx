import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  flushAttemptSyncQueue,
  registerAttemptOnlineFlush,
} from "@/data/repositories/DualAttemptRepository";
import { attemptSyncQueue, type SyncQueueItem } from "@/data/sync/syncQueue";
import { deriveSyncDisplayState, SYNC_DISPLAY_LABELS } from "@/data/sync/syncStatus";
import { WRITES_ENABLED } from "@/lib/supabase";

export function SyncStatusIndicator() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [persistenceFailure, setPersistenceFailure] = useState(false);

  const refresh = useCallback(() => {
    if (!userId || !WRITES_ENABLED) {
      setItems([]);
      setPersistenceFailure(false);
      return;
    }
    try {
      setItems(attemptSyncQueue.list(userId));
      setPersistenceFailure(attemptSyncQueue.hasPersistenceFailure(userId));
    } catch {
      setPersistenceFailure(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId || !WRITES_ENABLED || typeof window === "undefined") return;
    const unsubscribe = attemptSyncQueue.subscribe(userId, refresh);
    const unregisterOnline = registerAttemptOnlineFlush(userId);
    const handleOnline = () => {
      setOnline(true);
      void flushAttemptSyncQueue(userId, true);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) void flushAttemptSyncQueue(userId);
    return () => {
      unsubscribe();
      unregisterOnline();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh, userId]);

  const state = deriveSyncDisplayState({
    writesEnabled: WRITES_ENABLED,
    online,
    items,
    persistenceFailure,
  });

  return (
    <div
      role="status"
      className="mb-3 flex min-h-9 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
    >
      <span>{SYNC_DISPLAY_LABELS[state]}</span>
      {state === "failed" && userId && (
        <button
          type="button"
          className="font-semibold text-purple-700"
          onClick={() => void flushAttemptSyncQueue(userId, true)}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
