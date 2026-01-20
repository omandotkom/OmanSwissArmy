import { NextRequest, NextResponse } from 'next/server';
import { LdapClient, LdapEntry } from '@/lib/ldap-client';

export async function POST(req: NextRequest) {
    let client: LdapClient | null = null;

    try {
        const body = await req.json();
        const { url, username, password, baseDN, scope = 'one', filter = '(objectClass=*)' } = body;

        if (!url || !username || !password || !baseDN) {
            return NextResponse.json(
                { error: 'Missing required parameters: url, username, password, baseDN' },
                { status: 400 }
            );
        }

        client = new LdapClient({
            url,
            bindDN: username,
            bindCredentials: password
        });

        await client.bind(username, password);

        // Common attributes to retrieve to keep payload light
        // 'dn' is always returned
        const attributesToFetch = [
            'sAMAccountName',
            'name',
            'objectClass',
            'distinguishedName',
            'description',
            'mail',
            'ou',
            'cn',
            'lockoutTime',
            'badPwdCount',
            'badPasswordTime',
            'userAccountControl',
            'pwdLastSet',
            'whenChanged'
        ];

        const entries = await client.search(baseDN, {
            scope: scope,
            filter: filter,
            attributes: attributesToFetch,
            sizeLimit: 1000 // Safety limit
        });

        // Sort entries: Containers/OUs first, then others
        entries.sort((a, b) => {
            const isContainerA = isContainer(a);
            const isContainerB = isContainer(b);
            if (isContainerA && !isContainerB) return -1;
            if (!isContainerA && isContainerB) return 1;
            return (a.attributes.name || '').localeCompare(b.attributes.name || '');
        });

        // Transform entries for easier frontend consumption
        const result = entries.map(entry => ({
            dn: entry.dn,
            name: entry.attributes.name || entry.attributes.cn || entry.attributes.ou || 'Unknown',
            type: getEntryType(entry),
            isContainer: isContainer(entry),
            attributes: entry.attributes
        }));

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        console.error('LDAP Error:', error);
        return NextResponse.json(
            { error: error.message || 'An unexpected error occurred during LDAP operation' },
            { status: 500 }
        );
    } finally {
        if (client) {
            try {
                client.unbind();
            } catch (e) {
                // ignore
            }
        }
    }
}

function isContainer(entry: LdapEntry): boolean {
    const objectClass = entry.attributes.objectClass;
    if (Array.isArray(objectClass)) {
        return objectClass.includes('container') ||
            objectClass.includes('organizationalUnit') ||
            objectClass.includes('domainDNS');
    }
    return objectClass === 'container' || objectClass === 'organizationalUnit' || objectClass === 'domainDNS';
}

function getEntryType(entry: LdapEntry): string {
    const objectClass = entry.attributes.objectClass;
    const classes = Array.isArray(objectClass) ? objectClass : [objectClass];

    if (classes.includes('user')) return 'User';
    if (classes.includes('group')) return 'Group';
    if (classes.includes('organizationalUnit')) return 'OU';
    if (classes.includes('container')) return 'Container';
    if (classes.includes('computer')) return 'Computer';
    if (classes.includes('volume')) return 'Volume';

    return 'Object';
}
