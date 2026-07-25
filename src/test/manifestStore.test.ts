import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalManifestStore } from "@/data/manifestStore";
import { storageKeys } from "@/data/localStorage";

describe("LocalManifestStore", () => {
  beforeEach(() => localStorage.clear());

  function createStore() {
    let now = 100;
    return new LocalManifestStore({
      createId: () => "manifest-1",
      now: () => now++,
    });
  }

  it("creates a versioned manifest with stable frozen IDs", () => {
    const ids = [3, 1, 3, 2];
    const store = createStore();
    const manifest = store.create({
      userId: "user-a",
      source: { kind: "quick" },
      criteria: { limit: 10 },
      questionIds: ids,
    });
    ids.push(99);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe("manifest-1");
    expect(manifest.questionIds).toEqual([3, 1, 2]);
    expect(Object.isFrozen(manifest.questionIds)).toBe(true);
    expect(manifest.status).toBe("created");
  });

  it("isolates manifests by user and rejects another user's lookup", () => {
    const store = createStore();
    store.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1],
    });
    expect(store.listByUser("user-b")).toEqual([]);
    expect(store.get("user-b", "manifest-1")).toBeNull();
  });

  it("discards corrupt JSON without crashing", () => {
    const store = createStore();
    localStorage.setItem(storageKeys.manifests("user-a"), "{bad");
    expect(() => store.listByUser("user-a")).not.toThrow();
    expect(store.listByUser("user-a")).toEqual([]);
  });

  it("updates currentIndex without changing frozen IDs", () => {
    const store = createStore();
    store.create({
      userId: "user-a",
      source: { kind: "aula", aulaId: 1 },
      questionIds: [1, 2],
    });
    const updated = store.update("user-a", "manifest-1", { currentIndex: 1 });
    expect(updated?.currentIndex).toBe(1);
    expect(updated?.questionIds).toEqual([1, 2]);
    expect(updated?.updatedAt).toBeGreaterThan(updated?.createdAt ?? 0);
  });

  it("uses strictly monotonic timestamps for every local mutation in the same millisecond", () => {
    let id = 0;
    const store = new LocalManifestStore({
      createId: () => `manifest-${++id}`,
      now: () => 100,
    });
    const created = store.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1, 2],
    });
    const active = store.markActive("user-a", created.id);
    const progressed = store.update("user-a", created.id, { currentIndex: 1 });
    const completed = store.markCompleted("user-a", created.id);
    const second = store.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [3],
    });
    const abandoned = store.abandon("user-a", second.id);

    expect(created).toMatchObject({ createdAt: 100, updatedAt: 100 });
    expect(active?.updatedAt).toBe(101);
    expect(progressed?.updatedAt).toBe(102);
    expect(completed).toMatchObject({ updatedAt: 103, completedAt: 103 });
    expect(completed?.createdAt).toBe(100);
    expect(second).toMatchObject({ createdAt: 100, updatedAt: 100 });
    expect(abandoned?.updatedAt).toBe(101);
    expect(abandoned?.createdAt).toBe(100);
  });

  it("marks active and completed idempotently", () => {
    const store = createStore();
    store.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1, 2],
    });
    const active = store.markActive("user-a", "manifest-1");
    expect(store.markActive("user-a", "manifest-1")).toEqual(active);
    const completed = store.markCompleted("user-a", "manifest-1");
    expect(completed?.status).toBe("completed");
    expect(completed?.currentIndex).toBe(2);
    expect(completed?.completedAt).toBeTypeOf("number");
    expect(store.markCompleted("user-a", "manifest-1")).toEqual(completed);
  });

  it("finds the newest recoverable manifest and ignores abandoned/completed ones", () => {
    let id = 0;
    let now = 1;
    const store = new LocalManifestStore({
      createId: () => `m-${++id}`,
      now: () => now++,
    });
    store.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] });
    store.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [2] });
    store.abandon("user-a", "m-2");
    expect(store.findRecoverable("user-a")?.id).toBe("m-1");
    store.markCompleted("user-a", "m-1");
    expect(store.findRecoverable("user-a")).toBeNull();
  });

  it("removes only the selected user's manifest and is safe when repeated", () => {
    const store = createStore();
    store.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] });
    localStorage.setItem(storageKeys.manifests("user-b"), "[]");
    store.remove("user-a", "manifest-1");
    store.remove("user-a", "manifest-1");
    expect(store.get("user-a", "manifest-1")).toBeNull();
    expect(localStorage.getItem(storageKeys.manifests("user-b"))).toBe("[]");
  });

  it("propagates quota/storage failures", () => {
    const store = createStore();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() =>
      store.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] }),
    ).toThrow(/salvar os dados locais/);
    spy.mockRestore();
  });

  it("notifies subscribers about cross-tab storage changes", () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe("user-a", listener);
    window.dispatchEvent(new StorageEvent("storage", { key: storageKeys.manifests("user-a") }));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
