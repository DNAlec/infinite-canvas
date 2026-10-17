# 猫云统一 Key / 绘图预设交接

## 范围与结果

- 仓库：`/home/hermes/nekocloud-canvas`，分支 `nekocloud-integration`，基础 HEAD `d9801d62c80b9e11667733f162295767ddbed961`。未提交、未推送、未部署。
- 配置渠道页增加真实统一 Key 面板；一次输入共享给猫云 GPT/OpenAI 与 Gemini 两个受管绘图渠道。地址 `https://api.nekocloud.vip`。
- GPT：`gpt-image-2`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`。
- Gemini：`gemini-2.5-flash-image`、`gemini-3.1-flash-lite-image`、`gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview`。所有预设 capability 为 image。
- 显式「校验并应用」只 GET `/v1/models`，Authorization header 携带 Key，20 秒超时，不把 Key 放 URL、日志或错误文本。支持 `data.id`、原生 `models.name`；只启用实际列表交集。
- 未校验默认空模型；修改 Key / 开始重新校验即撤销权限，失败不启用、无匹配明确提示；生成入口拒绝未授权受管预设。修订号阻止旧响应（包括 Key 改回同值）覆盖新输入。
- 默认 Key 不持久化；可选沿用「所有渠道、本地非加密」记住选项。刷新只恢复统一输入，受管渠道仍需手动重新校验，无加载时请求。
- 旧配置追加空预设，ID 冲突避让，旧渠道、模型、Key 和默认选择保留；旧 Key 不复制到新预设。高级自定义渠道保留，受管预设不暴露为可绕过校验的编辑渠道。

## 修改清单（绝对路径）

- `/home/hermes/nekocloud-canvas/web/src/stores/use-config-store.ts`
- `/home/hermes/nekocloud-canvas/web/src/components/layout/app-config-modal.tsx`
- `/home/hermes/nekocloud-canvas/web/src/components/layout/neko-presets-panel.tsx`（新增）
- `/home/hermes/nekocloud-canvas/web/tests/nekocloud-presets.test.ts`（新增）
- `/home/hermes/nekocloud-canvas/web/tests/nekocloud.test.ts`（原默认契约更新；保留自定义协议和标准生成回归）
- `/home/hermes/nekocloud-canvas/CHANGELOG.md`
- `/home/hermes/nekocloud-canvas/docs/content/docs/progress/pending-test.mdx`
- `/home/hermes/nekocloud-canvas/docs/content/docs/progress/pending-test.zh-CN.mdx`
- `/home/hermes/nekocloud-canvas/NEKOCLOUD-PRESETS-HANDOFF.md`（本文件）

## 实际验证

1. 严格逐切片 RED→GREEN：新默认渠道、校验成功、修改撤权、旧配置迁移、记住输入、失败撤权、迟到响应、真实 UI 接入、受管编辑防护/响应格式、具体超时。失败原因包括旧默认仅单渠道、缺少统一 Key 方法、仍有旧权限、未添加预设、未记住统一输入、失败仍保留模型、旧响应覆盖输入、缺少 UI、异常响应当空列表、缺少超时文案。随后最小实现并运行通过。
2. Web 全量：`cd /home/hermes/nekocloud-canvas/web && ../.tools/package/bin/bun test`，28 pass、0 fail（4 files）；覆盖成功/失败/无匹配、旧渠道保留、不持久化、记住/刷新需校验、迟到响应、未验生成拒绝、7 模型原生列表全交集。
3. Web typecheck：`../.tools/package/bin/bun run typecheck`，exit 0。
4. Canvas Agent 全量：初次缺依赖；在仓库局部执行 `../.tools/package/bin/bun install --frozen-lockfile --ignore-scripts`（无锁文件变更、无安装脚本），再运行项目规定的 `../.tools/package/bin/bun run test`：126 pass、0 fail。
5. Canvas Agent typecheck：`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`，exit 0。先前跨目录 tsc 调用被工具安全拦截，改用本项目依赖的标准命令成功；未修改网关。
6. Production build：`cd /home/hermes/nekocloud-canvas && python3 .tools/build-limited.py`，exit 0，最后一次主进程峰值 RSS 1322564 KiB，未因压力中止。产物 `/home/hermes/nekocloud-canvas/web/dist/`，入口 `/home/hermes/nekocloud-canvas/web/dist/index.html`。存在 >500 kB chunk 警告（非错误）。
7. `git diff --check` 通过。未改网络、系统包、权限、cron、生产配置、数据库或用户画布/素材数据。

## 执行日志（绝对路径）

- `/home/hermes/nekocloud-canvas/logs/presets-red-{default,validation,revoke,migration,remember,failure,race,ui,guard,timeout}.log`
- `/home/hermes/nekocloud-canvas/logs/presets-green-{default,validation,revoke,migration,remember,failure,race,ui}.log`
- `/home/hermes/nekocloud-canvas/logs/presets-test-all.log`
- `/home/hermes/nekocloud-canvas/logs/presets-typecheck.log`
- `/home/hermes/nekocloud-canvas/logs/presets-agent-dependencies.log`
- `/home/hermes/nekocloud-canvas/logs/presets-agent-test-all.log`
- `/home/hermes/nekocloud-canvas/logs/presets-agent-typecheck.log`
- `/home/hermes/nekocloud-canvas/logs/build.log`
- `/home/hermes/nekocloud-canvas/logs/build-resources.log`

日志目录为已有忽略目录；构建复用了既有 `.tools/build-limited.py`，`.tools/` 为任务开始前已存在的未跟踪目录，未纳入提交。

## 尚未验收 / 限制

- 无真实非生产 Key，未对猫云实际服务进行权限或绘图/改图调用；测试使用 HTTP adapter 假数据，不是线上服务验收。没有发起收费请求。
- 尚无浏览器实际交互验收；新面板接入和控件有源码断言，store/协议有实际单元验证，不能等同于 UI E2E。需人工检查移动端、浅深色、模型选择、CORS、iframe 与本地代理。
- 本轮未触碰导入/导出功能：既有显式导出配置会包含当前渠道凭据，沿用界面安全提示；与默认 localStorage 不记住是不同功能。
- 新面板文案沿用猫云版本中文，未补全英文国际化。
- 本子代理没有可用独立 reviewer 工具；已自查 diff 和安全路径，仍建议主代理进行独立审查，不能声称独立审查通过。
