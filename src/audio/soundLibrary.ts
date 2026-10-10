const DB_NAME = 'clubbox-sounds';
const DB_VERSION = 1;
const STORE = 'pads';

export const PAD_HOTKEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
] as const;

export type PadHotkey = (typeof PAD_HOTKEYS)[number];

export interface StoredSound {
  id: string;
  name: string;
  icon: string;
  hotkey: string;
  volume: number;
  loop: boolean;
  deleted?: boolean;
  audio?: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the sound library'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Sound library request failed'));
  });
}

export async function readStoredSounds(): Promise<StoredSound[]> {
  const db = await openDb();
  try {
    const rows = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    return Array.isArray(rows) ? (rows as StoredSound[]) : [];
  } finally {
    db.close();
  }
}

export async function writeStoredSound(sound: StoredSound): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(sound);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the sound'));
      tx.onabort = () => reject(tx.error ?? new Error('Could not save the sound'));
    });
  } finally {
    db.close();
  }
}

export async function deleteStoredSound(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not delete the sound'));
      tx.onabort = () => reject(tx.error ?? new Error('Could not delete the sound'));
    });
  } finally {
    db.close();
  }
}
