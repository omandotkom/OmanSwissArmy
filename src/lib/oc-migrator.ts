
import { OcClient } from './oc-helper';

export class OcMigrator extends OcClient {

  async createPvc(namespace: string, pvcName: string, storageClass: string, size: string, accessMode: string = 'ReadWriteMany') {
    const yaml = `
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: ${pvcName}
  namespace: ${namespace}
spec:
  storageClassName: ${storageClass}
  accessModes:
    - ${accessMode}
  volumeMode: Filesystem
  resources:
    requests:
      storage: ${size}
`;
    const cmd = `echo "${yaml.replace(/"/g, '\\"')}" | oc apply -f -`;
    // Note: echo with newlines in windows ps might be tricky, better to use apply accepting stdin or writing a temp file.
    // But OcClient.runCommand executes in a shell.
    // Let's rely on standard piping if possible, or use a safer approach for Windows.
    // Since the user is on Windows, piping multi-line strings in PowerShell is ... interesting.
    // A safer bet is to use `oc create pvc` if arguments allow, but YAML is more flexible.
    // Let's try to construct a one-liner or use `oc create` where possible.
    // Actually, `oc create pvc` isn't a standard command in older versions.
    // Best approach for cross-platform (if using node's exec):
    // Write to temp file, apply, delete temp file.

    // However, for this environment, let's assume we can use a simpler approach or `oc process`. 
    // Let's implement a 'applyYaml' method in base or here.
    return this.applyYaml(yaml);
  }

  async applyYaml(yamlContent: string) {
    // We will encode base64 to avoid shell escaping hell
    const b64 = Buffer.from(yamlContent).toString('base64');
    const cmd = ['create', '-f', '-'];
    // In windows powershell: 
    // echo <b64> | base64 -d | oc apply -f -
    // But we are in node. 
    // We can just spawn the process and write to stdin?
    // The current OcClient uses `exec`. It doesn't support stdin easily.
    // I will assume for now I can pass it via a specific command or I need to improve OcClient to support stdin.

    // Simpler: Use printf/echo one liner if content is small.
    // "echo ... | oc apply -f -"

    // Let's stick to the strategy of writing a temporary file if possible, 
    // BUT, I don't want to manage temp files if I can avoid it.

    // Let's use `create` where possible?
    // No, `create pvc` is limited.

    // Let's try to update `runCommand` to support input? No, that's editing existing code.
    // I'll stick to a command line "echo" with basic escaping.
    // On Windows Powershell, `echo "..." | oc apply -f -` works if newlines are correct.

    // Actually, I'll just write a helper to write the file to the temp dir.
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempPath = path.join(os.tmpdir(), `pvc-migrator-${Date.now()}.yaml`);
    fs.writeFileSync(tempPath, yamlContent);

    try {
      const res = await this.runCommand(['apply', '-f', tempPath]);
      fs.unlinkSync(tempPath);
      return res;
    } catch (e) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw e;
    }
  }

  async scaleDeployment(namespace: string, deploymentName: string, replicas: number) {
    return this.runCommand(['scale', 'deployment', deploymentName, `-n ${namespace}`, `--replicas=${replicas}`]);
  }

  async createMigrationPod(namespace: string, podName: string, oldPvc: string, newPvc: string) {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${namespace}
spec:
  containers:
    - name: migration
      image: registry.redhat.io/rhel8/support-tools:latest
      # Fallback image if local restriction: alpine (but needs ensuring rsync installed or use cp)
      # Let's stick to the one in guide or user input.
      command: ["/bin/sleep", "infinity"]
      volumeMounts:
        - name: old-vol
          mountPath: /mnt/old
        - name: new-vol
          mountPath: /mnt/new
  volumes:
    - name: old-vol
      persistentVolumeClaim:
        claimName: ${oldPvc}
    - name: new-vol
      persistentVolumeClaim:
        claimName: ${newPvc}
  restartPolicy: Never
`;
    return this.applyYaml(yaml);
  }

  async waitForPodReady(namespace: string, podName: string) {
    // oc wait --for=condition=Ready pod/podName --timeout=60s
    return this.runCommand(['wait', '--for=condition=Ready', `pod/${podName}`, `-n ${namespace}`, '--timeout=120s']);
  }

  async copyData(namespace: string, podName: string) {
    // Use cp -r which is universally compatible and less strict about root metadata
    return this.runCommand(['exec', podName, `-n ${namespace}`, '--', 'cp', '-r', '/mnt/old/.', '/mnt/new/']);
  }

  async updateDeploymentVolume(namespace: string, deploymentName: string, volName: string, newClaimName: string) {
    return this.runCommand([
      'set', 'volume', `deployment/${deploymentName}`,
      `-n ${namespace}`,
      '--add',
      `--name=${volName}`,
      `--claim-name=${newClaimName}`,
      '--overwrite'
    ]);
  }

  async deleteResource(namespace: string, kind: string, name: string) {
    return this.runCommand(['delete', kind, name, `-n ${namespace}`, '--ignore-not-found']);
  }

  async getDeploymentForPvc(namespace: string, pvcName: string) {
    // Logic: Get all deployments, check volumes.
    const cmd = `get deployments -n ${namespace} -o json`;
    const output = await this.runCommand(cmd.split(' '));
    const deployments = JSON.parse(output).items;

    const results: { deploymentName: string, volumeName: string }[] = [];

    deployments.forEach((d: any) => {
      const vol = d.spec.template.spec.volumes?.find((v: any) => v.persistentVolumeClaim?.claimName === pvcName);
      if (vol) {
        results.push({
          deploymentName: d.metadata.name,
          volumeName: vol.name // This is what we need!
        });
      }
    });

    return results;
  }

  async checkHpa(namespace: string, deploymentName: string) {
    // oc get hpa -n namespace -o json
    // Filter if any hpa points to deploymentName
    try {
      const hpaJson = await this.runCommand(['get', 'hpa', `-n ${namespace}`, '-o json']);
      const hpas = JSON.parse(hpaJson).items || [];

      const found = hpas.find((h: any) =>
        h.spec.scaleTargetRef.kind === 'Deployment' &&
        h.spec.scaleTargetRef.name === deploymentName
      );

      return found ? found.metadata.name : null;
    } catch (e) {
      // If no HPA resource or permission error, assume no HPA?
      // Usually empty list if no hpas.
      return null;
    }
  }
}
