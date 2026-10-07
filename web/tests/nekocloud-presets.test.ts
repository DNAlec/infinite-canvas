import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) }, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
const { defaultConfig, useConfigStore, CONFIG_STORE_KEY } = await import("../src/stores/use-config-store");
const { createJSONStorage } = await import("zustand/middleware");
useConfigStore.persist.setOptions({ storage: createJSONStorage(() => localStorage) });
test("fresh drawing presets have both protocols but no unverified selectable models", () => {
    expect(defaultConfig.channels.map(c => c.apiFormat)).toEqual(["openai", "gemini"]);
    expect(defaultConfig.channels.map(c => c.name)).toEqual(["猫云 GPT 绘图", "猫云 Gemini 绘图"]);
    expect(defaultConfig.channels.every(c => c.baseUrl === "https://api.nekocloud.vip" && !c.apiKey && c.models.length === 0)).toBe(true);
    expect(defaultConfig.models).toEqual([]);
    expect(defaultConfig.imageModel).toBe("");
});
test("validate once applies only allowed drawing models with a shared session key", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    const requests: any[] = [];
    axios.defaults.adapter = async (request) => { requests.push(request); return { data: { data: [{ id: "gpt-image-2.5-flare" }, { id: "gemini-3.1-flash-lite-image" }, { id: "gpt-5.5" }] }, status: 200, statusText: "OK", headers: {}, config: request }; };
    try {
        useConfigStore.setState({ config: structuredClone(defaultConfig), rememberApiKeys: false });
        const store = useConfigStore.getState();
        store.setNekoKey("test-shared-key");
        expect(useConfigStore.getState().config.models).toEqual([]);
        await store.validateNekoKey();
        const state = useConfigStore.getState();
        expect(state.nekoValidation.status).toBe("success");
        expect(state.config.channels.map(c => c.models)).toEqual([[{ name: "gpt-image-2.5-flare", capability: "image" }], [{ name: "gemini-3.1-flash-lite-image", capability: "image" }]]);
        expect(state.config.channels.every(c => c.apiKey === "test-shared-key")).toBe(true);
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("get");
        expect(requests[0].url).toBe("https://api.nekocloud.vip/v1/models");
        expect(requests[0].headers.Authorization).toBe("Bearer test-shared-key");
        expect(JSON.stringify(JSON.parse(memory.get(CONFIG_STORE_KEY)!).state)).not.toContain("test-shared-key");
    } finally { axios.defaults.adapter = previous; }
});
test("editing key revokes preset permissions before validation and rejects direct requests", async () => {
    const { resolveModelRequestConfig } = await import("../src/stores/use-config-store");
    const store = useConfigStore.getState();
    store.setNekoKey("new-key");
    expect(useConfigStore.getState().config.channels.every(c => !c.nekoPreset || c.models.length === 0)).toBe(true);
    expect(() => resolveModelRequestConfig(useConfigStore.getState().config, "nekocloud-gpt::gpt-image-2.5-flare")).toThrow("校验");
});

test("saved custom channels survive hydration without copying old keys to presets or fetching", async () => {
    const custom = { id: "default", name: "原有渠道", baseUrl: "https://custom.test", apiKey: "old-saved-key", apiFormat: "openai", models: [{ name: "custom-image", capability: "image" }] };
    memory.set(CONFIG_STORE_KEY, JSON.stringify({ state: { rememberApiKeys: true, config: { ...defaultConfig, channels: [custom], imageModel: "default::custom-image", models: ["default::custom-image"] } }, version: 0 }));
    await useConfigStore.persist.rehydrate();
    const state = useConfigStore.getState();
    expect(state.config.channels[0]).toMatchObject(custom);
    expect(state.config.channels.filter(c => c.nekoPreset)).toHaveLength(2);
    expect(state.config.channels.filter(c => c.nekoPreset).every(c => !c.apiKey && !c.models.length)).toBe(true);
    expect(state.nekoKey).toBe("");
    expect(state.config.imageModel).toBe("default::custom-image");
});

test("remembered unified key restores only the input and requires explicit revalidation", async () => {
    useConfigStore.getState().setNekoKey("remember-test-key");
    useConfigStore.getState().setRememberApiKeys(true);
    expect(JSON.parse(memory.get(CONFIG_STORE_KEY)!).state.nekoKey).toBe("remember-test-key");
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().nekoKey).toBe("remember-test-key");
    expect(useConfigStore.getState().config.channels.filter(c => c.nekoPreset).every(c => !c.models.length)).toBe(true);
    useConfigStore.getState().setRememberApiKeys(false);
    expect(memory.get(CONFIG_STORE_KEY)).not.toContain("remember-test-key");
});

test("failed revalidation disables all preset models and reports HTTP status without key", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    useConfigStore.setState({ config: { ...structuredClone(defaultConfig), channels: defaultConfig.channels.map(c => ({ ...c, apiKey: "failure-key", models: [{ name: c.nekoPreset === "gpt" ? "gpt-image-2" : "gemini-2.5-flash-image", capability: "image" as const }] })) }, nekoKey: "failure-key" });
    axios.defaults.adapter = async (request) => { throw new axios.AxiosError("failure-key", "ERR_BAD_REQUEST", request, undefined, { status: 401, statusText: "Unauthorized", data: {}, headers: {}, config: request }); };
    try {
        await useConfigStore.getState().validateNekoKey();
        expect(useConfigStore.getState().nekoValidation.status).toBe("error");
        expect(useConfigStore.getState().nekoValidation.message).toContain("401");
        expect(useConfigStore.getState().nekoValidation.message).not.toContain("failure-key");
        expect(useConfigStore.getState().config.channels.every(c => !c.models.length)).toBe(true);
    } finally { axios.defaults.adapter = previous; }
});

test("late validation cannot overwrite a newer key even after changing back", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    let release!: () => void;
    axios.defaults.adapter = (request) => new Promise(resolve => { release = () => resolve({ data: { data: [{ id: "gpt-image-2" }] }, status: 200, statusText: "OK", headers: {}, config: request }); });
    try {
        useConfigStore.getState().setNekoKey("first-key");
        const pending = useConfigStore.getState().validateNekoKey();
        await Promise.resolve();
        useConfigStore.getState().setNekoKey("second-key");
        useConfigStore.getState().setNekoKey("first-key");
        release(); await pending;
        expect(useConfigStore.getState().nekoValidation.status).toBe("idle");
        expect(useConfigStore.getState().config.channels.every(c => !c.nekoPreset || !c.models.length)).toBe(true);
    } finally { axios.defaults.adapter = previous; }
});

test("configuration exposes one key field, explicit apply and preset permission statuses", () => {
    const source = readFileSync("src/components/layout/neko-presets-panel.tsx", "utf8");
    expect(source).toContain("Input.Password");
    expect(source).toContain("校验并应用");
    expect(source).toContain("validateNekoKey");
    expect(source).toContain("NEKO_DRAWING_MODELS");
    expect(source).toContain("未启用");
    expect(source).toContain("本地非加密");
    expect(readFileSync("src/components/layout/app-config-modal.tsx", "utf8")).toContain("<NekoPresetsPanel");
});
test("no matching presets is explicit and never enables unrelated models", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    axios.defaults.adapter = async request => ({ data: { models: [{ name: "models/gpt-5.5" }] }, status: 200, statusText: "OK", headers: {}, config: request });
    try {
        useConfigStore.getState().setNekoKey("empty-test-key");
        await useConfigStore.getState().validateNekoKey();
        expect(useConfigStore.getState().nekoValidation.status).toBe("empty");
        expect(useConfigStore.getState().nekoValidation.message).toContain("没有匹配");
        expect(useConfigStore.getState().config.channels.filter(c => c.nekoPreset).every(c => !c.models.length)).toBe(true);
    } finally { axios.defaults.adapter = previous; }
});

test("managed presets cannot be edited as unvalidated custom channels", () => {
    expect(readFileSync("src/components/layout/app-config-modal.tsx", "utf8")).toContain("config.channels.filter((channel) => !channel.nekoPreset)");
});
test("missing model-list schema is a concrete error, not a valid empty list", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    axios.defaults.adapter = async request => ({ data: { error: { message: "bad-key-must-not-echo" } }, status: 200, statusText: "OK", headers: {}, config: request });
    try {
        useConfigStore.getState().setNekoKey("bad-key-must-not-echo");
        await useConfigStore.getState().validateNekoKey();
        expect(useConfigStore.getState().nekoValidation.status).toBe("error");
        expect(useConfigStore.getState().nekoValidation.message).toContain("响应格式");
        expect(useConfigStore.getState().nekoValidation.message).not.toContain("bad-key-must-not-echo");
    } finally { axios.defaults.adapter = previous; }
});

test("model-list timeout has a specific safe error", async () => {
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    axios.defaults.adapter = async request => { throw new axios.AxiosError("secret-key", "ECONNABORTED", request); };
    try {
        useConfigStore.getState().setNekoKey("secret-key");
        await useConfigStore.getState().validateNekoKey();
        expect(useConfigStore.getState().nekoValidation.message).toContain("超时");
        expect(useConfigStore.getState().nekoValidation.message).not.toContain("secret-key");
    } finally { axios.defaults.adapter = previous; }
});

test("native names enable all seven exact drawing presets and retain a custom default", async () => {
    const { NEKO_DRAWING_MODELS } = await import("../src/stores/use-config-store");
    const axios = (await import("axios")).default;
    const previous = axios.defaults.adapter;
    const custom = { id: "custom", name: "保留", baseUrl: "https://custom.test", apiKey: "custom-key", apiFormat: "openai" as const, models: [{ name: "my-image", capability: "image" as const }] };
    useConfigStore.setState({ config: { ...structuredClone(defaultConfig), channels: [custom, ...structuredClone(defaultConfig.channels)], model: "custom::my-image", imageModel: "custom::my-image" } });
    axios.defaults.adapter = async request => ({ data: { models: Object.values(NEKO_DRAWING_MODELS).flat().map(name => ({ name: `models/${name}` })) }, status: 200, statusText: "OK", headers: {}, config: request });
    try {
        useConfigStore.getState().setNekoKey("full-test-key");
        await useConfigStore.getState().validateNekoKey();
        const config = useConfigStore.getState().config;
        expect(config.channels[0]).toEqual(custom);
        expect(config.imageModel).toBe("custom::my-image");
        expect(config.channels.filter(c => c.nekoPreset).flatMap(c => c.models)).toHaveLength(7);
        expect(config.channels.filter(c => c.nekoPreset).flatMap(c => c.models).every(m => m.capability === "image")).toBe(true);
    } finally { axios.defaults.adapter = previous; }
});
