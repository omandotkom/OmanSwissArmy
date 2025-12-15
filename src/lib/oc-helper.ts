import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class OcClient {
    private binPath: string;

    constructor() {
        this.binPath = path.join(process.cwd(), 'bin', 'oc.exe');
    }

    async runCommand(args: string[]): Promise<string> {
        const command = `"${this.binPath}" ${args.join(' ')}`;
        console.log(`Executing: ${command}`);

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr && !stdout) {
                console.warn('OC Stderr:', stderr);
            }
            return stdout.trim();
        } catch (error: any) {
            console.error('OC Execution Error:', error);
            throw new Error(error.message || 'Failed to execute OC command');
        }
    }

    async checkLogin(): Promise<boolean> {
        try {
            await this.runCommand(['whoami']);
            return true;
        } catch (e) {
            return false;
        }
    }

    async getProjects(): Promise<string[]> {
        const output = await this.runCommand(['get', 'projects', '-o', 'jsonpath="{.items[*].metadata.name}"']);
        return output.split(' ').filter(Boolean);
    }

    async getPods(namespace: string): Promise<PodInfo[]> {
        try {
            // Fetch Pods and PVCs in parallel to enrich data
            const [podsOutput, pvcOutput] = await Promise.all([
                this.runCommand(['get', 'pods', '-n', namespace, '-o', 'json']),
                this.runCommand(['get', 'pvc', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }') // Fallback if pvc fails
            ]);

            const data = JSON.parse(podsOutput);
            const pvcData = JSON.parse(pvcOutput);

            // Map PVC Name -> Details
            const pvcMap = new Map<string, { storageClass: string, capacity: string }>();
            if (pvcData.items) {
                pvcData.items.forEach((p: any) => {
                    pvcMap.set(p.metadata.name, {
                        storageClass: p.spec?.storageClassName || 'Standard', // Default if undefined
                        capacity: p.status?.capacity?.storage
                    });
                });
            }

            return data.items.map((item: any) => {
                const mounts: VolumeMount[] = [];

                // First map volumes to claimNames
                const volumeClaims = new Map<string, string>();
                item.spec.volumes?.forEach((v: any) => {
                    if (v.persistentVolumeClaim?.claimName) {
                        volumeClaims.set(v.name, v.persistentVolumeClaim.claimName);
                    }
                });

                // Collect mounts from all containers
                item.spec.containers?.forEach((c: any) => {
                    c.volumeMounts?.forEach((vm: any) => {
                        if (!vm.mountPath.includes('/var/run/secrets/kubernetes.io')) {
                            const claimName = volumeClaims.get(vm.name);
                            const pvcDetails = claimName ? pvcMap.get(claimName) : undefined;

                            mounts.push({
                                name: vm.name,
                                mountPath: vm.mountPath,
                                claimName: claimName,
                                storageClass: pvcDetails?.storageClass
                            });
                        }
                    });
                });

                return {
                    name: item.metadata.name,
                    status: item.status.phase,
                    mounts
                };
            });
        } catch (e) {
            console.error("Error parsing pods json", e);
            return [];
        }
    }

    async getPvcDetails(namespace: string, pvcName: string): Promise<PvcInfo | null> {
        try {
            const output = await this.runCommand(['get', 'pvc', pvcName, '-n', namespace, '-o', 'json']);
            const pvc = JSON.parse(output);
            return {
                name: pvc.metadata.name,
                status: pvc.status.phase,
                capacity: pvc.status.capacity?.storage,
                storageClass: pvc.spec.storageClassName,
                accessModes: pvc.spec.accessModes
            };
        } catch (e) {
            console.error('Error fetching PVC details:', e);
            return null;
        }
    }

    async listFiles(namespace: string, podName: string, remotePath: string): Promise<FileItem[]> {
        // Use standard ls -la to be compatible with Alpine/BusyBox
        const cmd = ['exec', podName, '-n', namespace, '--', 'ls', '-la', remotePath];

        try {
            const output = await this.runCommand(cmd);
            return this.parseLsOutput(output);
        } catch (error: any) {
            throw error;
        }
    }

    private parseLsOutput(output: string): FileItem[] {
        const lines = output.split('\n');
        const files: FileItem[] = [];
        const startIndex = lines[0]?.startsWith('total') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle potential error messages in output
            if (line.startsWith('ls:')) continue;

            const parts = line.split(/\s+/);
            if (parts.length < 9) continue; // Need at least 9 parts for standard ls -l

            const permissions = parts[0];
            const sizeIndex = 4;

            // Standard ls -l: [Perms Links Owner Group Size Month Day Time/Year Name...]
            // Date parts are at 5, 6, 7. Name starts at 8.
            const dateStr = `${parts[5]} ${parts[6]} ${parts[7]}`;
            const nameIndex = 8;

            const isDirectory = permissions.startsWith('d');
            const name = parts.slice(nameIndex).join(' ');

            if (name === '.' || name === '..') continue;

            files.push({
                name,
                isDirectory,
                size: parts[sizeIndex],
                lastModified: dateStr,
                permissions
            });
        }

        return files;
    }

    async readFileBinary(namespace: string, podName: string, remotePath: string): Promise<Buffer> {
        const command = `"${this.binPath}" exec ${podName} -n ${namespace} -- cat "${remotePath}"`;

        return new Promise((resolve, reject) => {
            exec(command, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('Read File Error:', stderr.toString() || error.message);
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }

    async findPodsByStorageClass(storageClassName: string): Promise<SearchResult[]> {
        try {
            // Strategy change: Iterate known projects to ensure permission consistency.
            // Using 'oc get pvc -A' might fail or return empty if user is not cluster-admin.
            const projects = await this.getProjects();
            const results: SearchResult[] = [];

            // Process namespaces in parallel
            await Promise.all(projects.map(async (ns) => {
                try {
                    // 1. Get PVCs in this namespace
                    const pvcOut = await this.runCommand(['get', 'pvc', '-n', ns, '-o', 'json']);

                    // Handle empty or invalid json output
                    if (!pvcOut.startsWith('{')) return;

                    const pvcData = JSON.parse(pvcOut);
                    const matchingClaims = new Set<string>();

                    pvcData.items?.forEach((pvc: any) => {
                        if (pvc.spec?.storageClassName === storageClassName) {
                            matchingClaims.add(pvc.metadata.name);
                        }
                    });

                    if (matchingClaims.size === 0) return;

                    // 2. Get Pods in this namespace to confirm usage
                    const podsOut = await this.runCommand(['get', 'pods', '-n', ns, '-o', 'json']);
                    const podsData = JSON.parse(podsOut);

                    podsData.items?.forEach((pod: any) => {
                        pod.spec.volumes?.forEach((v: any) => {
                            const claimName = v.persistentVolumeClaim?.claimName;
                            if (claimName && matchingClaims.has(claimName)) {
                                results.push({
                                    namespace: ns,
                                    podName: pod.metadata.name,
                                    pvcName: claimName,
                                    status: pod.status.phase,
                                    storageClass: storageClassName
                                });
                            }
                        });
                    });

                } catch (e) {
                    // Ignore errors in individual namespaces (e.g. terminating or access denied)
                }
            }));

            return results;

        } catch (e) {
            console.error("Error finding pods by sc", e);
            throw new Error("Failed to search pods");
        }
    }
    async findPodsByStorageClassInNamespace(namespace: string, storageClassName: string): Promise<SearchResult[]> {
        try {
            const results: SearchResult[] = [];

            // 1. Get PVCs in this namespace
            const pvcOut = await this.runCommand(['get', 'pvc', '-n', namespace, '-o', 'json']);
            if (!pvcOut.startsWith('{')) return [];

            const pvcData = JSON.parse(pvcOut);
            const matchingClaims = new Set<string>();

            pvcData.items?.forEach((pvc: any) => {
                if (pvc.spec?.storageClassName === storageClassName) {
                    matchingClaims.add(pvc.metadata.name);
                }
            });

            if (matchingClaims.size === 0) return [];

            // 2. Get Pods
            const podsOut = await this.runCommand(['get', 'pods', '-n', namespace, '-o', 'json']);
            const podsData = JSON.parse(podsOut);

            podsData.items?.forEach((pod: any) => {
                pod.spec.volumes?.forEach((v: any) => {
                    const claimName = v.persistentVolumeClaim?.claimName;
                    if (claimName && matchingClaims.has(claimName)) {
                        results.push({
                            namespace: namespace,
                            podName: pod.metadata.name,
                            pvcName: claimName,
                            status: pod.status.phase,
                            storageClass: storageClassName
                        });
                    }
                });
            });

            return results;
        } catch (e) {
            console.warn(`Search failed in ${namespace}`, e);
            return [];
        }
    }
    async createDebugPod(namespace: string, podName: string, pvcName: string, durationSeconds: number = 600) {
        const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${namespace}
  labels:
    app: pvc-debug-inspector
spec:
  containers:
    - name: debugger
      image: alpine:latest
      # Auto-terminate after duration (Time-Bomb Strategy)
      command: ["/bin/sh", "-c", "sleep ${durationSeconds}"] 
      volumeMounts:
        - name: target-pvc
          mountPath: /mnt/data
  volumes:
    - name: target-pvc
      persistentVolumeClaim:
        claimName: ${pvcName}
  restartPolicy: Never
`;

        // Write to temp file and apply
        const fs = require('fs');
        const os = require('os');
        const tempPath = path.join(os.tmpdir(), `debug-pod-${Date.now()}.yaml`);
        fs.writeFileSync(tempPath, yaml);

        try {
            await this.runCommand(['apply', '-f', tempPath]);
            fs.unlinkSync(tempPath);
        } catch (e) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            throw e;
        }
    }
}

export interface SearchResult {
    namespace: string;
    podName: string;
    pvcName: string;
    status: string;
    storageClass: string;
}

export interface FileItem {
    name: string;
    isDirectory: boolean;
    size: string;
    lastModified: string;
    permissions: string;
}

export interface VolumeMount {
    name: string;
    mountPath: string;
    claimName?: string;
    storageClass?: string;
}

export interface PvcInfo {
    name: string;
    status: string;
    capacity: string;
    storageClass: string;
    accessModes: string[];
}

export interface PodInfo {
    name: string;
    status: string;
    mounts: VolumeMount[];
}
