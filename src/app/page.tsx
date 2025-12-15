"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const toolGroups = [
    {
      name: "Development & Utils",
      items: [
        {
          href: "/directory-diff",
          title: "Directory Comparator",
          description: "Compare directories and view file differences.",
        },
        {
          href: "/diff-checker",
          title: "Diff Checker",
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
          href: "/idle-pod-finder",
          title: "Idle Pod Finder",
          description: "Detect inactive pods to save resources.",
        },
        {
          href: "/oracle-object-validator",
          title: "Oracle Object DB Validator",
          description: "Compare and validate Oracle DB objects between environments.",
        },
        {
          href: "/pvc-analyzer",
          title: "PVC Analyzer",
          description: "Find zombie PVCs, inspect contents, and analyze usage.",
        },
        {
          href: "/pvc-browser",
          title: "PVC Browser",
          description: "Inspect Kubernetes Persistent Volume Claims.",
        },
        {
          href: "/pvc-migrator",
          title: "PVC Migrator (Beta)",
          description: "Safely migrate PVCs to new storage classes wizard.",
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

  // Filtering Logic
  const filteredGroups = toolGroups.map(group => {
    const filteredItems = group.items.filter(item => {
      try {
        const regex = new RegExp(searchQuery, 'i');
        return (
          regex.test(item.title) ||
          regex.test(item.description) ||
          regex.test(item.href)
        );
      } catch (e) {
        // Fallback for invalid regex (e.g. while typing)
        const lowerQuery = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.href.toLowerCase().includes(lowerQuery)
        );
      }
    });

    return { ...group, items: filteredItems };
  }).filter(group => group.items.length > 0);


  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-950 p-6 font-sans text-zinc-100">
      <main className="w-full max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light tracking-wide text-zinc-200">
            Oman Swiss Army Tool
          </h1>
          <p className="mt-2 text-zinc-500">
            A collection of developer utilities for your daily needs.
          </p>

          <div className="mt-8 relative max-w-md mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-500" />
            </div>
            <input
              type="text"
              placeholder="Search tools (e.g., 'json', 'decoder')..."
              className="block w-full pl-10 pr-3 py-2 border border-zinc-800 rounded-lg leading-5 bg-zinc-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
            <Search className="h-12 w-12 mb-4 opacity-20" />
            <p>No tools found matching "{searchQuery}"</p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.name} className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
          ))
        )}
      </main>
    </div>
  );
}
