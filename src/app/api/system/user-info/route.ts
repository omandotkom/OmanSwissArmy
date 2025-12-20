
import { NextResponse } from 'next/server';
import os from 'os';

export const dynamic = 'force-dynamic'; // Always run on server, no caching

export async function GET() {
    try {
        const userInfo = os.userInfo();
        const envDomain = process.env.USERDOMAIN;
        const envUser = process.env.USERNAME || process.env.USER;

        let finalUsername = 'unknown-user';

        // 1. Prioritas Utama: Gabungan Domain + User dari Env (Paling lengkap ala Windows)
        if (envDomain && envUser) {
            finalUsername = `${envDomain}\\${envUser}`;
        }
        // 2. Jika tidak ada domain, pakai os.userInfo via internal module (biasanya reliable)
        else if (userInfo.username) {
            finalUsername = userInfo.username;
        }
        // 3. Terakhir pakai env user biasa
        else if (envUser) {
            finalUsername = envUser;
        }

        return NextResponse.json({ username: finalUsername });
    } catch (error) {
        console.error("❌ [Debug API] Error getting user info:", error);
        return NextResponse.json({ username: 'unknown-err' }, { status: 500 });
    }
}
