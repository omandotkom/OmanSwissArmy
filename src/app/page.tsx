import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 font-sans text-zinc-100">
      <main className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <h1 className="text-center text-3xl font-light tracking-wide text-zinc-200 mb-8">
          Oman Swiss Army Tool
        </h1>

        <Link href="/json-formatter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            JSON Formatter
          </button>
        </Link>

        <Link href="/sql-formatter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            SQL Formatter
          </button>
        </Link>

        <Link href="/api-test" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            API Test
          </button>
        </Link>

        <Link href="/jwt-decoder" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            JWT Decoder
          </button>
        </Link>

        <Link href="/base64" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Base64 Converter
          </button>
        </Link>

        <Link href="/uuid-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            UUID Generator
          </button>
        </Link>

        <Link href="/diff-checker" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Diff Checker
          </button>
        </Link>

        <Link href="/regex-tester" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Regex Tester
          </button>
        </Link>

        <Link href="/timestamp-converter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Timestamp Converter
          </button>
        </Link>

        <Link href="/json-to-code" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            JSON to Code
          </button>
        </Link>

        <Link href="/hash-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Hash Generator
          </button>
        </Link>

        <Link href="/color-converter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Color Converter
          </button>
        </Link>

        <Link href="/markdown-preview" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Markdown Preview
          </button>
        </Link>

        <Link href="/image-converter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Image Converter
          </button>
        </Link>

        <Link href="/lorem-ipsum" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Lorem Ipsum
          </button>
        </Link>

        <Link href="/url-encoder" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            URL Encoder/Decoder
          </button>
        </Link>

        <Link href="/qrcode-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            QR Code Generator
          </button>
        </Link>

        <Link href="/string-counter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            String Counter
          </button>
        </Link>

        <Link href="/chmod-calculator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Chmod Calculator
          </button>
        </Link>

        <Link href="/cron-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Cron Generator
          </button>
        </Link>

        <Link href="/html-entity" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            HTML Entity Encoder
          </button>
        </Link>

        <Link href="/meta-tag-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Meta Tag Generator
          </button>
        </Link>

        <Link href="/password-generator" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Password Generator
          </button>
        </Link>

        <Link href="/encrypt-decrypt" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Encrypt / Decrypt
          </button>
        </Link>

        <Link href="/deploy-db" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            Deploy Oracle Object DB
          </button>
        </Link>

        <Link href="/pvc-browser" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            PVC Browser
          </button>
        </Link>
      </main>
    </div>
  );
}
