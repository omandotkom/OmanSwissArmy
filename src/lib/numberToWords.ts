
export function numberToWordsID(n: number): string {
    const satuan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

    if (n < 12) return " " + satuan[n];
    if (n < 20) return numberToWordsID(n - 10) + " belas";
    if (n < 100) return numberToWordsID(Math.floor(n / 10)) + " puluh" + numberToWordsID(n % 10);
    if (n < 200) return " seratus" + numberToWordsID(n - 100);
    if (n < 1000) return numberToWordsID(Math.floor(n / 100)) + " ratus" + numberToWordsID(n % 100);
    if (n < 2000) return " seribu" + numberToWordsID(n - 1000);
    if (n < 1000000) return numberToWordsID(Math.floor(n / 1000)) + " ribu" + numberToWordsID(n % 1000);
    if (n < 1000000000) return numberToWordsID(Math.floor(n / 1000000)) + " juta" + numberToWordsID(n % 1000000);
    if (n < 1000000000000) return numberToWordsID(Math.floor(n / 1000000000)) + " milyar" + numberToWordsID(n % 1000000000);
    if (n < 1000000000000000) return numberToWordsID(Math.floor(n / 1000000000000)) + " triliun" + numberToWordsID(n % 1000000000000);

    return "Angka terlalu besar";
}

export function numberToWordsEN(n: number): string {
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    if (n === 0) return "";

    // Helper to format space correctly
    const fmt = (s: string) => (s ? " " + s : "");

    if (n < 10) return fmt(units[n]);
    if (n < 20) return fmt(teens[n - 10]);
    if (n < 100) return fmt(tens[Math.floor(n / 10)]) + numberToWordsEN(n % 10);
    if (n < 1000) return numberToWordsEN(Math.floor(n / 100)) + " Hundred" + numberToWordsEN(n % 100);

    if (n < 1000000) return numberToWordsEN(Math.floor(n / 1000)) + " Thousand" + numberToWordsEN(n % 1000);
    if (n < 1000000000) return numberToWordsEN(Math.floor(n / 1000000)) + " Million" + numberToWordsEN(n % 1000000);
    if (n < 1000000000000) return numberToWordsEN(Math.floor(n / 1000000000)) + " Billion" + numberToWordsEN(n % 1000000000);
    if (n < 1000000000000000) return numberToWordsEN(Math.floor(n / 1000000000000)) + " Trillion" + numberToWordsEN(n % 1000000000000);

    return "Number too large";
}

export function convertNumberToWords(num: number, lang: "id" | "en"): string {
    if (isNaN(num)) return "";
    if (num === 0) return lang === "id" ? "Nol" : "Zero";

    const res = lang === "id" ? numberToWordsID(Math.abs(num)) : numberToWordsEN(Math.abs(num));

    let trimmed = res.trim();
    if (num < 0) {
        trimmed = (lang === "id" ? "Minus " : "Minus ") + trimmed;
    }

    // Capitalize first letter
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
