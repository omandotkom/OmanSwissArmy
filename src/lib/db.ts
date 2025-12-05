export const DB_NAME = "ApiTestDB";
export const STORE_NAME = "requests";

export interface ApiRequest {
    id: string;
    name: string;
    url: string;
    method: string;
    mode: "server" | "client";
    headers: string;
    body: string;
    response?: any;
    createdAt: number;
}

export const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
};

export const saveRequest = async (data: ApiRequest) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllRequests = async (): Promise<ApiRequest[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by createdAt desc
            const results = request.result as ApiRequest[];
            results.sort((a, b) => b.createdAt - a.createdAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteRequest = async (id: string) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};
