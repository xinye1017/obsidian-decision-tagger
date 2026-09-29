# Decision Tagger

基于 System-1 决策模型（比如 Jev）的 Obsidian 智能标签分类插件，支持多 Key 并发并行分类加速。

[English](README.md) · [GitHub Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases)

---

**Decision Tagger** 能够根据你设定的标签判定规则，对知识库笔记进行高精度的智能分类与打标。支持当前笔记即时推荐、整个知识库或指定目录批量扫描，以及多账号 Key 并行分类加速，助你在极短时间内完成海量笔记整理。

---

## 核心特性

- **多 Key 并发并行分类加速**
  - 支持配置多个 API Key，批量分类时自动启动对应数量的 Worker（最高 8 线程并行），分类速度成倍提升。
  - **在飞请求智能负载均衡（In-flight load balancing）**：新请求动态分发给当前在飞任务最少的 Key，避免单账号高负载限流。
  - **遇错自动轮询与限流避让**：遇到 `429` 限流自动进入冷却期并无缝切换至下一个可用账号，冷却后自动恢复；`401`/`402`/`403` 失效账号自动移出轮询队列。

- **分类状态可视化与安全中断**
  - 实时显示读取笔记、模型决策、写入标签等完整进度、完成百分比、耗时与预估剩余时间。
  - 并发模式下显示当前并发线程数及正在并发处理的笔记列表。
  - 实时滚动日志区展示最近 100 条处理结果（区分新增标签、无新增与失败）。
  - 支持随时点击“停止分类”，立即安全收拢在途操作，杜绝脏数据写入，已写入内容完整保留。

- **单篇笔记即时推荐**
  - 在当前打开的笔记中触发标签建议（或右键菜单触发）。
  - 清晰区分推荐标签（达到置信度阈值）与其他备选标签，展示置信度百分比与判定依据。
  - 支持逐个点击添加或一键批量应用推荐标签。

- **标签规则库管理与全库联动**
  - 支持一键扫描知识库已有标签并导入规则库。
  - 自定义每个标签的判定问题、匹配特征（Match Criteria）与排除特征（Other Criteria）。
  - **全库联动改名与清理**：在设置中改名或删除标签时，支持一键同步更新或清理知识库所有笔记中的标签（正文行内标签会自动转为规范的 Frontmatter 标签）。

- **安全规范的 Frontmatter 写入**
  - 深度集成 Obsidian 官方 `processFrontMatter` API 追加标签。
  - 完整保留笔记已有 YAML 属性、正文内容与换行格式，自动避免重复添加。

- **细腻交互与就地刷新**
  - 设置页面切换语言、模型提供商、删除或保存标签时保持滚动条位置，不再跳回顶部。
  - API Key 支持逗号/换行直接输入，并提供专用的批量导入管理面板，支持从剪贴板一键粘贴、全选复制与清空。
  - 原生跟随 Obsidian 明暗主题，提供完整中英文双语支持。

---

## 快速上手

### 1. 安装方式

#### 方式一：从 Release 手动安装
1. 前往 [GitHub Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases) 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`。
2. 在知识库插件目录下创建文件夹：`<Vault>/.obsidian/plugins/decision-tagger/`。
3. 将下载的 3 个文件复制到该文件夹中。
4. 打开 Obsidian，进入 **设置 → 第三方插件**，启用 **Decision Tagger** 插件。

#### 方式二：源码构建安装
```sh
git clone https://github.com/xinye1017/obsidian-decision-tagger.git
cd obsidian-decision-tagger
npm install
npm run build
```

---

## 模型与参数配置

打开 **设置 → Decision Tagger**：

1. **模型提供商**：
   - **TypeSafe**：内置 Base URL `https://api.typesafe.ai/v1/systemone`，默认模型 `jev-latest`。
   - **OpenRouter**：内置 Base URL `https://openrouter.ai/api/alpha/decisions`，默认模型 `respan/span-01-lite:free`（也可自定义决策模型 ID）。
2. **API Key 与账号池**：
   - 直接输入对应提供商的 API Key。
   - 如需配置多账号以开启并发加速，可以直接以英文/中文逗号分隔（如 `key1, key2`），或点击 **批量导入** 打开管理面板从剪贴板每行一个粘贴导入。
3. **置信度阈值**：
   - 拖动滑块调整自动应用标签的置信度阈值（默认 70%，范围 0~100%）。
4. **标签规则库**：
   - 点击 **扫描标签库** 自动导入已有标签。
   - 点击 **新建标签** 或编辑图标微调具体标签的提示词与判定标准。

---

## 工作原理

1. **笔记状态提取**：提取笔记标题、前 8 个大标题、正文开头 450 字符以及长笔记结尾 260 字符（短笔记附带文件夹上下文）。自动剔除已有 Frontmatter 与行内标签，避免干扰模型判断。
2. **System-1 决策架构**：将清洗后的笔记上下文与启用的标签规则作为纯数据传递给决策端点（防止提示词注入）。
3. **决策评分与写入**：模型对每个启用的标签给出概率评分，达到或超过阈值的标签通过原子化 Frontmatter 事务安全写入笔记。

---

## 本地开发与测试

```sh
npm install          # 安装依赖
npm run check        # 执行 TypeScript 类型检查
npm test             # 运行完整的单元测试套件（42 项测试）
npm run build        # 构建生产环境代码
npm run preview      # 启动本地模拟预览服务（http://127.0.0.1:4178）
npm run live         # 针对真实决策端点联调测试（可选）
```

---

## 开源许可证

MIT License © 2026 [xinyeli](https://github.com/xinye1017)
