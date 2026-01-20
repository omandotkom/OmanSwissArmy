import ldap from 'ldapjs';

export interface LdapConfig {
    url: string;
    bindDN: string;
    bindCredentials: string;
}

export interface LdapEntry {
    dn: string;
    attributes: Record<string, any>;
}

export class LdapClient {
    private client: ldap.Client;

    constructor(config: LdapConfig) {
        this.client = ldap.createClient({
            url: config.url,
            tlsOptions: { rejectUnauthorized: false }, // Often needed for strict AD envs
        });
    }

    async bind(dn: string, password: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.bind(dn, password, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async search(base: string, options: ldap.SearchOptions): Promise<LdapEntry[]> {
        return new Promise((resolve, reject) => {
            this.client.search(base, options, (err, res) => {
                if (err) {
                    reject(err);
                    return;
                }

                const entries: LdapEntry[] = [];

                res.on('searchEntry', (entry) => {
                    const attributes: Record<string, any> = {};

                    entry.attributes.forEach((attr) => {
                        // Handle buffers (LDAP often returns buffers)
                        // Typings might say string | string[], but runtime is usually Array
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rawVals: any = attr.vals;
                        const valsArray = Array.isArray(rawVals) ? rawVals : [rawVals];

                        const values = valsArray.map((v: any) => {
                            if (Buffer.isBuffer(v)) {
                                // Check for specific binary attributes that need special formatting
                                const type = attr.type.toLowerCase();
                                if (type === 'objectguid' || type === 'objectsid' || type === 'jpegphoto' || type === 'thumbnailphoto') {
                                    return `0x${v.toString('hex')}`;
                                }
                                // Try to see if it looks like a string
                                const str = v.toString('utf-8');
                                // Simple heuristic: if it has many non-printable chars, keep as hex
                                // eslint-disable-next-line no-control-regex
                                if (/[\x00-\x08\x0E-\x1F]/.test(str)) {
                                    return `0x${v.toString('hex')}`;
                                }
                                return str;
                            }
                            return v;
                        });

                        attributes[attr.type] = values;

                        // Simplification for single values
                        if (attributes[attr.type].length === 1) {
                            attributes[attr.type] = attributes[attr.type][0];
                        }
                    });
                    entries.push({
                        dn: entry.objectName ? entry.objectName.toString() : '',
                        attributes: attributes,
                    });
                });

                res.on('searchReference', (referral) => {
                    // console.log('referral: ' + referral.uris.join());
                });

                res.on('error', (err) => {
                    if (err.name === 'SizeLimitExceededError') {
                        console.warn('LDAP Search hit size limit, returning partial found entries.');
                        resolve(entries);
                    } else {
                        reject(err);
                    }
                });

                res.on('end', (result) => {
                    // Status 0 = Success, Status 4 = SizeLimitExceeded
                    if (result && result.status !== 0 && result.status !== 4) {
                        reject(new Error(`LDAP search failed with status: ${result.status}`));
                    } else {
                        resolve(entries);
                    }
                });
            });
        });
    }

    unbind(): void {
        this.client.unbind((err) => {
            // ignore unbind errors
        });
    }
}
