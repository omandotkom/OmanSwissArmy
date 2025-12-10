# Oman Swiss Army Tool 🛠️

**The Ultimate Developer Utility Suite**

Oman Swiss Army Tool is a comprehensive, all-in-one web application designed to supercharge developer productivity. Built with **Next.js**, **TypeScript**, and **Tailwind CSS**, it provides a collection of essential tools for everyday coding tasks, integrated with backend capabilities for system operations.

## 🚀 Features

Access 20+ powerful tools to streamline your development workflow:

### ☸️ OpenShift / Kubernetes (New!)
- **PVC Browser**: A robust file manager for your OpenShift Persistent Volume Claims.
    - **Pod & Mount Explorer**: Browse files inside Pods and PVC mount points directly from the UI.
    - **PVC Insights**: Auto-detect PVC backed mounts and display details (Storage Class, Capacity, Status).
    - **File Operations**: Preview text files and **Download** any file (text/binary) to your local machine.
    - **Smart Filtering**: Filter Pods by their Storage Class (e.g., find all pods using `gp3` or `px-sc`).
    - **Storage Finder (px-sc)**: A powerful, realtime cluster scanner to find all workloads using a specific storage class (e.g., Portworx), complete with **Execution Logs** and **Excel Export**.

### 🔧 Code & Data Formatting
- **JSON Formatter**: Beautify and validate JSON data instantly with syntax highlighting.
- **SQL Formatter**: Format complex SQL queries for better readability.
- **JSON to Code**: Convert JSON objects into **TypeScript Interfaces**, **Go Structs**, or **Java Classes** automatically.
- **HTML Entity Encoder**: Encode/Decode special characters to HTML entities safely.

### 🔐 Security & Encoding
- **JWT Decoder**: Decode JSON Web Tokens (JWT) to inspect headers and payloads securely on the client side.
- **Base64 Converter**: Encode and decode text or files to Base64 format in real-time.
- **Hash Generator**: Generate secure **MD5**, **SHA-1**, **SHA-256**, and **SHA-512** hashes instantly.
- **URL Encoder/Decoder**: Safely encode or decode URL strings for debugging query parameters.
- **Password Generator**: Create strong, secure passwords with customizable length and character sets.

### 🧪 Testing & Debugging
- **API Test**: A lightweight Postman alternative to test REST APIs (GET, POST, PUT, DELETE) directly from your browser.
- **Regex Tester**: Test regular expressions against sample text with real-time matching and **human-readable explanations**.
- **Diff Checker**: Compare two text files or code snippets side-by-side to spot differences (additions/removals).

### 🎨 Design & Media
- **Color Converter**: Convert colors between **HEX**, **RGB**, and **HSL** formats with a live preview.
- **Image Converter**: Optimize and convert images (PNG/JPG) to **WebP**, **JPEG**, or **PNG** with adjustable quality.
- **QR Code Generator**: Create downloadable QR codes for URLs or text instantly.
- **Meta Tag Generator**: Generate SEO-friendly HTML meta tags for social media and search engines.

### 📝 Utilities
- **Markdown Previewer**: Write Markdown with a live split-screen HTML preview.
- **Unix Timestamp Converter**: Convert between Epoch timestamps and human-readable dates.
- **UUID Generator**: Generate bulk UUID v4 strings for database seeding or testing.
- **Lorem Ipsum Generator**: Create dummy text (paragraphs, sentences, words) for UI prototyping.
- **String Length Counter**: Analyze text statistics including character count, word count, lines, and paragraphs.

### ⚙️ System & DevOps
- **Chmod Calculator**: Visual permission calculator for Linux/Unix file systems (Octal & Symbolic).
- **Cron Generator**: Easy-to-use UI for generating complex Cron schedule expressions.

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend Integration**: Node.js Child Process (for OpenShift CLI integration)
- **Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/) (VS Code core)
- **Icons**: [Lucide React](https://lucide.dev/)

## 📦 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/omandotkom/OmanSwissArmy.git
    cd OmanSwissArmy
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup OpenShift CLI (Optional, for PVC Browser):**
    - Download the `oc` binary (OpenShift CLI).
    - Place `oc.exe` (Windows) or `oc` (Linux/Mac) inside the `bin/` directory in the project root.
    - *Note: Creates the `bin` folder if it doesn't exist.*

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  **Open your browser:**
    Navigate to `http://localhost:3000` to start using the tools.

## 🇮🇩 Panduan Instalasi (Bahasa Indonesia)

Berikut langkah-langkah untuk menjalankan project ini di komputer lokal Anda:

1.  **Download Source Code:**
    Clone repository ini menggunakan git:
    ```bash
    git clone https://github.com/omandotkom/OmanSwissArmy.git
    cd OmanSwissArmy
    ```

2.  **Install Library:**
    Pastikan Anda sudah menginstall Node.js, lalu jalankan:
    ```bash
    npm install
    ```

3.  **Setup OpenShift CLI (PENTING untuk fitur PVC Browser):**
    Agar fitur **PVC Browser** dan **Storage Finder** dapat berjalan, aplikasi memerlukan binary `oc` (OpenShift CLI).
    - Download `oc.exe` (CLI Tools) dari portal Red Hat OpenShift Anda.
    - Buat folder baru bernama **`bin`** di dalam folder utama project ini.
    - Copy file **`oc.exe`** ke dalam folder `bin` tersebut.
    - *Struktur akhir:* `OmanSwissArmy/bin/oc.exe`

4.  **Jalankan Aplikasi:**
    Start development server dengan perintah:
    ```bash
    npm run dev
    ```

5.  **Mulai Menggunakan:**
    Buka browser (Chrome/Edge) dan akses alamat:
    `http://localhost:3000`

## 🤝 Contributing

Contributions are welcome! If you have an idea for a new tool or want to improve an existing one, feel free to open an issue or submit a pull request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

*Built with ❤️ by [Oman](https://github.com/omandotkom)*
