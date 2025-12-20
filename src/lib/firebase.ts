// --- KONFIGURASI FIREBASE ---
// Config ini aman untuk terekspos di client-side (GitHub) selama Security Rules DB Anda benar (Write Only).
export const firebaseConfig = {
    apiKey: "AIzaSyDgaYbJV99YUhkbPsbjK87xBg-qdJXrTPo",
    authDomain: "omanswissarmytool.firebaseapp.com",
    projectId: "omanswissarmytool",
    storageBucket: "omanswissarmytool.firebasestorage.app",
    messagingSenderId: "30448053654",
    appId: "1:30448053654:web:82a3dc631eed1fc95bc1b7",
    measurementId: "G-K6JDGKQHSM"
};

// Kita tidak meng-init app di sini lagi agar Main Thread ringan.
// Inisialisasi dilakukan di dalam Worker.
