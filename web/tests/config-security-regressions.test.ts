import { expect, test } from "bun:test";
import axios from "axios";
import { createJSONStorage } from "zustand/middleware";

const memory = new Map<string, string>();
const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
};
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });
const { CONFIG_STORE_KEY, createNekoPresets, defaultConfig, encodeChannelModel, resolveModelRequestConfig, useConfigStore } = await import("../src/stores/use-config-store");
function saved(state: unknown, version = 0) {
    useConfigStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    memory.set(CONFIG_STORE_KEY, JSON.stringify({ state, version }));
}

test("initial hydration scrubs unremembered keys from storage without any user action", () => {
    const script = `
        const key = ${JSON.stringify(CONFIG_STORE_KEY)};
        const memory = new Map([[key, JSON.stringify({ state: {
            nekoKey: 'fake-old-neko-key',
            config: { apiKey: 'fake-old-flat-key', channels: [{ id: 'custom', name: 'Custom', baseUrl: 'https://custom.test', apiKey: 'fake-old-channel-key', apiFormat: 'openai', models: [] }] }
        }, version: 0 })]]);
        globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) };
        globalThis.window = { localStorage };
        const { useConfigStore } = await import('./src/stores/use-config-store.ts');
        if (!useConfigStore.persist.hasHydrated()) throw new Error('not hydrated');
        console.log(memory.get(key));
    `;
    const result = Bun.spawnSync([process.execPath, "-e", script], { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    const stored = result.stdout.toString();
    expect(stored).not.toContain("fake-old-neko-key");
    expect(stored).not.toContain("fake-old-flat-key");
    expect(stored).not.toContain("fake-old-channel-key");
    expect(JSON.parse(stored).state.rememberApiKeys).toBe(false);
});

function hydrateWithWriteFailure(removeFails: boolean) {
    const script = `
        const key = ${JSON.stringify(CONFIG_STORE_KEY)};
        const original = JSON.stringify({ state: { rememberApiKeys: false,
            nekoKey: 'fake-hydration-neko', config: { apiKey: 'fake-hydration-flat',
                channels: [{ id: 'custom', name: 'Keep custom', baseUrl: 'https://custom.test',
                    apiKey: 'fake-hydration-custom', apiFormat: 'openai', models: [{ name: 'custom-image', capability: 'image' }] }],
                imageModel: 'custom::custom-image' }
        }, version: 0 });
        const memory = new Map([[key, original]]);
        let writes = 0, removes = 0;
        const alerts = [];
        globalThis.localStorage = {
            getItem: k => memory.get(k) ?? null,
            setItem: () => { writes++; throw new DOMException('fake-hydration-neko', 'QuotaExceededError'); },
            removeItem: k => { removes++; if (${removeFails}) throw new Error('fake-hydration-custom'); memory.delete(k); }
        };
        globalThis.window = { localStorage, alert: message => alerts.push(message) };
        const { useConfigStore } = await import('./src/stores/use-config-store.ts');
        const state = useConfigStore.getState();
        console.log(JSON.stringify({ hydrated: useConfigStore.persist.hasHydrated(), writes, removes, alerts,
            stored: memory.has(key), originalUnchanged: memory.get(key) === original,
            nekoKey: state.nekoKey, apiKey: state.config.apiKey, custom: state.config.channels.find(c => c.id === 'custom'),
            imageModel: state.config.imageModel, remember: state.rememberApiKeys }));
    `;
    const result = Bun.spawnSync([process.execPath, "-e", script], { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).not.toContain("fake-hydration-");
    return JSON.parse(result.stdout.toString());
}

test("hydration removes stale credentials if the sanitized storage write fails", () => {
    const result = hydrateWithWriteFailure(false);
    expect(result.stored).toBe(false);
    expect(result.removes).toBe(1);
    expect(result.writes).toBe(1);
    expect(result.hydrated).toBe(true);
    expect(result.remember).toBe(false);
    expect(result.nekoKey).toBe("");
    expect(result.apiKey).toBe("");
    expect(result.custom).toMatchObject({ id: "custom", name: "Keep custom", apiKey: "", baseUrl: "https://custom.test" });
    expect(result.imageModel).toBe("custom::custom-image");
});

test("hydration warns visibly without leaking keys when writing and removing storage both fail", () => {
    const result = hydrateWithWriteFailure(true);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toContain("旧凭据可能仍保留");
    expect(result.alerts[0]).toContain("清除");
    expect(JSON.stringify(result.alerts)).not.toContain("fake-hydration-");
    expect(result.originalUnchanged).toBe(true);
    expect(result.writes).toBe(1);
    expect(result.removes).toBe(1);
    expect(result.hydrated).toBe(true);
    expect(result.nekoKey).toBe("");
    expect(result.apiKey).toBe("");
    expect(result.custom.apiKey).toBe("");
    expect(result.imageModel).toBe("custom::custom-image");
});

test("flat legacy config retains its channel, full model list and selected defaults", async () => {
    for (const remember of [false, true]) {
        saved({ rememberApiKeys: remember, config: { baseUrl: "https://legacy.test/v1", apiKey: "fake-legacy-key", apiFormat: "gemini", models: ["gemini-legacy-image", "legacy-video", "legacy-text", "unused-model"], model: "gemini-legacy-image", imageModel: "gemini-legacy-image", videoModel: "legacy-video", textModel: "legacy-text" } });
        await useConfigStore.persist.rehydrate();
        const config = useConfigStore.getState().config;
        const legacy = config.channels.find(c => !c.nekoPreset);
        expect(legacy).toMatchObject({ id: "default", baseUrl: "https://legacy.test/v1", apiFormat: "gemini", apiKey: remember ? "fake-legacy-key" : "" });
        expect(legacy?.models.map(m => m.name)).toEqual(["gemini-legacy-image", "legacy-video", "legacy-text", "unused-model"]);
        expect(config.model).toBe("default::gemini-legacy-image");
        expect(config.imageModel).toBe("default::gemini-legacy-image");
        expect(config.videoModel).toBe("default::legacy-video");
        expect(config.textModel).toBe("default::legacy-text");
        expect(config.models).toEqual(legacy!.models.map(m => `default::${m.name}`));
        expect(config.channels.filter(c => c.nekoPreset)).toHaveLength(3);
        expect(config.channels.filter(c => c.nekoPreset).every(c => !c.apiKey && !c.models.length)).toBe(true);
        const persisted = JSON.parse(memory.get(CONFIG_STORE_KEY)!).state;
        expect(persisted.config.channels.find((c: { id: string }) => c.id === "default").apiKey).toBe(remember ? "fake-legacy-key" : "");
    }
});

test("custom channel imports cannot forge managed preset membership", async () => {
    const { createModelChannel } = await import("../src/stores/use-config-store");
    const channel = createModelChannel(JSON.parse(JSON.stringify({ id: "imported", name: "Imported", baseUrl: "https://custom.test", apiKey: "fake-import-key", apiFormat: "gemini", nekoPreset: "gpt", models: [{ name: "custom-image", capability: "image" }] })));
    expect(channel.nekoPreset).toBeUndefined();
    useConfigStore.setState({ config: { ...structuredClone(defaultConfig), channels: [channel, ...createNekoPresets()] } });
    useConfigStore.getState().setNekoKey("fake-new-key");
    const config = useConfigStore.getState().config;
    expect(config.channels[0]).toEqual(channel);
    const request = resolveModelRequestConfig(config, "imported::custom-image");
    expect(request.baseUrl).toBe("https://custom.test");
    expect(request.apiKey).toBe("fake-import-key");
    expect(request.apiFormat).toBe("gemini");
});

test("validation rebuilds managed transports even for directly loaded channel objects", async () => {
    useConfigStore.setState({ config: { ...structuredClone(defaultConfig), channels: createNekoPresets().map(c => ({ ...c, id: `untrusted-${c.nekoPreset}`, baseUrl: "https://attacker.invalid", apiFormat: "openai" })) } });
    const previous = axios.defaults.adapter;
    axios.defaults.adapter = async request => ({ data: { data: [{ id: "gpt-image-2" }, { id: "gemini-2.5-flash-image" }, { id: "grok-imagine-image" }] }, status: 200, statusText: "OK", headers: {}, config: request });
    try {
        useConfigStore.getState().setNekoKey("fake-direct-key");
        await useConfigStore.getState().validateNekoKey();
        const config = useConfigStore.getState().config;
        for (const canonical of createNekoPresets()) {
            const channel = config.channels.find(c => c.nekoPreset === canonical.nekoPreset)!;
            const request = resolveModelRequestConfig(config, encodeChannelModel(channel.id, channel.models[0].name));
            expect(request.baseUrl).toBe(canonical.baseUrl);
            expect(request.apiFormat).toBe(canonical.apiFormat);
            expect(channel.id).toBe(canonical.id);
            expect(request.apiKey).toBe("fake-direct-key");
        }
    } finally { axios.defaults.adapter = previous; }
});

test("persisted managed endpoints and identity cannot redirect a validated generation key", async () => {
    const custom = { id: "nekocloud-gpt", name: "Keep custom", baseUrl: "https://custom.test", apiKey: "fake-custom-key", apiFormat: "openai" as const, models: [{ name: "custom-image", capability: "image" as const }] };
    saved({ rememberApiKeys: true, config: { ...defaultConfig, channels: [custom, ...createNekoPresets().map(c => ({ ...c, id: `forged-${c.nekoPreset}`, name: "Forged", baseUrl: "https://attacker.invalid", apiFormat: "openai", models: [{ name: "gpt-image-2", capability: "image", script: "throw 'forged'" }] }))] } });
    await useConfigStore.persist.rehydrate();
    const previous = axios.defaults.adapter;
    const targets: string[] = [];
    axios.defaults.adapter = async request => {
        targets.push(request.url || "");
        return { data: { data: [{ id: "gpt-image-2" }, { id: "gemini-2.5-flash-image" }, { id: "grok-imagine-image" }] }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    try {
        useConfigStore.getState().setNekoKey("fake-shared-key");
        await useConfigStore.getState().validateNekoKey();
        const config = useConfigStore.getState().config;
        expect(useConfigStore.getState().nekoValidation.status).toBe("success");
        expect(config.channels.find(c => !c.nekoPreset)).toEqual(custom);
        for (const canonical of createNekoPresets()) {
            const channel = config.channels.find(c => c.nekoPreset === canonical.nekoPreset)!;
            const request = resolveModelRequestConfig(config, encodeChannelModel(channel.id, channel.models[0].name));
            expect(request.baseUrl).toBe(canonical.baseUrl);
            expect(request.apiFormat).toBe(canonical.apiFormat);
            expect(request.apiKey).toBe("fake-shared-key");
            expect(channel.name).toBe(canonical.name);
            expect(channel.id).toBe(canonical.id === custom.id ? `${canonical.id}-preset` : canonical.id);
            expect(channel.models.every(m => !m.script)).toBe(true);
        }
        expect(new Set(config.channels.map(c => c.id)).size).toBe(config.channels.length);
        expect(targets).toEqual(["https://api.nekocloud.vip/v1/models"]);
    } finally { axios.defaults.adapter = previous; }
});
