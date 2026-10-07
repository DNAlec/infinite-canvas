import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
}, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
const { defaultConfig, buildApiUrl, useConfigStore, CONFIG_STORE_KEY } = await import("../src/stores/use-config-store");

test("fresh configuration uses one NekoCloud OpenAI channel without doubling v1", () => {
    expect(defaultConfig.baseUrl).toBe("https://api.nekocloud.vip");
    expect(defaultConfig.channels).toHaveLength(1);
    expect(defaultConfig.channels[0].name).toBe("猫云");
    expect(defaultConfig.channels[0].apiKey).toBe("");
    for (const base of [defaultConfig.baseUrl, `${defaultConfig.baseUrl}/v1/`]) {
        expect(buildApiUrl(base, "/images/generations")).toBe("https://api.nekocloud.vip/v1/images/generations");
    }
});

test("keys remain in memory unless remembering is explicitly enabled", async () => {
    const store = useConfigStore.getState();
    store.updateConfig("apiKey", "test-only-key");
    store.updateConfig("channels", [{ ...defaultConfig.channels[0], apiKey: "test-channel-key" }]);
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("test-channel-key");
    let saved = JSON.parse(memory.get(CONFIG_STORE_KEY)!).state;
    expect(saved.config.apiKey).toBe("");
    expect(saved.config.channels[0].apiKey).toBe("");
    store.setRememberApiKeys(true);
    saved = JSON.parse(memory.get(CONFIG_STORE_KEY)!).state;
    expect(saved.config.channels[0].apiKey).toBe("test-channel-key");
    store.setRememberApiKeys(false);
    expect(memory.get(CONFIG_STORE_KEY)).not.toContain("test-channel-key");
    memory.set(CONFIG_STORE_KEY, JSON.stringify({ state: { config: { ...defaultConfig, apiKey: "legacy-key", channels: [{ ...defaultConfig.channels[0], apiKey: "legacy-channel" }] } }, version: 0 }));
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().config.apiKey).toBe("");
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("");
});

test("remember option is visible with an unencrypted local-storage warning", async () => {
    const source = readFileSync("src/components/layout/channel-editor-drawer.tsx", "utf8");
    expect(source).toContain("记住 API Key");
    expect(source).toContain("本地非加密");
    expect(source).toContain("setRememberApiKeys");
});

test("custom scripts are rejected at the executor even when called directly", async () => {
    const { runModelPlugin } = await import("../src/services/api/model-plugin");
    (globalThis as any).__scriptExecuted = false;
    await expect(runModelPlugin({ capability: "image", config: defaultConfig, script: "globalThis.__scriptExecuted = true; return [];" })).rejects.toThrow("禁用");
    expect((globalThis as any).__scriptExecuted).toBe(false);
    const source = readFileSync("src/components/layout/channel-editor-drawer.tsx", "utf8");
    expect(source).not.toContain("ModelScriptEditor");
    expect(source).not.toContain("setScriptTarget");
    expect(readFileSync("src/components/layout/model-script-editor.tsx", "utf8")).not.toContain("<Modal");
});

test("standard image generation still uses native OpenAI HTTP rather than template scripts", async () => {
    const axios = (await import("axios")).default;
    const { requestGeneration } = await import("../src/services/api/image");
    const previous = axios.defaults.adapter;
    let target = "";
    axios.defaults.adapter = async (request) => {
        target = request.url || "";
        return { data: { data: [{ b64_json: "dGVzdA==" }] }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    try {
        const images = await requestGeneration({ ...defaultConfig, count: "1" }, "test prompt");
        expect(target).toBe("https://api.nekocloud.vip/v1/images/generations");
        expect(images[0].dataUrl).toContain("dGVzdA==");
    } finally { axios.defaults.adapter = previous; }
});
