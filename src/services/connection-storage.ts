import { encryptData, decryptData } from '@/lib/crypto-utils';

const DB_NAME = 'OmanSwissArmyDB';
const STORE_ORACLE = 'oracle_connections';
const STORE_S3 = 's3_connections';
const STORE_GITEA = 'gitea_connections';
const DB_VERSION = 3; // Bump version for Gitea Store

export interface OracleConnection {
    id: string; // uuid
    name: string;
    host: string;
    port: string;
    serviceName: string; // SID or Service Name
    username: string;
    password?: string; // Optional, encrypted when stored
    color?: string; // Visual tag
}

export interface GiteaConnection {
    id: string; // uuid
    name: string;
    url: string;
    token: string;
}

export interface S3ConnectionProfile {
    id: string;
    name: string;
    config: {
        endpoint: string;
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
    };
    manualBuckets: any[];
    capacities: Record<string, number>;
    lastUsed: number;
}

export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event);
            reject("Could not open IndexedDB");
        };

        request.onsuccess = (event: any) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_ORACLE)) {
                db.createObjectStore(STORE_ORACLE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_S3)) {
                db.createObjectStore(STORE_S3, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_GITEA)) {
                db.createObjectStore(STORE_GITEA, { keyPath: 'id' });
            }
        };
    });
};

// Encrypted Storage Wrapper
interface EncryptedStorageItem {
    id: string;
    payload: string; // The entire encrypted connection object
}

// --- ORACLE FUNCTIONS ---

export const saveConnection = async (connection: OracleConnection): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ORACLE], 'readwrite');
        const store = transaction.objectStore(STORE_ORACLE);

        // Encrypt the ENTIRE object
        const encryptedPayload = encryptData(connection);

        const itemToSave: EncryptedStorageItem = {
            id: connection.id,
            payload: encryptedPayload
        };

        const request = store.put(itemToSave);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllConnections = async (): Promise<OracleConnection[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ORACLE], 'readonly');
        const store = transaction.objectStore(STORE_ORACLE);
        const request = store.getAll();

        request.onsuccess = () => {
            const results: OracleConnection[] = [];

            request.result.forEach((item: any) => {
                // Check if it's the new encrypted format or old format (migration handling)
                if (item.payload && typeof item.payload === 'string') {
                    // New Format: Decrypt full payload
                    const decrypted = decryptData(item.payload);
                    if (decrypted) {
                        results.push(decrypted);
                    }
                } else {
                    // Legacy Format (Old Data): Decrypt password only if exists
                    const legacyConn = item as OracleConnection;
                    if (legacyConn.password) {
                        legacyConn.password = decryptData(legacyConn.password);
                    }
                    results.push(legacyConn);
                }
            });

            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteConnection = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ORACLE], 'readwrite');
        const store = transaction.objectStore(STORE_ORACLE);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getEncryptedExportData = async (): Promise<string> => {
    const connections = await getAllConnections();
    return encryptData(connections);
};

export const importEncryptedData = async (encryptedContent: string): Promise<number> => {
    const connections = decryptData(encryptedContent);
    if (!connections || !Array.isArray(connections)) {
        throw new Error("Invalid or corrupted file.");
    }

    let count = 0;
    for (const conn of connections) {
        if (conn.name && conn.host) {
            await saveConnection(conn);
            count++;
        }
    }
    return count;
};

// --- S3 FUNCTIONS ---

export const saveS3Connection = async (profile: S3ConnectionProfile): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_S3], 'readwrite');
        const store = transaction.objectStore(STORE_S3);

        const encryptedPayload = encryptData(profile);
        const itemToSave: EncryptedStorageItem = {
            id: profile.id,
            payload: encryptedPayload
        };

        const request = store.put(itemToSave);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllS3Connections = async (): Promise<S3ConnectionProfile[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_S3], 'readonly');
        const store = transaction.objectStore(STORE_S3);
        const request = store.getAll();

        request.onsuccess = () => {
            const results: S3ConnectionProfile[] = [];
            request.result.forEach((item: any) => {
                if (item.payload && typeof item.payload === 'string') {
                    const decrypted = decryptData(item.payload);
                    if (decrypted) results.push(decrypted);
                }
            });
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteS3Connection = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_S3], 'readwrite');
        const store = transaction.objectStore(STORE_S3);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// --- GITEA FUNCTIONS ---

export const saveGiteaConnection = async (connection: GiteaConnection): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GITEA], 'readwrite');
        const store = transaction.objectStore(STORE_GITEA);

        const encryptedPayload = encryptData(connection);
        const itemToSave: EncryptedStorageItem = {
            id: connection.id,
            payload: encryptedPayload
        };

        const request = store.put(itemToSave);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllGiteaConnections = async (): Promise<GiteaConnection[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GITEA], 'readonly');
        const store = transaction.objectStore(STORE_GITEA);
        const request = store.getAll();

        request.onsuccess = () => {
            const results: GiteaConnection[] = [];
            request.result.forEach((item: any) => {
                if (item.payload && typeof item.payload === 'string') {
                    const decrypted = decryptData(item.payload);
                    if (decrypted) results.push(decrypted);
                }
            });
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteGiteaConnection = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GITEA], 'readwrite');
        const store = transaction.objectStore(STORE_GITEA);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};
