
import { DocumentRecord, Folder } from '../types';

const DB_NAME = 'EduVaultDB';
const DOC_STORE = 'documents';
const FOLDER_STORE = 'folders';
const DB_VERSION = 2;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        const folderStore = db.createObjectStore(FOLDER_STORE, { keyPath: 'id' });
        // Initial defaults only if store is empty
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Export all data
export const exportVaultData = async () => {
  const folders = await getFolders();
  const documents = await getAllDocuments();
  return {
    version: DB_VERSION,
    timestamp: Date.now(),
    folders,
    documents
  };
};

// Restore all data (overwrites current)
export const restoreVaultData = async (data: { folders: Folder[], documents: DocumentRecord[] }) => {
  const db = await initDB();
  
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([FOLDER_STORE, DOC_STORE], 'readwrite');
    const folderStore = transaction.objectStore(FOLDER_STORE);
    const docStore = transaction.objectStore(DOC_STORE);

    folderStore.clear();
    docStore.clear();

    data.folders.forEach(f => folderStore.add(f));
    data.documents.forEach(d => docStore.add(d));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Folder Methods
export const getFolders = async (): Promise<Folder[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDER_STORE, 'readonly');
    const store = transaction.objectStore(FOLDER_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveFolder = async (folder: Folder): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDER_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDER_STORE);
    const request = store.put(folder);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteFolder = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDER_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDER_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Document Methods
export const saveDocument = async (doc: DocumentRecord): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.put(doc);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllDocuments = async (): Promise<DocumentRecord[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readonly');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteDocument = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
