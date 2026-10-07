import { Alert, Button, Checkbox, Input, Tag } from "antd";
import { NEKO_DRAWING_MODELS, useConfigStore } from "@/stores/use-config-store";

export function NekoPresetsPanel() {
    const key = useConfigStore(state => state.nekoKey);
    const setKey = useConfigStore(state => state.setNekoKey);
    const validateNekoKey = useConfigStore(state => state.validateNekoKey);
    const validation = useConfigStore(state => state.nekoValidation);
    const channels = useConfigStore(state => state.config.channels);
    const remember = useConfigStore(state => state.rememberApiKeys);
    const setRemember = useConfigStore(state => state.setRememberApiKeys);
    return <section className="mb-6 space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <h3 className="font-semibold">猫云一键绘图配置</h3>
        <p className="text-xs text-stone-500">只需填写一次 Key，GPT / Gemini 共享使用。https://api.nekocloud.vip · 校验仅 GET 模型列表，不发起收费绘图请求。</p>
        <label className="block"><span className="mb-1 block text-sm">猫云 API Key</span><Input.Password autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="填写猫云 Key" /></label>
        <Checkbox checked={remember} onChange={event => setRemember(event.target.checked)}>在此浏览器记住 API Key（所有渠道，本地非加密）</Checkbox>
        <p className="text-xs text-stone-500">默认仅当前页面会话内存，刷新后需重新填写；记住后仍需点击校验。请勿在共享设备保存。</p>
        <Button type="primary" disabled={!key.trim()} loading={validation.status === "checking"} onClick={() => void validateNekoKey()}>校验并应用</Button>
        <Alert role="status" type={validation.status === "error" ? "error" : validation.status === "success" ? "success" : validation.status === "empty" ? "warning" : "info"} title={validation.message} showIcon />
        <div className="grid gap-3 md:grid-cols-2">{(["gpt", "gemini"] as const).map(preset => {
            const channel = channels.find(c => c.nekoPreset === preset);
            return <div key={preset}><h4 className="mb-2 text-sm font-medium">{preset === "gpt" ? "GPT 绘图 · OpenAI 协议" : "Gemini 绘图 · Gemini 协议"}</h4>
                <ul className="space-y-1">{NEKO_DRAWING_MODELS[preset].map(name => <li key={name} className="flex flex-wrap items-center gap-1 text-xs"><span>{name}</span><Tag color={channel?.models.some(model => model.name === name) ? "success" : "default"}>{channel?.models.some(model => model.name === name) ? "已启用" : "未启用"}</Tag></li>)}</ul>
            </div>;
        })}</div>
        <p className="text-xs text-stone-500">仅启用此 Key 列表中实际返回的绘图预设。下方高级配置保留您已有的自定义渠道。</p>
    </section>;
}
