
export const parseScheduleToIndonesian = (interval: string): string => {
    if (!interval) return "-";

    // Basic cleaning
    let clean = interval.toUpperCase();

    // Map keywords
    const FREQ_MAP: { [key: string]: string } = {
        'DAILY': 'Setiap hari',
        'WEEKLY': 'Setiap minggu',
        'MONTHLY': 'Setiap bulan',
        'YEARLY': 'Setiap tahun',
        'HOURLY': 'Setiap jam',
        'MINUTELY': 'Setiap menit',
        'SECONDLY': 'Setiap detik'
    };

    const DAY_MAP: { [key: string]: string } = {
        'MON': 'Senin', 'TUE': 'Selasa', 'WED': 'Rabu', 'THU': 'Kamis',
        'FRI': 'Jumat', 'SAT': 'Sabtu', 'SUN': 'Minggu'
    };

    const MONTH_MAP: { [key: string]: string } = {
        'JAN': 'Januari', 'FEB': 'Februari', 'MAR': 'Maret', 'APR': 'April',
        'MAY': 'Mei', 'JUN': 'Juni', 'JUL': 'Juli', 'AUG': 'Agustus',
        'SEP': 'September', 'OCT': 'Oktober', 'NOV': 'November', 'DEC': 'Desember'
    };

    let result = "";

    // Parse FREQ
    const freqMatch = clean.match(/FREQ=([^;]+)/);
    const freq = freqMatch ? freqMatch[1] : "";
    if (freq && FREQ_MAP[freq]) {
        result += FREQ_MAP[freq];
    } else if (clean.includes("SYSDATE")) {
        return "Jalan sekali saat execute (One-time)";
    } else {
        // Fallback for complex unknown
        return interval;
    }

    // Parse INTERVAL (e.g., FREQ=HOURLY;INTERVAL=2 -> Setiap 2 jam)
    const intervalMatch = clean.match(/INTERVAL=(\d+)/);
    if (intervalMatch && intervalMatch[1] !== "1") {
        const intVal = intervalMatch[1];
        // Adjust phrasing 
        result = result.replace("Setiap ", `Setiap ${intVal} `);
    }

    // Parse BYDAY
    const byDayMatch = clean.match(/BYDAY=([^;]+)/);
    if (byDayMatch) {
        const days = byDayMatch[1].split(',').map(d => {
            // Handle numbered days like 1MON (1st Monday) - keeping it simple for now
            const dayCode = d.replace(/[0-9+-]/g, '');
            return DAY_MAP[dayCode] || d;
        });
        result += ` pada hari ${days.join(', ')}`;
    }

    // Parse BYHOUR
    const byHourMatch = clean.match(/BYHOUR=([^;]+)/);
    if (byHourMatch) {
        result += ` jam ${byHourMatch[1]}`;
    }

    // Parse BYMINUTE
    const byMinuteMatch = clean.match(/BYMINUTE=([^;]+)/);
    if (byMinuteMatch) {
        // If "Setiap jam" or "Setiap menit", phrasing might be weird "Setiap jam menit 30" -> "Setiap jam pada menit 30"
        if (result.includes("hari") || result.includes("minggu") || result.includes("bulan")) {
            result += ` lewat ${byMinuteMatch[1]} menit`;
        } else {
            result += ` pada menit ${byMinuteMatch[1]}`;
        }
    }

    return result;
};
