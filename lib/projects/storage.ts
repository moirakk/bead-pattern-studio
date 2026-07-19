import { mergeSavedProjects, recoverSavedProjectCollection, type SavedProject } from "@/lib/projects/backup";

const DATABASE_NAME = "bead-pattern-studio";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const LEGACY_STORAGE_KEY = "bead-pattern-studio.saved-projects.v1";

export type ProjectStorageBackend = "indexeddb" | "localstorage";

export type LoadedProjects = {
  projects: SavedProject[];
  backend: ProjectStorageBackend;
  migrated: boolean;
};

type StorageEnvironment = {
  indexedDB?: IDBFactory | null;
  localStorage?: Storage | null;
};

export async function loadSavedProjects(limit: number, environment?: StorageEnvironment): Promise<LoadedProjects> {
  const indexedDb = environment?.indexedDB === undefined ? getBrowserIndexedDb() : environment.indexedDB;
  const localStorage = environment?.localStorage === undefined ? getBrowserLocalStorage() : environment.localStorage;
  const legacyProjects = readLegacyProjects(localStorage);

  if (!indexedDb) {
    return { projects: mergeSavedProjects([], legacyProjects, limit), backend: "localstorage", migrated: false };
  }

  try {
    const database = await openDatabase(indexedDb);
    try {
      const storedProjects = recoverSavedProjectCollection(await readAllProjects(database));
      if (!legacyProjects.length) {
        return {
          projects: mergeSavedProjects([], storedProjects, limit),
          backend: "indexeddb",
          migrated: false,
        };
      }

      const projects = mergeSavedProjects(storedProjects, legacyProjects, limit);
      await replaceAllProjects(database, projects);
      localStorage?.removeItem(LEGACY_STORAGE_KEY);
      return { projects, backend: "indexeddb", migrated: true };
    } finally {
      database.close();
    }
  } catch {
    return { projects: mergeSavedProjects([], legacyProjects, limit), backend: "localstorage", migrated: false };
  }
}

export async function saveSavedProjects(
  projects: SavedProject[],
  environment?: StorageEnvironment,
): Promise<ProjectStorageBackend> {
  const indexedDb = environment?.indexedDB === undefined ? getBrowserIndexedDb() : environment.indexedDB;
  const localStorage = environment?.localStorage === undefined ? getBrowserLocalStorage() : environment.localStorage;

  if (indexedDb) {
    try {
      const database = await openDatabase(indexedDb);
      try {
        await replaceAllProjects(database, projects);
      } finally {
        database.close();
      }
      localStorage?.removeItem(LEGACY_STORAGE_KEY);
      return "indexeddb";
    } catch {
      // Keep a storage fallback for restricted browsers and private browsing modes.
    }
  }

  if (!localStorage) throw new Error("当前设备无法保存作品。");
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(projects));
  return "localstorage";
}

function getBrowserIndexedDb() {
  return typeof window === "undefined" ? null : window.indexedDB;
}

function getBrowserLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLegacyProjects(storage: Storage | null) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY);
    return raw ? recoverSavedProjectCollection(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function openDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开作品库。"));
    request.onblocked = () => reject(new Error("作品库正在被其他窗口使用。"));
  });
}

function readAllProjects(database: IDBDatabase) {
  return new Promise<unknown[]>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("读取作品失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("读取作品失败。"));
  });
}

function replaceAllProjects(database: IDBDatabase, projects: SavedProject[]) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const store = transaction.objectStore(PROJECT_STORE);
    store.clear();
    projects.forEach((project) => store.put(project));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存作品失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("保存作品失败。"));
  });
}
