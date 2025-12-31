/* eslint-disable no-restricted-globals */
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "../lib/firebase";

// --- INI ADALAH DUNIA WEB WORKER (BACKGROUND THREAD) ---

let db: any = null;
let isDev = false;
let currentUser = "unknown";

// 1. Inisialisasi Firebase di Background
const initFirebase = () => {
    if (db) return; // Sudah init

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);

        // Persistence DISABLED to fix Worker instability
    } catch (e) {
        console.error("Worker: Failed to init Firebase", e);
    }
};

// 2. Dengarkan Pesan dari Main Thread
self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case "INIT":
            isDev = payload.isDev;
            initFirebase();
            if (isDev) console.log("🕵️‍♂️ Tracker Worker Initialized (Dev Mode)");
            break;

        case "SET_USER":
            currentUser = payload.username;
            if (isDev) console.log("👤 User Identified:", currentUser);
            break;

        case "TRACK":
            if (!db) initFirebase();
            await handleTrack(payload);
            break;

        case "TRACK_ERROR":
            if (!db) initFirebase();
            await handleTrackError(payload);
            break;
    }
};

// 3. Logika Simpan Data
const handleTrack = async (log: any) => {
    // A. Filter Dev Mode
    if (isDev) {
        // Di mode Dev, kita cuma log ke console biar dev tau sistemnya jalan
        // TAPI kita tidak kirim ke server hemat kuota & agar data bersih
        console.log(`📝 [DevTracker] [${currentUser}]`, log.action, log.label, log);
        return;
    }

    // B. Kirim ke Firestore (Production)
    try {
        await addDoc(collection(db, "activity_logs"), {
            ...log,
            user: currentUser, // Tambahkan Username
            timestamp: serverTimestamp(), // Waktu Server
            syncedAt: new Date().toISOString() // Waktu Client (buat debug offline)
        });
    } catch (error) {
        // Silent fail (jangan ganggu user)
        // Kalau gagal karena offline, firestore otomatis retry nanti (karena persistence).
        // Kalau gagal karena block/rules, ya sudah nasib.
        if (isDev) console.error("Worker: Failed to write", error);
    }
};

// 4. Logika Simpan Error
const handleTrackError = async (log: any) => {
    // Mode Dev: Tetap log ke console agar kelihatan
    if (isDev) {
        console.error(`🔥 [ErrorLog] [${currentUser}]`, log.message, log);
        return;
    }

    // Mode Prod: Kirim ke Firestore
    try {
        await addDoc(collection(db, "errorLogs"), {
            ...log,
            user: currentUser, // Username user yang aktif
            timestamp: serverTimestamp(), // Waktu Server
            clientTime: new Date().toISOString() // Waktu Client
        });
    } catch (error) {
        if (isDev) console.error("Worker: Failed to write error log", error);
    }
};
