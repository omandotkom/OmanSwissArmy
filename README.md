# Oman Swiss Army Tool 🛠️

**The Ultimate Developer Utility Suite**

Oman Swiss Army Tool is a comprehensive, all-in-one web application designed to supercharge developer productivity. Built with **Next.js**, **TypeScript**, and **Tailwind CSS**, it provides a collection of essential tools for everyday coding tasks, integrated with backend capabilities for system operations.

## 🚀 Features

Access powerful tools to streamline your development workflow, categorized by function:

### 🧠 AI & Intelligent Assistance (New!)
- **AI SQL Code Review**: 
    - **Local AI Engine**: Powered by the **Qwen2.5-Coder** model running locally in your browser/worker (Privacy First, No Data Leaks).
    - **Smart Analysis**: Reviews Oracle PL/SQL Stored Procedures for logic errors, security vulnerabilities (SQL Injection), and performance bottlenecks.
    - **Offline Capable**: Once the model is downloaded, it works completely offline.

### ☁️ Cloud, Storage & Infrastructure
- **Cluster Doctor (Kubernetes/OpenShift)**: 
    - **Diagnose Stuck Builds**: Analyze why pods are pending (Resource Quotas, Scheduler failures).
    - **Infrastructure Limits**: View Project CPU/Memory Quotas usage in real-time.
    - **Node Pressure**: Detect if physical nodes are overloaded (requires metrics server).
- **Idle Pod Finder**:
    - **Cost Optimization**: Detect "Zombie" pods consuming resources but doing nothing (Low CPU usage).
    - **Custom Thresholds**: Set your own definition of "Idle" (e.g., usage < 5m CPU).
- **PVC Browser**: A robust file manager for OpenShift Persistent Volume Claims.
    - **Pod & Mount Explorer**: Browse files inside Pods and PVC mount points directly from the UI.
    - **PVC Insights**: Auto-detect PVC backed mounts and display details.
    - **Storage Finder**: Realtime cluster scanner to find workloads using a specific storage class with Excel Export.
- **S3 Browser**: Client for S3-compatible storage.
    - **Multi-Cloud**: Connect to AWS, MinIO, or on-prem Object Storage.
    - **File Operations**: Browse buckets, folders, and securely download files.

### 🗄️ Database & DevOps
- **Oracle Object Backup**:
    - **Local DDL Dump**: Stream DDL (Tables, Views, SPs, etc.) from Oracle directly to your local file system.
    - **Excel Batch Processing**: Upload an Excel file defining exactly which objects to backup for which owner.
    - **Concurrent Processing**: Multi-threaded fetching for backing up thousands of objects in seconds.
    - **Connection Mapping**: flexible source selection for multi-schema backups.
- **Oracle Object Validator**: 
    - **Env Checker**: Compare database objects keys across environments.
    - **Three Way Comparison (New!)**: 
        - **Deep Analysis**: Concurrent comparison of thousands of objects (Master vs Slave vs Excel) using connection pools.
        - **Smart DDL Normalization**: Ignores system constraints (`SYS_C...`) and table column order to prevent false positives.
        - **Diff Viewer**: Integrated side-by-side Monaco Diff Editor to inspect code changes.
    - **Env Data Checker (New!)**: 
        - **Data Integrity**: Verify row counts and content consistency across environments.
        - **Dynamic Mapping**: Flexible column selection and auto-mapping of tables.
    - **Auto-Sync**: Push changes from Source to Target directly.
- **Connection Manager**:
    - **Secure Storage**: Oracle DB credentials stored locally encrypted (AES).
    - **Import/Export**: Backup your profiles safely.

### 💻 Development & Git
- **Git Browser (Gitea/GitHub)**:
    - **Unified Interface**: Browse repositories from both GitHub.com and private Gitea servers.
    - **Analytics Dashboard**: Visualize language distribution, activity trends, and star counts.
    - **Contribution Heatmap**: View your commit activity over the last year.
- **Directory Diff**:
    - **Folder Comparison**: Select two local folders to compare their entire contents.
    - **Smart Filtering**: Detect Added, Removed, and Modified files.
    - **Visual Diff**: View side-by-side text differences for modified files.

### 🔐 Security & Cryptography
- **Encrypt / Decrypt**:
    - **Multi-Algorithm**: Support for **AES**, **DES**, **TripleDES**, **Rabbit**, and **RC4**.
    - **Secure Processing**: All encryption happens locally in the browser.
- **JWT Decoder**: Inspect JSON Web Tokens headers and payloads.
- **Hash Generator**: Generate MD5, SHA-1, SHA-256, SHA-512 hashes.
- **Password Generator**: Create cryptographically strong passwords.

### 🛠️ Web & Text Utilities
- **Converters**:
    - **JSON to Code**: Convert JSON objects into **TypeScript**, **Go**, **Java**, or **Rust** structs instantly.
    - **HTML Entity**: Encode/Decode special characters for safe HTML embedding.
    - **URL Encoder**: Safe URL encoding/decoding for query parameters.
    - **Timestamp Converter**: Convert Unix/Epoch timestamps to Human-readable dates and vice-versa.
- **Generators**:
    - **UUID Generator**: Bulk formulate v4 UUIDs.
    - **Lorem Ipsum**: Generate placeholder text for design mockups.
    - **Meta Tag Generator**: Create SEO-ready meta tags for your websites.
- **Analyzers**:
    - **Regex Tester**: Test and validate regular expressions against text.
    - **String Counter**: Analyze text character count, word count, and line count.
- **Formatters**: 
    - **JSON Formatter**: Pretty-print and validate JSON.
    - **SQL Formatter**: Standardize SQL queries.

### 🎨 Design & Visuals
- **Number to Words**:
    - **Currency Support**: Convert numbers to text (terbilang) for **IDR (Rupiah)** and **USD (Dollars)**.
- **ERD & Flowchart Designer**:
    - **Visual Modeling**: Drag-and-drop interface creating database schemas and logic flows.
    - **SQL Generation**: Auto-generate DDL from diagrams.
- **Markdown Preview**: Real-time markdown editor and split-pane previewer.
- **Image Converter**: Convert images between WebP, PNG, and JPG formats.
- **Design Tools**: Color Converter (HEX/RGB/HSL), QR Code Generator.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI Inference**: [ONNX Runtime Web](https://onnxruntime.ai/) & [Transformers.js](https://huggingface.co/docs/transformers.js)
- **Database**: [node-oracledb](https://node-oracledb.readthedocs.io/)
- **Charts**: [Recharts](https://recharts.org/)
- **Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)

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

3.  **Setup External Tools (Optional):**
    - For **PVC Browser** features: Place `oc.exe` (OpenShift CLI) in the `bin/` folder.
    - For **AI Features**: The app will automatically download the `Qwen2.5-Coder` model (~450MB) on first launch via the startup script.

4.  **Run the Application:**
    - **Easy Mode**: Double-click `start.bat` (Windows). This handles checks, model downloads, and browser opening.
    - **Manual Mode**: Run `npm run dev` and open `http://localhost:1998`.

## 🇮🇩 Panduan Singkat (Bahasa Indonesia)

Tool ini adalah "Kotak Perkakas" untuk developer. Cara paling mudah menggunakannya:

1.  **Install**: Pastikan ada Node.js, lalu jalankan `npm install`.
2.  **Jalankan**: Klik 2x file **`start.bat`**.
3.  **Model AI**: Saat pertama kali dijalankan, script akan menawarkan download model AI. Pilih **Y** (Yes) agar fitur "AI Review" bisa dipakai offline.
4.  **Akses**: Buka `http://localhost:1998` di browser.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

*Built with ❤️ by [Oman](https://github.com/omandotkom)*
