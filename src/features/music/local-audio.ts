export type LocalAudioMeta = {
  trackId: string;
  fileName: string;
  mimeType: string;
  duration: number;
  size: number;
  savedAt: number;
  syncedLyrics?: string;
  syncRatio?: number;
  syncLead?: number;
  lyricsVersion?: number;
  alignmentVersion?: number;
  alignmentConfidence?: number;
  wordTimings?: LocalWordTiming[];
};

export type LocalWordTiming = {
  lineIndex: number;
  wordIndex: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

type LocalAudioRecord = LocalAudioMeta & {
  // ArrayBuffer é mais confiável que File/Blob no IndexedDB do Safari/iPhone.
  // Registros antigos com Blob continuam compatíveis.
  blob: Blob | ArrayBuffer;
};

const databaseName = "trilha-musica-local-audio-v1";
const storeName = "tracks";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "trackId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Não foi possível abrir a biblioteca local."));
  });
}

function finishTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Não foi possível salvar o áudio."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("O armazenamento foi interrompido."));
  });
}

export async function saveLocalAudio(
  trackId: string,
  file: File,
  duration: number,
  learningData?: {
    syncedLyrics: string;
    syncRatio: number;
    syncLead: number;
    lyricsVersion: number;
    alignmentVersion?: number;
    alignmentConfidence?: number;
    wordTimings?: LocalWordTiming[];
  },
) {
  const audioBytes = await file.arrayBuffer();
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const record: LocalAudioRecord = {
    trackId,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    duration,
    size: file.size,
    savedAt: Date.now(),
    syncedLyrics: learningData?.syncedLyrics,
    syncRatio: learningData?.syncRatio,
    syncLead: learningData?.syncLead,
    lyricsVersion: learningData?.lyricsVersion,
    alignmentVersion: learningData?.alignmentVersion,
    alignmentConfidence: learningData?.alignmentConfidence,
    wordTimings: learningData?.wordTimings,
    blob: audioBytes,
  };
  const finished = finishTransaction(transaction);
  const request = transaction.objectStore(storeName).put(record);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Não foi possível guardar ${file.name} neste aparelho.`));
  });
  await finished;
  database.close();
  return {
    trackId: record.trackId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    duration: record.duration,
    size: record.size,
    savedAt: record.savedAt,
    syncedLyrics: record.syncedLyrics,
    syncRatio: record.syncRatio,
    syncLead: record.syncLead,
    lyricsVersion: record.lyricsVersion,
    alignmentVersion: record.alignmentVersion,
    alignmentConfidence: record.alignmentConfidence,
    wordTimings: record.wordTimings,
  };
}

export async function saveLocalAudioLyrics(
  trackId: string,
  syncedLyrics: string,
  syncRatio: number,
  syncLead: number,
  lyricsVersion: number,
  duration?: number,
  alignment?: {
    version: number;
    confidence: number;
    wordTimings: LocalWordTiming[];
  },
) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const request = store.get(trackId);
  const record = await new Promise<LocalAudioRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as LocalAudioRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o áudio."));
  });
  if (!record) {
    transaction.abort();
    database.close();
    return;
  }
  store.put({
    ...record,
    syncedLyrics,
    syncRatio,
    syncLead,
    lyricsVersion,
    duration: duration ?? record.duration,
    alignmentVersion: alignment?.version,
    alignmentConfidence: alignment?.confidence,
    wordTimings: alignment?.wordTimings,
  });
  await finishTransaction(transaction);
  database.close();
}

export async function listLocalAudio() {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).getAll();
  const records = await new Promise<LocalAudioRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as LocalAudioRecord[]);
    request.onerror = () =>
      reject(request.error ?? new Error("Não foi possível ler a biblioteca local."));
  });
  database.close();
  return records.map((record) => ({
    trackId: record.trackId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    duration: record.duration,
    size: record.size,
    savedAt: record.savedAt,
    syncedLyrics: record.syncedLyrics,
    syncRatio: record.syncRatio,
    syncLead: record.syncLead,
    lyricsVersion: record.lyricsVersion,
    alignmentVersion: record.alignmentVersion,
    alignmentConfidence: record.alignmentConfidence,
    wordTimings: record.wordTimings,
  }));
}

export async function getLocalAudio(trackId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).get(trackId);
  const record = await new Promise<LocalAudioRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as LocalAudioRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o áudio."));
  });
  database.close();
  if (!record) return undefined;
  return {
    ...record,
    blob:
      record.blob instanceof Blob
        ? record.blob
        : new Blob([record.blob], { type: record.mimeType }),
  };
}
