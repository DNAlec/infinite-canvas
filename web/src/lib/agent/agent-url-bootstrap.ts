// URL credential bootstrap is disabled in the NekoCloud edition.
export function hasAgentUrlBootstrap(_hash: string) {
    return false;
}

export function readAgentUrlBootstrap(_hash: string): { url: string; token: string; remainingHash: string } | null {
    return null;
}
