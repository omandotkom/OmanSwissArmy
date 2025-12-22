import { NextRequest, NextResponse } from 'next/server';
import tls from 'tls';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { host, port = 443 } = body;

        if (!host) {
            return NextResponse.json({ error: 'Host is required' }, { status: 400 });
        }

        // Sanitize Host (remove https://, http://, and paths)
        let cleanHost = host;
        try {
            if (host.startsWith('http://') || host.startsWith('https://')) {
                const urlObj = new URL(host);
                cleanHost = urlObj.hostname;
            }
        } catch (e) {
            // If URL parsing fails, assume raw hostname and proceed
            cleanHost = host.replace(/https?:\/\//, '').split('/')[0];
        }

        const result = await new Promise((resolve, reject) => {
            const socket = tls.connect({
                host: cleanHost,
                port: Number(port),
                rejectUnauthorized: false, // Allow self-signed/expired checks
                servername: cleanHost
            }, () => {
                const cert = socket.getPeerCertificate(true); // Get full chain info if available

                if (cert && cert.raw) {
                    // Convert raw DER to PEM format
                    const rawBase64 = cert.raw.toString('base64');
                    const pemLines = rawBase64.match(/.{1,64}/g)?.join('\n');
                    const pem = `-----BEGIN CERTIFICATE-----\n${pemLines}\n-----END CERTIFICATE-----`;

                    resolve({
                        success: true,
                        pem: pem,
                        details: {
                            subject: cert.subject,
                            issuer: cert.issuer,
                            valid_from: cert.valid_from,
                            valid_to: cert.valid_to,
                            fingerprint: cert.fingerprint,
                            fingerprint256: cert.fingerprint256,
                            serialNumber: cert.serialNumber
                        }
                    });
                } else {
                    reject(new Error('No certificate received from server'));
                }
                socket.end();
            });

            socket.on('error', (err) => {
                reject(err);
            });

            socket.setTimeout(10000, () => {
                socket.destroy();
                reject(new Error('Connection timed out'));
            });
        });

        return NextResponse.json(result);

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message || 'Unknown error occurred'
        }, { status: 500 });
    }
}
