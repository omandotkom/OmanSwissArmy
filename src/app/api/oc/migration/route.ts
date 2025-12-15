
import { NextResponse } from 'next/server';
import { OcMigrator } from '@/lib/oc-migrator';

export async function POST(request: Request) {
    const migrator = new OcMigrator();

    // Auth check
    const isLogin = await migrator.checkLogin();
    if (!isLogin) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, namespace, pvcName, targetPvcName, storageClass, deploymentName, volName, podName } = body;

        let result;

        switch (action) {
            case 'FIND_DEPLOYMENT':
                const deps = await migrator.getDeploymentForPvc(namespace, pvcName);
                result = { deployments: deps };
                break;

            case 'PREPARE_DESTINATION':
                // Create new PVC
                // capacity needs to be fetched from old logic or passed. 
                // For simplicity, we assume frontend passes capacity or we fetch it.
                // Let's assume we fetch it if not passed, but safer to pass.
                const { capacity } = body;
                await migrator.createPvc(namespace, targetPvcName, storageClass, capacity);
                result = { message: 'Destination PVC created' };
                break;

            case 'SCALE':
                const { replicas } = body;
                await migrator.scaleDeployment(namespace, deploymentName, replicas);
                result = { message: `Scaled ${deploymentName} to ${replicas}` };
                break;

            case 'START_MIGRATION_POD':
                const migrationPod = podName || `migration-${Date.now()}`;
                await migrator.createMigrationPod(namespace, migrationPod, pvcName, targetPvcName);
                // We don't wait here to avoid timeout on HTTP request? 
                // Or we do? Next.js server actions / API routes have limits. 
                // 'wait' can take 60s. safer to return "Pod Created" and let frontend poll status?
                // But usage of 'oc wait' is efficient. Let's try waiting but with short timeout logic on frontend.
                await migrator.waitForPodReady(namespace, migrationPod);
                result = { message: 'Migration pod running', podName: migrationPod };
                break;

            case 'COPY_DATA':
                await migrator.copyData(namespace, podName);
                result = { message: 'Data copy completed' };
                break;

            case 'CHECK_HPA':
                const hpaName = await migrator.checkHpa(namespace, deploymentName);
                if (hpaName) {
                    throw new Error(`Deployment is managed by HPA '${hpaName}'. Please disable/delete HPA first.`);
                }
                result = { message: 'No HPA detected.' };
                break;

            case 'VERIFY_DATA':
                const { method } = body;
                // method: 'SIZE' | 'CHECKSUM'

                if (method === 'CHECKSUM') {
                    // Checksum/Diff strategy with ignore 'lost+found'
                    try {
                        await migrator.runCommand(['exec', podName, `-n ${namespace}`, '--', 'diff', '-r', '--exclude=lost+found', '/mnt/old', '/mnt/new']);
                        result = { message: 'Verification (Checksum/Diff) Passed: Identical.' };
                    } catch (e) {
                        // We could try to capture the output to see WHAT differs, but for now just fail.
                        throw new Error("Verification Failed: Files differ (excluding lost+found).");
                    }
                } else {
                    // SIZE strategy (Quick) - UPGRADED TO 'NAMING SUBSET' CHECK

                    // Use standard find (without printf) to ensure newlines are generated correctly across all shells
                    const cmdListFiles = (path: string) =>
                        `cd ${path} && find . -type f -not -path "./lost+found*" | sort`;

                    // Fetch raw lists
                    const listOldRaw = await migrator.runCommand(['exec', podName, `-n ${namespace}`, '--', 'sh', '-c', `"${cmdListFiles('/mnt/old')}"`]);
                    const listNewRaw = await migrator.runCommand(['exec', podName, `-n ${namespace}`, '--', 'sh', '-c', `"${cmdListFiles('/mnt/new')}"`]);

                    // Parse outputs, trim lines, remove leading "./"
                    const parseFileList = (raw: string) => {
                        return raw.trim().split(/\r?\n/)
                            .map(line => line.trim())
                            .filter(line => line)
                            .map(line => line.startsWith('./') ? line.substring(2) : line);
                    };

                    const filesOld = parseFileList(listOldRaw);
                    const filesNew = parseFileList(listNewRaw);
                    const setNew = new Set(filesNew);

                    const missingFiles = filesOld.filter(f => !setNew.has(f));

                    if (missingFiles.length > 0) {
                        // Critical Error: Source files are missing in Target
                        const sampleShort = missingFiles.slice(0, 3).join(', ');
                        throw new Error(`Verification Failed: ${missingFiles.length} files missing in target! (e.g. ${sampleShort}...)`);
                    }

                    if (filesOld.length === filesNew.length) {
                        result = { message: `Verification Passed: Perfect Match (${filesOld.length} files).` };
                    } else {
                        // Pass with warning (Target has extra files)
                        const diff = filesNew.length - filesOld.length;
                        result = { message: `Verification Passed: All source files present. Target has ${diff} extra files (residue).` };
                    }
                }
                break;

            case 'SWITCH_VOLUME':
                await migrator.updateDeploymentVolume(namespace, deploymentName, volName, targetPvcName);
                result = { message: 'Deployment volume updated' };
                break;

            case 'CLEANUP_POD':
                await migrator.deleteResource(namespace, 'pod', podName);
                result = { message: 'Migration pod deleted' };
                break;

            case 'DELETE_OLD_PVC':
                await migrator.deleteResource(namespace, 'pvc', pvcName);
                result = { message: 'Old PVC deleted' };
                break;

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Migration API Error:', error);
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}
