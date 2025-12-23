# Oman Swiss Army Tool

Oman Swiss Army Tool adalah suite utilitas developer berbasis web (Next.js + TypeScript) untuk kebutuhan harian: database, DevOps/Cloud, keamanan, format data, konversi, dan visual design. Banyak tool berjalan 100% di browser; beberapa fitur membutuhkan akses eksternal (OpenShift, Oracle, S3, Gitea/GitHub, SSL URL, QR Code API).

## Fitur global
- Dashboard kategori dengan search regex dan AI search lokal (all-MiniLM-L6-v2) untuk menemukan tool lebih cepat.
- Dependency check otomatis: OC binary, AI model, dan platform; tool yang tidak tersedia akan dinonaktifkan.
- Settings modal:
  - Oracle Connections (Connection Manager).
  - AI Models (coming soon).
  - Export (coming soon).
  - Update (coming soon).
  - About.
- Connection Manager (Oracle) tersimpan di IndexedDB dengan enkripsi AES:
  - CRUD koneksi, show/hide password.
  - Test connection (auto-save).
  - Check all connections dengan status + sort (success/failed).
  - Import JSON dari SQL Developer.
  - Super Import/Export file `.conn` terenkripsi.
- Activity tracking (opsional):
  - Page view + click tracking via Web Worker.
  - Dev mode hanya log ke console.
  - Production ke Firebase Firestore (lihat `FIREBASE_SETUP.md`).

## Katalog fitur (detail)

### Development & Utils
- Directory Comparator
  - Pilih dua folder, ignore dotfiles.
  - Progress scan, statistik Added/Removed/Modified/Unchanged.
  - Tree view + diff viewer (Monaco) untuk file teks.
  - Deteksi file biner, skip diff konten.
- Port Manager (Windows)
  - Scan port dengan worker + progress.
  - Quick picks port umum.
  - Tampilkan process name, PID, protocol.
  - Kill process dengan konfirmasi.
- SSL Decoder
  - Mode paste/upload/URL.
  - Decode CN, issuer, subject, serial.
  - Validity, days remaining, expired warning.
  - SAN list, fingerprint SHA1/SHA256, copy.
- Text Compare (Diff Checker)
  - Monaco diff editor.
  - Inline vs split view.
  - Pilih bahasa.
  - Find di sisi original/modified.
- ERD Designer
  - Drag/drop table nodes (React Flow).
  - Edit table name + columns, tipe data, PK/FK/NN.
  - Hapus table/column.
  - Relasi antar table (edge).
  - Import/Export JSON.
  - Import DDL (Create Table) dari file atau paste.
  - Generate SQL untuk PostgreSQL, MySQL, Oracle, SQL Server + copy.
- Flowchart Designer
  - Shape: Start/End, Process, Decision, I/O.
  - Edit label, connect edges (arrow).
  - Import/Export JSON.
  - Delete node.
- Hit API Endpoint
  - Saved requests (IndexedDB), create/load/delete.
  - Method selector (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS).
  - Mode server (proxy) vs client (browser); desktop app dipaksa client.
  - Request body vs headers (tab).
  - Response viewer + status/time.
  - Preview image/PDF (binary).
- SQLite Browser
  - Buka file .db/.sqlite lokal via SQL.js WASM.
  - List table/view + columns.
  - Query editor + execution time.
  - Export hasil query ke CSV.
  - Export DB (unencrypted).
  - Deteksi DB terenkripsi -> password modal -> query via `api/sqlite-proxy`.
- Markdown Previewer
  - Monaco editor + live preview.
  - Support header, bold/italic, inline code, code block, list, link, blockquote.
- Regex Tester
  - Regex + flags, real-time matches.
  - Menampilkan index + capture groups.
  - Penjelasan token regex (cheatsheet).
- String Counter
  - Characters, characters without spaces, words, lines, paragraphs.
- AI SQL Code Review
  - Input: owner + nama stored procedure (fetch DDL dari Oracle).
  - Fallback contoh code jika fetch gagal.
  - Local AI worker (Qwen2.5-Coder) dengan progress.
  - Output Markdown: bug, performa, dan security.
- AI Search (Dashboard)
  - Semantic search lokal (all-MiniLM-L6-v2).
  - Offline setelah model tersedia.

### DevOps & Cloud
- Chmod Calculator
  - Toggle read/write/execute untuk owner/group/public.
  - Output oktal + simbolik + contoh command.
- Cluster Doctor (OpenShift)
  - Login via `oc login`.
  - Project selector + user badge (role).
  - Quota CPU/memory/other + critical indicator.
  - Analisis pod pending beserta event.
  - Infra stress alert (node overload).
  - Deep scan optional: node metrics + top pods.
- Cron Generator
  - Input minute/hour/day/month/week.
  - Quick options per field.
  - Output cron string.
- Deploy Oracle Object DB
  - Upload Excel (multi-sheet).
  - Filter per kolom + select row.
  - Deteksi OWNER dari sheet.
  - Mapping owner -> source/target Oracle connection.
  - Manage connections via Connection Manager.
  - `Start deployment` button (UI).
- Gitea Browser (Gitea/GitHub)
  - Save/load/delete connection (encrypted).
  - Base URL + token, auto-detect GitHub API.
  - Repository list + search.
  - Repo card (stars, forks, language, private/public, open link).
  - Analytics dashboard: language distribution, activity chart, top repos.
  - Account insights: profile, active projects YTD, contributions heatmap (Gitea), total repos.
- Idle Pod Finder
  - Login + project select.
  - CPU idle threshold (1/5/10/20m).
  - List pods sorted by CPU.
  - Idle count + action button (shutdown placeholder).
- Oracle Object DB Validator (submenu)
  - Object DB Env Checker
    - Upload Excel (multi-sheet), filter, select rows.
    - Auto mapping owner -> env1/env2 (keyword assisted).
    - Preflight connection check.
    - Concurrent validation (batch).
    - DDL normalization: ignore SYS_ constraints, sort table columns, ignore sequence properties.
    - Special COLUMN/QUERY parsing untuk validasi kolom.
    - Result status: MATCH/DIFF/MISSING/ERROR + issue-only filter.
    - Diff viewer (Monaco) + push compile source<->target.
    - Export report ke Excel.
    - Error debug popup (DDL vs query).
  - Env Data Checker
    - Select source/target connection.
    - Fetch tables dari source.
    - Search tabel + pilih tabel.
    - Fetch columns + pilih kolom.
    - Compare data (row count + per-row diff).
    - Result modal + diff viewer (source-only vs target-only).
  - Two Way Comparison
    - Input schema list manual.
    - Mapping Master vs Slave.
    - Job streaming logs + progress.
    - Summary: missing/new/diff counts.
    - Report preview + filter issue-only.
    - Download Excel.
    - Diff viewer + patch download.
  - Three Way Comparison
    - Upload Excel object list.
    - Auto mapping owner -> master/slave (keyword).
    - Job streaming logs + progress.
    - Report preview + filter issue-only.
    - Download Excel (auto column width).
    - Diff viewer + patch script download.
    - Upload report CSV untuk preview.
    - Missing connection modal.
  - Object DB Merger
    - Upload multi Excel.
    - Ringkasan per sheet (count).
    - Merge dedupe by OWNER/NAME/TYPE.
    - Duplicate report.
    - Download merged file menggunakan `public/OBJ_DB_TEMPLATE.xlsx`.
- Oracle Object Local Backup
  - Mode: All Objects (schema) atau Excel list.
  - Test connection + fetch object list.
  - Mapping owner -> connection (Excel mode).
  - Concurrent fetch DDL + progress.
  - Output ke folder lokal (File System Access API).
  - Export report Excel.
- PVC Analyzer
  - Login + project selector.
  - Tabs: PVC, ConfigMap, Secret.
  - Stats: total, zombie/orphan, RWO risk.
  - Filter: name, status, storage class, mounted.
  - Deteksi zombie, RWO risk, mounted-by list.
  - Scan usage (real disk usage) untuk kandidat.
  - Inspect zombie -> spawn debug pod -> open PVC Browser.
- PVC Browser
  - Login + project selector.
  - Filter storage class, pilih pod, mount path, custom path.
  - File browser + preview, download, delete.
  - Breadcrumb navigation + go up.
  - PVC info (status, size, storage class).
  - px-sc Storage Finder (cross project) + export Excel + logs.
  - Deep link via query param `project`, `pod`, `path`.
- PVC Migrator (Beta)
  - Wizard 3 langkah: Select source, configure, migrate.
  - Target storage class + target PVC name.
  - Volume name input (deployment spec).
  - Verify method: size vs checksum.
  - Steps otomatis: check HPA, create dest PVC, scale down/up, copy, verify, switch volume, cleanup.
  - Optional delete old PVC (confirm).
  - Emergency cleanup (delete pod + new PVC).
- OpenShift Resource Converter
  - CPU: m <-> cores.
  - Memory: bytes/Mi/Gi.
  - Copy hasil.
- S3 Browser
  - Profile koneksi (encrypted) + connect/disconnect.
  - List buckets, manual add bucket jika list denied.
  - Browse folder/prefix.
  - Download via presigned URL.
  - Preview file: image, video, audio, pdf, text, code, docx, xlsx.
  - Bucket usage analysis (pie chart + table).
  - Set visual capacity per bucket.

### Formatters & Converters
- Color Converter
  - HEX/RGB input -> HSL output.
  - Live preview.
- Image Converter
  - Upload image.
  - Convert ke WebP/JPEG/PNG.
  - Quality slider.
  - Preview before/after + download.
- JSON Formatter
  - Monaco editor + format + error.
- JSON to Code
  - Generate TypeScript/Go/Java.
  - Copy JSON / Copy Code.
- Number to Words
  - Bahasa Indonesia/English.
  - Format currency IDR/USD.
- SQL Formatter
  - Formatter sederhana berbasis keyword dan indent.
- Timestamp Converter
  - Current timestamp (live).
  - Convert timestamp <-> ISO.
  - Toggle seconds/milliseconds.

### Encoders & Decoders
- Base64 Converter (encode/decode).
- HTML Entity Encoder (encode/decode).
- JWT Decoder (header + payload).
- URL Encoder/Decoder.

### Generators
- Lorem Ipsum (paragraphs/sentences/words, count, copy).
- Meta Tag Generator (title, description, keywords, author, OG image/URL, twitter card).
- QR Code Generator (uses api.qrserver.com).
- UUID Generator (bulk, copy).

### Security
- Encrypt/Decrypt (AES/DES/TripleDES/Rabbit/RC4).
- Hash Generator (MD5/SHA1/SHA256/SHA512).
- Password Generator (length, uppercase/lowercase/numbers/symbols, strength, copy).

## Prasyarat dan dependensi
- Node.js (disarankan LTS).
- Port default dev: 1998.
- OpenShift tools: taruh `oc.exe` (Windows) atau `oc` (Linux/Mac) di `bin/`.
- Oracle tools: membutuhkan akses Oracle DB dan runtime `node-oracledb` (Instant Client).
- AI:
  - AI Search: model `Xenova/all-MiniLM-L6-v2` di `public/models/Xenova/all-MiniLM-L6-v2`.
  - AI SQL Review: model Qwen2.5-Coder di `public/models/qwen25coder` (lihat `start.bat`).
- SQLite Browser: `public/wasm/sql-wasm.wasm` (disalin dari `sql.js`).
- Activity tracking: optional Firebase Firestore (`FIREBASE_SETUP.md`).

## Menjalankan aplikasi

### Opsi cepat (Windows)
```
start.bat
```
Script ini:
- cek Node.js,
- `npm install` (menggunakan registry Nexus di script),
- optional download model AI,
- buka `http://localhost:1998`,
- run `npm run dev`.

Jika registry internal tidak tersedia, jalankan manual:
```
npm install
npm run dev
```

### Opsi manual
```
npm install
npm run dev
```
Lalu buka `http://localhost:1998`.

## Build standalone (opsional)
```
build.bat
```
Build ini menyalin `public`, `bin`, dan `sql-wasm.wasm` ke `.next/standalone` dan menghasilkan `start.bat` di paket standalone.

## Catatan privasi dan jaringan
- Banyak tool berjalan lokal di browser.
- Fitur yang butuh network: OpenShift, Oracle, S3, Gitea/GitHub, SSL URL, QR Code API.
- AI berjalan lokal (model di `public/models`), tidak mengirim data ke server eksternal.

## Tech stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Monaco Editor
- React Flow
- Recharts
- ONNX Runtime Web + transformers.js
- node-oracledb
- sql.js (WASM)
- CryptoJS (AES)

## License
MIT.
