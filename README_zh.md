# decision tagger

一款支持 TypeSafe 和 OpenRouter 决策模型的 Obsidian 智能标签插件。

[English](README.md) · [GitHub Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases)

decision tagger 根据你的标签规则分析笔记。你可以先查看推荐再确认，也可以自动应用推荐标签，或按文件夹、整个知识库批量处理。

## 功能

- **分类过程可视化：** 一行实时状态显示读取笔记、模型判断、写入标签三个阶段，配合真实完成比例、当前文件、耗时、预计剩余时间、扫描数、新增标签数和失败数。最近 100 条记录区分新增、无新增与失败。
- **紧凑的批量面板：** 扫描范围默认折叠为一栏，只显示当前范围（默认是库名）与笔记数，点击才展开逐级文件夹浏览。
- **支持多模型提供商：** 原生支持 **TypeSafe**（模型 `jev-latest`）与 **OpenRouter**（模型 `respan/span-01-lite:free`）。Base URL 与模型内置固定，无需手动配置繁琐的请求地址，填入对应 API Key 即可使用。
- **多账号 Key 轮询：** 一个账号一个 Key，批量分类时按顺序轮询。任意非 200 响应会当场标记该 Key 并换下一个账号继续，401/402/403 的账号自动退出轮询，429 只在冷却期内暂停、冷却结束自动回到池中。
- **当前笔记推荐：** 推荐标签与其他判断分开显示，提供匹配评分、阈值标记和结果说明；支持逐个添加或批量应用推荐标签。
- **批量分类：** 默认整个知识库，也可以递归处理所选文件夹下的 Markdown 文件。扫描范围逐级进入文件夹，列表只显示当前层，breadcrumb 可随时回到上层，每行显示该选择会扫描多少篇笔记。隐藏路径和模板路径会跳过。停止或关闭面板后，不再继续写入后续标签；已完成的写入保留，进度不会被强制改为 100%。
- **紧凑标签库：** 从知识库已有标签同步规则，默认不附带内置规则。桌面采用两列，窄窗口自动切换为一列，可单独或批量启停。编辑弹窗里可直接改名，保存即一键应用到全库：带该标签的笔记会换成新名称（只在正文里的标签会移进 YAML），由标签名自动生成的判定文案会跟着更新，手写的判定文案保持不变。
- **保留笔记数据：** 通过 Obsidian `processFrontMatter` 追加标签，保留其他字段与已有标签，避免重复添加。
- **主题与语言：** 跟随 Obsidian 明暗主题，支持简体中文、English、键盘焦点与减少动态效果偏好。

## 模型配置

在 **设置 → decision tagger → 模型提供商** 中：

1. **选择提供商**：选择 `TypeSafe` 或 `OpenRouter`。
2. **确认 Base URL 与模型**：Base URL 和模型已在插件中内置写死（TypeSafe: `https://api.typesafe.ai/v1/systemone`，模型 `jev-latest`；OpenRouter: `https://openrouter.ai/api/alpha/decisions`，模型 `respan/span-01-lite:free`），无需用户手动配置。
3. **账号池**：逐个添加该提供商各账号的 API Key（一个账号一个 Key）。列表逐行显示账号健康状态与延迟：🟢 健康可用 (200)、🟡 频率限流 (429，保护保留)、🔴 凭据无效 (401)、⛔ 推理封禁 (403)、🟣 额度耗尽 (402)、⚪ 待检测。Key 默认掩码显示，可点眼睛临时展开，也可单独删除。
4. **检测全部账号**：点击后逐个账号发送内置测试请求，记录可用状态与延迟，并汇总为「可用 N/M · 百分比 · 平均延迟」。检测只发送内置示例，不读取笔记正文。

## 工作逻辑与数据处理

1. 提取笔记标题、最多 8 个标题层级、正文开头 450 字符，以及长文末尾 260 字符；短笔记另带文件夹上下文。已有 Frontmatter 和行内标签从分析正文中移除。
2. 将这些上下文和已启用规则发送到当前模型配置指定的地址。笔记正文作为待分类数据，不作为系统指令。
3. 决策服务为每个启用标签返回一条 `choice` 答案。缺失、未知或格式错误的答案会使本次评估失败，不自动写入；答案缺少 `probabilities` 时会回退使用 `choice` 与 `confidence`。
4. 自动应用要求模型判定匹配且分数达到阈值；推荐面板仍允许手动添加其他判断中的标签。

批量任务固定使用启动时的模型、标签规则和阈值。请求超过 60 秒会报超时；网络、超时和取消不会轮换到下一个账号（非 200 才会），认证失败、地址不存在和限流会停止剩余批次，其他单篇失败会记录后继续。取消会丢弃晚到的响应；Obsidian 的请求接口不能撤回已经发出的服务端请求。已开始的单次 Frontmatter 写入会完成，之后不再开始新写入。

API Key 保存在 Obsidian 插件配置中；掩码只是界面隐藏，不是加密。使用远程服务时，上述笔记上下文会发送给你选择的服务商。检测全部账号同样会使用各账号的 API 配额。账号健康状态与延迟只保存在内存中，重载插件后需要重新检测。

## 安装与开发

从 [GitHub Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases) 获取 `main.js`、`manifest.json` 和 `styles.css`，放入 `<Vault>/.obsidian/plugins/decision-tagger/`，然后启用插件。升级后重新加载插件或重启 Obsidian。

```sh
npm install
npm run check
npm test
npm run build
```

本仓库现有 `build` 脚本还会将插件文件复制到 `D:/Data/Documents/lixinye/.obsidian/plugins/decision-tagger`，不会覆盖 `data.json`；在其他电脑上使用前请调整 `esbuild.config.mjs` 中的目标目录。

`npm run preview` 在 `http://127.0.0.1:4178` 提供模拟宿主预览，使用实际 UI 源码和合成数据，不访问真实笔记或 API。它用于检查布局和交互，不能代替 Obsidian 真机验收。

`npm run live` 是针对真实决策端点的可选联调检查。它用 `fetch` 承载 `requestUrl` 加载真实的 `modelClient`/`main` 源码，用四篇合成笔记对四条内置标签规则做分类，并校验传输契约（地址解析、请求体字段、认证头、每个启用标签恰好一条判定、概率范围）。HTTP 失败时会打印原始响应体，标签质量预期只作为警告而不影响退出码：

```sh
npm run live -- --mock                       # 内置 mock 决策服务，无需任何凭据
DECISION_TAGGER_API_KEY=sk-... npm run live -- --endpoint http://127.0.0.1:3000 --model vendor/model-id
```

该检查针对 `POST {model, state, questions} -> {answers}` 契约，因此要求服务是 Decision/System-1 类型。对话模型只会响应 `/v1/chat/completions`，会拒绝该端点。

## 许可证

MIT License © 2026 [xinyeli](https://github.com/xinye1017)
