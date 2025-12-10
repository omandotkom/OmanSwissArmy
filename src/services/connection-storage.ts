import { encryptData, decryptData } from '@/lib/crypto-utils';

const DB_NAME = 'OmanSwissArmyDB';
const STORE_NAME = 'oracle_connections';
const DB_VERSION = 1;

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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

// Encrypted Storage Wrapper
interface EncryptedStorageItem {
    id: string;
    payload: string; // The entire encrypted connection object
}

export const saveConnection = async (connection: OracleConnection): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

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
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
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
                    // Legacy Format (Old Data): Decrypt password only if exists, and migrate later implicitly on save
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
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};
