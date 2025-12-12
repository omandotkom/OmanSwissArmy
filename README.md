# Oman Swiss Army Tool 🛠️

**The Ultimate Developer Utility Suite**

Oman Swiss Army Tool is a comprehensive, all-in-one web application designed to supercharge developer productivity. Built with **Next.js**, **TypeScript**, and **Tailwind CSS**, it provides a collection of essential tools for everyday coding tasks, integrated with backend capabilities for system operations.

## 🚀 Features

Access 20+ powerful tools to streamline your development workflow:

### ☁️ Cloud, Storage & Infrastructure
- **S3 Browser**: GUI Client for any S3-compatible storage (AWS S3, MinIO, OpenShift OCS).
    - **Multi-Cloud**: Connect to AWS, local MinIO, or on-prem Object Storage.
    - **Bucket & File Explorer**: Browse buckets, folders, and files seamlessly.
    - **Direct Download**: Securely download files using presigned URLs.
- **PVC Browser**: A robust file manager for your OpenShift Persistent Volume Claims.
    - **Pod & Mount Explorer**: Browse files inside Pods and PVC mount points directly from the UI.
    - **PVC Insights**: Auto-detect PVC backed mounts and display details (Storage Class, Capacity, Status).
    - **File Operations**: Preview text files and **Download** any file (text/binary) to your local machine.
    - **Smart Filtering**: Filter Pods by their Storage Class (e.g., find all pods using `gp3` or `px-sc`).
    - **Storage Finder (px-sc)**: A powerful, realtime cluster scanner to find all workloads using a specific storage class (e.g., Portworx), complete with **Execution Logs** and **Excel Export**.
- **PVC Analyzer**: Detect "Zombie" volumes (bound but unused PVCs) and analyze storage usage across the cluster.
- **Resource Unit Converter**: Real-time CPU & Memory unit conversion for Kubernetes manifests (mCores, Gi, Mi).

### 🗄️ Database Tools
- **Oracle Object Validator**: A comprehensive suite for validating and managing Oracle Database objects.
    - **Env Checker**: Compare database objects (Tables, Views, Packages, etc.) across environments (e.g., DEV vs UAT) with precision.
        - **Whitespace Agnostic**: Accurately detects logic changes while ignoring formatting/whitespace differences using robust normalization.
        - **Excel Integration**: Upload object lists via Excel for bulk validation.
        - **Interactive Diff Viewer**: Side-by-side Monaco Editor diff view with syntax highlighting (`plsql`) to verify changes down to the line.
        - **Auto-Compile/Sync**: ⚡ Push changes from Source to Target (or vice-versa) directly from the UI with safety checks, confirmation dialogs, and auto-rescan.
        - **Auto-Mapping**: Smartly suggests connection mappings based on object owners found in the uploaded file.
        - **Excel Reports**: Export detailed validation results to Excel.
    - **Connection Manager**: Securely manage Oracle Database connections.
        - **Encrypted Storage**: Connections are stored locally in browser's IndexedDB with AES encryption.
        - **Test & Auto-Save**: Verify connectivity with a single click; successful tests automatically save the connection profile.
        - **Import/Export**: Securely backup your connection profiles (encrypted file) or import legacy connections from SQL Developer JSON exports.

### 📐 Architecture & Design
- **ERD Designer**: Create and manage Entity Relationship Diagrams visually.
    - **Visual Editing**: Add tables, columns (PK/FK/Types), and connect them with drag-and-drop.
    - **DDL Import**: Reverse engineer your database by importing SQL/DDL (Copy-Paste or **Multi-File Upload**).
    - **SQL Generation**: Auto-generate `CREATE TABLE` scripts for **PostgreSQL**, **MySQL**, **Oracle**, and **SQL Server**.
    - **JSON Export/Import**: Save your work and revisit it later.
- **Flowchart Designer**: Design interactive flowcharts and logic diagrams.
    - **Standard Nodes**: Start/End, Process, Decision, and Input/Output nodes.
    - **Drag & Drop**: Intuitive canvas interface with custom visual shapes for each node type.
    - **Export**: Share your diagrams via JSON export/import.

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
- **Hit API Endpoint**: A lightweight Postman alternative to test REST APIs (GET, POST, PUT, DELETE) directly from your browser. Now supports **Binary Responses** (Image Preview).
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
- **Database**: [node-oracledb](https://node-oracledb.readthedocs.io/) (Oracle Database Driver)
- **Backend Integration**: Node.js Child Process (for OpenShift CLI integration)
- **Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/) (VS Code core)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Diagramming**: [React Flow](https://reactflow.dev/)

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
    - **Option A (Easy):** Double-click `start.bat`.
    - **Option B (Manual):** Run `npm run dev`.

5.  **Open your browser:**
    Navigate to `http://localhost:1998` to start using the tools.

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
    - **Cara Mudah:** Double-click file **`start.bat`**.
    - **Cara Manual:** Buka terminal dan ketik `npm run dev`.

5.  **Mulai Menggunakan:**
    Buka browser (Chrome/Edge) dan akses alamat:
    `http://localhost:1998`

## 🤝 Contributing

Contributions are welcome! If you have an idea for a new tool or want to improve an existing one, feel free to open an issue or submit a pull request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

*Built with ❤️ by [Oman](https://github.com/omandotkom)*
