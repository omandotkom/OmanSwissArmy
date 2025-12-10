import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function POST(request: NextRequest) {
    const { command } = await request.json();

    if (!command) {
        return NextResponse.json({ error: 'Command login diperlukan' }, { status: 400 });
    }

    // Validasi keamanan sederhana: Pastikan command diawali dengan "oc login"
    const cleanCmd = command.trim();
    if (!cleanCmd.startsWith('oc login')) {
        return NextResponse.json({ error: 'Hanya menerima perintah "oc login ..."' }, { status: 400 });
    }

    // Parsing argumen untuk keamanan ekstra, kita hanya ambil argumen setelah "oc login"
    // dan passing ke runCommand sebagai array.
    // Tapi karena oc login butuh flag --token dan --server, parsing manual agak tricky dengan spasi.
    // Untuk versi aman MVP, kita percayakan pada child_process exec tapi kita strip "oc login" didepannya.

    // Hapus "oc login" dari string untuk mendapatkan args
    const argsString = cleanCmd.replace(/^oc login\s+/, '');

    // Split berdasarkan spasi, tapi hati-hati user mungkin copy paste multiple spaces
    // Note: Ini split sederhana, tidak menghandle quoted string dengan spasi didalamnya
    // Tapi token dan server url biasanya tidak berspasi.
    const args = argsString.split(/\s+/);

    const client = new OcClient();

    try {
        // Kita tambahkan 'login' kembali sebagai argument pertama
        const result = await client.runCommand(['login', ...args]);
        return NextResponse.json({ message: 'Login berhasil', output: result });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Login gagal' }, { status: 401 });
    }
}
