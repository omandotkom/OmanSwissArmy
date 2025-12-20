
// Web Worker for Auto-Mapping Connections
// Runs heavy heuristics off the main thread

/* eslint-disable no-restricted-globals */

export { };

// Define types locally since we can't easily import from main app in a purely isolated worker without setup
// Simplified types for the worker
type WorkerOracleConnection = {
    id: string;
    name: string;
    username: string;
    host: string;
};

type AutoMappingRequest = {
    owners: string[];
    connections: WorkerOracleConnection[];
    env1Keyword: string;
    env2Keyword: string;
};

type MappingResult = {
    [ownerName: string]: {
        env1: WorkerOracleConnection | null;
        env2: WorkerOracleConnection | null;
    }
};

const findBestMatches = (owner: string, connections: WorkerOracleConnection[], preferredKeyword: string = "") => {
    const candidates = connections.filter(c => {
        const cName = c.name.toUpperCase();
        const cUser = c.username.toUpperCase();
        const oName = owner.toUpperCase();

        if (cUser === oName) return true;
        if (cUser.includes(oName)) return true;
        if (cName.includes(oName)) return true;

        return false;
    });

    return candidates.sort((a, b) => {
        const oName = owner.toUpperCase();
        const keyword = preferredKeyword.toUpperCase().trim();

        let scoreA = (a.username.toUpperCase() === oName ? 100 : 0) +
            (a.username.toUpperCase().includes(oName) ? 50 : 0) +
            (a.name.toUpperCase().includes(oName) ? 20 : 0);

        let scoreB = (b.username.toUpperCase() === oName ? 100 : 0) +
            (b.username.toUpperCase().includes(oName) ? 50 : 0) +
            (b.name.toUpperCase().includes(oName) ? 20 : 0);

        if (keyword) {
            if (a.name.toUpperCase().includes(keyword) || a.host.toUpperCase().includes(keyword)) scoreA += 500;
            if (b.name.toUpperCase().includes(keyword) || b.host.toUpperCase().includes(keyword)) scoreB += 500;
        }

        return scoreB - scoreA;
    });
};

self.onmessage = (e: MessageEvent<AutoMappingRequest>) => {
    const { owners, connections, env1Keyword, env2Keyword } = e.data;
    const result: MappingResult = {};

    owners.forEach(owner => {
        // Find match for Env 1
        const matches1 = findBestMatches(owner, connections, env1Keyword);
        const top1 = matches1.length > 0 ? matches1[0] : null;

        // Find match for Env 2
        const matches2 = findBestMatches(owner, connections, env2Keyword);
        let top2 = null;

        if (matches2.length > 0) {
            if (matches2[0].id !== top1?.id) {
                top2 = matches2[0];
            } else if (matches2.length > 1) {
                top2 = matches2[1];
            }
        }

        result[owner] = { env1: top1, env2: top2 };
    });

    self.postMessage(result);
};
