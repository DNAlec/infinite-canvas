# 猫云画布本地交接

## 范围与状态

- 仓库 `/home/hermes/nekocloud-canvas`，分支 `nekocloud-integration`；没有提交、推送、部署或修改 sub2api / 生产反代 / 网络权限 / cron。
- 已实现默认一个猫云 OpenAI 兼容渠道 `https://api.nekocloud.vip`。保留原有默认模型候选、模型获取与编辑能力；候选不表示猫云账号实际可用。现有 URL builder 对根地址与 `/v1/` 均只拼一次 `/v1`。
- 标题为猫云画布；原作者 GitHub 链接、LICENSE、素材和画布存储路径保留。
- Key 用户手填，默认仅当前页面会话内存，刷新需重填；可在渠道编辑器勾选“在此浏览器记住 API Key（所有渠道，本地非加密）”。勾选后原样保存在浏览器 localStorage，不是加密存储；关闭会重写配置去除 Key。旧无明确记住标记的持久化 Key 不会加载到运行配置。此策略仅针对 AI Key，不承诺 WebDAV/Agent 凭据同样按会话保存。
- 禁止 URL 导入 API Key、token；HTML 入口在应用模块执行前清理 query/hash 中 key/token/secret/password/authorization 结尾参数及 baseUrl/agentUrl（大小写、横杠、下划线变体）。禁用原始渠道 URL 导入和 Agent URL token bootstrap，包括 SPA 路径的 token 消费。没有 JWT 读取、面板 token 自动取 Key、postMessage Key 导入。
- 清理发生在浏览器端，**不能抹除首次 HTTP 请求已经进入服务器、代理、浏览器历史或其他日志的 URL**；不可通过 URL 传递凭据。
- 自定义模型脚本执行器改为直接拒绝，删除 Function 动态执行路径，移除渠道脚本按钮；脚本编辑器改为无 UI 的惰性出口。已有带 script 模型将报禁用而不是运行。分析确认插入模板仅是编辑器脚本文本，标准 OpenAI 生图有独立原生 HTTP 路径；已有标准视频/Gemini等实现没有改动。单元测试使用显式 axios adapter 测试夹具证明标准生图路径仍走 `/v1/images/generations`，**没有请求真实猫云服务**。
- Analytics 空默认配置未改变，也未启用任何第三方统计；部署时不得注入 analytics ID。

## 真实验证与日志

日志目录 `/home/hermes/nekocloud-canvas/logs/`（上游 gitignore 忽略日志，但本机文件存在）：

- RED：`red-default.log`（猫云默认缺失）、`red-storage.log`（原持久化包含 Key）、`red-remember-ui.log`（提示/开关缺失）、`red-url.log`（URL未清理）、`red-scripts.log`（脚本真实执行并 resolve）、`red-editor.log`（原编辑器仍有 Modal）、`red-agent-url.log`（原 token bootstrap 可用）、`red-title.log`（旧标题）。每次均先实际失败再实现对应行为；初次环境缺 localStorage 的测试错误修复后才记录最终 RED。
- GREEN：`green-default.log`、`green-storage.log`、`green-remember-ui.log`、`green-url.log`、`green-scripts.log`、`green-security.log`。最终全量结果以 `test-all.log` 为准：**11 pass / 0 fail，3 files，34 assertions**。
- `typecheck.log`：`NODE_OPTIONS=--max-old-space-size=1024 npm run typecheck`，退出 0。发现上游脚本编辑器 antd Modal `content` 类型不兼容；禁用该 UI 后消除错误，并未修改无关 antd API。
- `build-768mb-failed.log`：第一次 768 MiB Node heap production build 退出 134，达到 V8 heap 限制，不是成功构建。
- `build.log` / `build-resources.log`：最终 production build 退出 0；Node heap 1152 MiB，主进程峰值 RSS 1338924 KiB，压力停机未触发。仍有上游动态/静态混用 import、大 chunk 和 Node deprecation 警告。
- 产物 `/home/hermes/nekocloud-canvas/web/dist/`，含 index.html、assets、config.js、logo与原静态素材。只构建，未上传或部署。CHANGELOG 的猫云项也已纳入最终构建。
- `git diff --check` 退出 0。

## 工具与复现

已有工具位置没有 bun。审查 npm registry 官方 Oven 二进制包元数据（无 scripts），下载 `@oven/bun-linux-x64@1.4.2` 并只解包；没有运行安装脚本、curl|sh 或未审查远程脚本。

- 本地 Bun：`.tools/package/bin/bun`（1.4.2）。包下载来源 `https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-1.4.2.tgz`，计算 SHA-512 与 npm dist.integrity 一致：`sha512-9/E/UXOTpSo3YsV5g+FhtTd/qTpiWoKuxS12cqtuYA1ssu9fRAoPQnipFgGyck3tWO63iUdxBiygq+kELFawng==`。
- 初始 npm ci 遇原有 antd 6 与 pro-components beta 的 antd 5 peer 冲突：`dependencies.log`。改用 Bun `install --frozen-lockfile --ignore-scripts` 成功：`dependencies-bun.log`；未改锁文件。
- 从 web 执行 `../.tools/package/bin/bun test`，`NODE_OPTIONS=--max-old-space-size=1024 npm run typecheck`。
- 从仓库执行 `python3 .tools/build-limited.py`。该本地构建脚本限制 Node heap，监控主进程 RSS，超过约 1.5 GB 或可用内存低于约 150 MB 时终止；不是系统配置，也不是应用行为限制。
- `.tools/` 是未跟踪本地工具目录，含下载 tarball 和解包 Bun，不应随业务改动提交；没有删除这些可复现资料。

## 未验收 / 后续授权事项

1. 尚未部署独立 `canvas.nekocloud.vip`，未配置 DNS/TLS/CSP/frame-ancestors；未设置面板侧边栏 iframe 入口，因用户要求不改 sub2api 源码、不部署。后续应仅用面板允许的外链配置或受支持扩展入口，且 iframe URL 不含任何 token/Key。
2. 未进行真实浏览器 iframe / 多标签页 / 刷新记住行为验收；当前 UI 提示与无脚本入口有源码回归断言，持久化为实际 Zustand + 内存 Storage 测试，而非浏览器 E2E。
3. 未使用生产凭据或专用测试 Key，猫云 CORS、模型权限、额度、真实生图/改图、视频/音频等不作通过声明。
4. 原素材/画布实现未动，但素材导入、保存、导出、WebDAV 与大画布交互仍需人工验收。
5. 可选记住 Key 是本地非加密；同源 XSS、恶意浏览器扩展或同设备用户仍可能读取。原第三方插件机制不等同于模型脚本执行器，本次未声称实现整站脚本沙箱。
6. docs TODO 已读，现有两项 Agent/Skill 待办与本次无关，未修改；pending-test 添加猫云优先验收并声明旧 URL 导入/脚本清单不适用。
