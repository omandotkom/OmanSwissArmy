import Link from "next/link";



export default function Home() {
  const toolGroups = [
    {
      name: "Development & Utils",
      items: [
        {
          href: "/api-test",
          title: "Hit API Endpoint",
          description: "Test and debug API endpoints with ease.",
        },
        {
          href: "/diff-checker",
          title: "Diff Checker",
          description: "Compare text files and highlight differences.",
        },
        {
          href: "/regex-tester",
          title: "Regex Tester",
          description: "Test and validate regular expressions.",
        },
        {
          href: "/markdown-preview",
          title: "Markdown Preview",
          description: "Preview Markdown syntax in real-time.",
        },
        {
          href: "/string-counter",
          title: "String Counter",
          description: "Count characters, words, and lines.",
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
          href: "/pvc-browser",
          title: "PVC Browser",
          description: "Inspect Kubernetes Persistent Volume Claims.",
        },
        {
          href: "/openshift-resource-converter",
          title: "Resource Unit Converter",
          description: "Convert CPU and Memory units for Kubernetes/OpenShift.",
        },
        {
          href: "/pvc-analyzer",
          title: "PVC Analyzer",
          description: "Find zombie PVCs and analyze storage usage.",
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
          href: "/json-formatter",
          title: "JSON Formatter",
          description: "Format and validate JSON data instantly.",
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
        {
          href: "/json-to-code",
          title: "JSON to Code",
          description: "Generate type definitions from JSON.",
        },
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
      ],
    },
    {
      name: "Encoders & Decoders",
      items: [
        {
          href: "/jwt-decoder",
          title: "JWT Decoder",
          description: "Decode and inspect JSON Web Tokens.",
        },
        {
          href: "/base64",
          title: "Base64 Converter",
          description: "Encode and decode Base64 strings.",
        },
        {
          href: "/url-encoder",
          title: "URL Encoder/Decoder",
          description: "Encode and decode URL-safe strings.",
        },
        {
          href: "/html-entity",
          title: "HTML Entity Encoder",
          description: "Encode special characters for HTML.",
        },
      ],
    },
    {
      name: "Generators",
      items: [
        {
          href: "/uuid-generator",
          title: "UUID Generator",
          description: "Generate unique identifiers (UUID v4).",
        },
        {
          href: "/lorem-ipsum",
          title: "Lorem Ipsum",
          description: "Generate placeholder text for designs.",
        },
        {
          href: "/qrcode-generator",
          title: "QR Code Generator",
          description: "Create QR codes for text and URLs.",
        },
        {
          href: "/meta-tag-generator",
          title: "Meta Tag Generator",
          description: "Create SEO-friendly meta tags.",
        },
      ],
    },
    {
      name: "Security",
      items: [
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
        {
          href: "/encrypt-decrypt",
          title: "Encrypt / Decrypt",
          description: "Secure text with simple encryption algorithms.",
        },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-950 p-6 font-sans text-zinc-100">
      <main className="w-full max-w-7xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-light tracking-wide text-zinc-200">
            Oman Swiss Army Tool
          </h1>
          <p className="mt-2 text-zinc-500">
            A collection of developer utilities for your daily needs.
          </p>
        </div>

        {toolGroups.map((group) => (
          <section key={group.name} className="mb-10">
            <h2 className="mb-6 flex items-center text-xl font-semibold text-zinc-400">
              <span className="mr-4 h-px flex-1 bg-zinc-800"></span>
              {group.name}
              <span className="ml-4 h-px flex-1 bg-zinc-800"></span>
            </h2>
            <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((tool) => (
                <Link key={tool.href} href={tool.href} className="block w-full">
                  <button className="group relative flex h-full w-full flex-col items-start justify-start overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 p-6 text-left shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
                    <span className="mb-1 text-lg font-medium text-zinc-300 transition-colors duration-300 group-hover:text-white">
                      {tool.title}
                    </span>
                    <div className="max-h-0 opacity-0 transition-all duration-300 ease-out group-hover:max-h-20 group-hover:opacity-100 group-hover:mt-2">
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {tool.description}
                      </p>
                    </div>
                  </button>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
