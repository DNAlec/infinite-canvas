import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { hasAgentUrlBootstrap, readAgentUrlBootstrap } from "../src/lib/agent/agent-url-bootstrap";

test("NekoCloud title retains original creator attribution", () => {
    expect(readFileSync("index.html", "utf8")).toContain("<title>猫云画布</title>");
    expect(readFileSync("src/components/layout/github-link.tsx", "utf8")).toContain("basketikun");
});

test("agent credential bootstrap cannot import tokens after SPA navigation", () => {
    expect(hasAgentUrlBootstrap("#agentUrl=http://localhost&agentToken=fake")).toBe(false);
    expect(readAgentUrlBootstrap("#agentUrl=http://localhost&agentToken=fake")).toBeNull();
    const source = readFileSync("src/components/agent/local-agent-panel.tsx", "utf8");
    expect(source).not.toContain('searchParams.get("agentToken")');
});

test("entry script strips case-insensitive credential parameters before application imports", () => {
    const html = readFileSync("index.html", "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    let url = new URL("https://canvas.nekocloud.vip/canvas?API_KEY=fake&token=fake&agentToken=fake&baseUrl=https://evil.test&mode=choose#apiKey=fake&access_token=fake&agentUrl=http://localhost&keep=yes");
    runInNewContext(script, {
        location: url,
        history: { state: null, replaceState: (_: unknown, __: string, next: string) => { url = new URL(next, url); } },
        localStorage: { getItem: () => null },
        document: { documentElement: { classList: { toggle() {} }, style: {} } },
    });
    expect(url.search).toBe("?mode=choose");
    expect(url.hash).toBe("#keep=yes");
    const init = readFileSync("src/components/layout/client-root-init.tsx", "utf8");
    expect(init).not.toContain("importChannelCredentials");
});
