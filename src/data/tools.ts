export const toolGroups = [
    {
        name: "Development & Utils",
        items: [
            {
                href: "/directory-diff",
                title: "Directory Comparator",
                description: "Compare directories and view file differences.",
            },
            {
                href: "/port-manager",
                title: "Port Manager",
                description: "Check port usage and kill blocking processes.",
                platforms: ["win32"],
            },
            {
                href: "/ssl-decoder",
                title: "SSL Decoder",
                description: "Decode certificates, check expiry, and validate chains.",
            },
            {
                href: "/diff-checker",
                title: "Text Compare",
                description: "Compare text files and highlight differences.",
            },
            {
                href: "/erd-design",
                title: "ERD Designer",
                description: "Design database schemas and generate SQL.",
            },
            {
                href: "/flowchart-design",
                title: "Flowchart Designer",
                description: "Create interactive flowcharts and diagrams.",
            },
            {
                href: "/api-test",
                title: "Hit API Endpoint",
                description: "Test and debug API endpoints with ease.",
            },
            {
                href: "/sqlite-browser",
                title: "SQLite Browser",
                description: "Open and browse SQLite (.db) files locally.",
                isNew: true,
            },
            {
                href: "/markdown-preview",
                title: "Markdown Preview",
                description: "Preview Markdown syntax in real-time.",
            },
            {
                href: "/regex-tester",
                title: "Regex Tester",
                description: "Test and validate regular expressions.",
            },
            {
                href: "/string-counter",
                title: "String Counter",
                description: "Count characters, words, and lines.",
            },
            {
                href: "/sql-review",
                title: "AI SQL Code Review",
                description: "Analyze SQL Stored Procedures for bugs using AI.",
                dependency: "ai",
            },
        ],
    },
    {
        name: "DevOps & Cloud",
        items: [
            {
                href: "/chmod-calculator",
                title: "Chmod Calculator",
                description: "Calculate Linux file permissions easily.",
            },
            {
                href: "/cluster-doctor",
                title: "Cluster Doctor",
                description: "Diagnose stuck builds and cluster health.",
                dependency: "oc",
            },
            {
                href: "/cron-generator",
                title: "Cron Generator",
                description: "Build and verify cron schedule expressions.",
            },
            {
                href: "/deploy-db",
                title: "Deploy Oracle Object DB",
                description: "Deploy and manage Oracle DB objects.",
            },
            {
                href: "/gitea-browser",
                title: "Gitea Browser",
                description: "Browse repositories from your Gitea instance.",
            },
            {
                href: "/idle-pod-finder",
                title: "Idle Pod Finder",
                description: "Detect inactive pods to save resources.",
                dependency: "oc",
            },
            {
                href: "/oracle-object-validator",
                title: "Oracle Object DB Validator",
                description: "Compare and validate Oracle DB objects between environments.",
            },
            {
                href: "/oracle-object-backup",
                title: "Oracle Object Local Backup",
                description: "Backup Oracle DB objects code to local folder.",
            },
            {
                href: "/pvc-analyzer",
                title: "PVC Analyzer",
                description: "Find zombie PVCs, inspect contents, and analyze usage.",
                dependency: "oc",
            },
            {
                href: "/pvc-browser",
                title: "PVC Browser",
                description: "Inspect Kubernetes Persistent Volume Claims.",
                dependency: "oc",
            },
            {
                href: "/pvc-migrator",
                title: "PVC Migrator (Beta)",
                description: "Safely migrate PVCs to new storage classes wizard.",
                dependency: "oc",
            },
            {
                href: "/openshift-resource-converter",
                title: "Resource Unit Converter",
                description: "Convert CPU and Memory units for Kubernetes/OpenShift.",
            },
            {
                href: "/s3-browser",
                title: "S3 Browser",
                description: "Browse and manage S3-compatible buckets.",
            },
        ],
    },
    {
        name: "Formatters & Converters",
        items: [
            {
                href: "/color-converter",
                title: "Color Converter",
                description: "Convert colors between HEX, RGB, and HSL.",
            },
            {
                href: "/image-converter",
                title: "Image Converter",
                description: "Convert and resize image files.",
            },
            {
                href: "/json-formatter",
                title: "JSON Formatter",
                description: "Format and validate JSON data instantly.",
            },
            {
                href: "/json-to-code",
                title: "JSON to Code",
                description: "Generate type definitions from JSON.",
            },
            {
                href: "/number-to-words",
                title: "Number to Words",
                description: "Convert numbers to text in ID/EN.",
            },
            {
                href: "/sql-formatter",
                title: "SQL Formatter",
                description: "Beautify and standardize your SQL queries.",
            },
            {
                href: "/timestamp-converter",
                title: "Timestamp Converter",
                description: "Convert between timestamps and human dates.",
            },
        ],
    },
    {
        name: "Encoders & Decoders",
        items: [
            {
                href: "/base64",
                title: "Base64 Converter",
                description: "Encode and decode Base64 strings.",
            },
            {
                href: "/html-entity",
                title: "HTML Entity Encoder",
                description: "Encode special characters for HTML.",
            },
            {
                href: "/jwt-decoder",
                title: "JWT Decoder",
                description: "Decode and inspect JSON Web Tokens.",
            },
            {
                href: "/url-encoder",
                title: "URL Encoder/Decoder",
                description: "Encode and decode URL-safe strings.",
            },
        ],
    },
    {
        name: "Generators",
        items: [
            {
                href: "/lorem-ipsum",
                title: "Lorem Ipsum",
                description: "Generate placeholder text for designs.",
            },
            {
                href: "/meta-tag-generator",
                title: "Meta Tag Generator",
                description: "Create SEO-friendly meta tags.",
            },
            {
                href: "/qrcode-generator",
                title: "QR Code Generator",
                description: "Create QR codes for text and URLs.",
            },
            {
                href: "/uuid-generator",
                title: "UUID Generator",
                description: "Generate unique identifiers (UUID v4).",
            },
        ],
    },
    {
        name: "Security",
        items: [
            {
                href: "/encrypt-decrypt",
                title: "Encrypt / Decrypt",
                description: "Secure text with simple encryption algorithms.",
            },
            {
                href: "/hash-generator",
                title: "Hash Generator",
                description: "Calculate cryptographic hashes (MD5, SHA).",
            },
            {
                href: "/password-generator",
                title: "Password Generator",
                description: "Create strong and secure passwords.",
            },
        ],
    },
];
