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
            if (!db) initFirebase(); // Jaga-jaga
            await handleTrack(payload);
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
