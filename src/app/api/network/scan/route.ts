
import { NextRequest, NextResponse } from 'next/server';
import net from 'net';

export async function POST(req: NextRequest) {
    try {
        const { target, ports } = await req.json();

        if (!target) {
            return NextResponse.json({ error: "Target IP/Hostname is required" }, { status: 400 });
        }

        // Port list standar jika user tidak specify
        const portsToScan = ports || [
            21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445,
            993, 995, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017
        ];

        const results = await scanPorts(target, portsToScan);

        return NextResponse.json({
            target,
            scanned_count: portsToScan.length,
            results
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function scanPorts(host: string, ports: number[]) {
    const promises = ports.map(port => checkPort(host, port));
    // Jalankan parallel
    return await Promise.all(promises);
}

function checkPort(host: string, port: number): Promise<{ port: number, status: 'open' | 'closed', service?: string }> {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        // Timeout pendek agar scanning cepat
        socket.setTimeout(2000);

        socket.on('connect', () => {
            socket.destroy();
            resolve({ port, status: 'open', service: getServiceName(port) });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ port, status: 'closed' });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({ port, status: 'closed' });
        });

        socket.connect(port, host);
    });
}

function getServiceName(port: number): string {
    const services: Record<number, string> = {
        21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
        80: 'HTTP', 110: 'POP3', 135: 'RPC', 139: 'NetBIOS', 143: 'IMAP',
        443: 'HTTPS', 445: 'SMB', 1433: 'SQL Server', 3306: 'MySQL',
        3389: 'RDP', 5432: 'PostgreSQL', 6379: 'Redis', 8080: 'HTTP-Proxy',
        27017: 'MongoDB'
    };
    return services[port] || 'Unknown';
}
