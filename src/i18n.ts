export type Language = "zh" | "en";

export const LANGUAGES: Language[] = ["zh", "en"];

export const LANGUAGE_OPTIONS: Record<Language, string> = {
	zh: "简体中文",
	en: "English",
};

const translations = {
	zh: {
		"plugin.ribbon": "decision tagger: 智能标签推荐",

		"notice.noActiveFile": "请先在编辑器中打开一篇笔记。",

		"notice.analyzing": "正在分析笔记：{name}…",
		"notice.noEligibleTags": "未检测到置信度 ≥ {threshold}% 的新标签。",
		"notice.autoApplySuccess": "已成功自动追加 {count} 个高置信标签！",
		"notice.tagsAlreadyExist": "相关标签均已存在于笔记中。",
		"notice.autoApplyFailed": "自动打标失败: {error}",
		"notice.tagAdded": "已添加标签 #{tag}",
		"notice.applyAllSuccess": "已成功添加 {count} 个标签到 Frontmatter！",
		"notice.noVaultTags": "未在知识库中检测到已有标签。",
		"notice.vaultTagsSynced": "🏷️ 标签库检测完成！共扫描到 {total} 个已有标签，自动新发现并同步 {added} 个新标签至规则库！",
		"notice.batchComplete": "批量打标完成！扫描 {scanned} 篇笔记，为 {modified} 篇笔记追加了 {added} 个新标签。",
		"notice.predictFailed": "decision tagger 预测出错: {error}",

		"command.suggestTags": "为当前活动笔记推荐标签 (Suggest Tags for Active Note)",
		"command.autoApply": "一键自动应用高置信标签到当前笔记 (Auto-apply Tags to Active Note)",
		"command.batchTagAll": "批量扫描笔记并添加高置信标签 (Batch Tag Notes)",
		"command.syncVaultTags": "自动检测并同步知识库标签库 (Detect and Sync Vault Tags)",
		"command.createTag": "新建标签规则 (Create Tag Rule)",
		"menu.suggestTags": "decision tagger: 智能标签推荐",

		"settings.title": "decision tagger 设置",

		"settings.subtitle": "从笔记到标签，让每一步分类都清晰可见。",

		"settings.section.general": "基本配置",
		"settings.language.name": "界面语言",
		"settings.language.desc": "选择插件界面所使用的语言（支持简体中文与 English）。",
		"settings.apiKey.name": "Jev API 密钥",
		"settings.apiKey.desc": "TypeSafe Jev 官方 API 密钥，输入后自动采用密码掩码保护。",
		"settings.apiKey.toggleTooltip": "切换显示/隐藏 API Key",

		"settings.threshold.name": "自动应用阈值",

		"settings.threshold.desc": "模型判定匹配且分数达到阈值时才自动写入；其他结果仍可查看。",

		"settings.section.actions": "知识库操作",
		"settings.batch.name": "批量扫描打标",
		"settings.batch.desc": "打开全库批量打标面板，支持全库或按文件夹扫描并自动追加高置信标签。",
		"settings.batch.button": "打开批量面板",
		"settings.sync.name": "扫描同步标签库",
		"settings.sync.desc": "快速提取知识库当前所有已存在的历史标签，自动扩充至下方规则库中。",
		"settings.sync.button": "扫描标签库",

		"settings.section.tags": "标签规则库",
		"settings.tagLibrary.desc": "当前管理的分类标签列表。点击开关可随时启用或关闭特定标签的自动评估。",
		"settings.tagLibrary.tagName": "#{name}",
		"settings.tagLibrary.stats": "共 {total} 个标签，已启用 {enabled} 个",
		"settings.tagLibrary.addTag": "+ 新建标签",
		"settings.tagLibrary.enableAll": "全部启用",
		"settings.tagLibrary.disableAll": "全部禁用",

		"settings.tagLibrary.empty": "规则库暂无标签。点击「扫描标签库」，导入知识库已有标签，或点击「新建标签」手动创建。",
		"settings.tagLibrary.editTooltip": "编辑此标签判断规则",
		"settings.tagLibrary.deleteTooltip": "从规则库及所有笔记中删除此标签",
		"settings.tagLibrary.deleteConfirmTitle": "删除标签 #{tag}",
		"settings.tagLibrary.deleteConfirmDesc": "确定要彻底删除标签 #{tag} 吗？此操作将从知识库的所有笔记中移除该标签，并从规则库中删除。",
		"settings.tagLibrary.deleteButton": "确认删除",
		"settings.tagLibrary.cancel": "取消",
		"settings.tagLibrary.deleting": "正在删除并清理笔记…",
		"settings.tagLibrary.deleteSuccess": "已成功从 {count} 篇笔记中移除标签 #{tag}，并从规则库中删除！",
		"settings.tagLibrary.deleteFailed": "删除标签失败: {error}",

		"tagModal.createTitle": "新建标签规则",
		"tagModal.editTitle": "编辑标签 #{tag}",
		"tagModal.name": "标签名称",
		"tagModal.nameDesc": "要分类评估的标签名（无需输入 # 前缀，不可包含空格或斜杠）。",
		"tagModal.namePlaceholder": "例如：AI、读书笔记、技术架构",
		"tagModal.instructions": "判定问题 / 提示词",
		"tagModal.instructionsDesc": "引导模型进行判定的具体问题。留空将自动根据标签名生成默认判定问题。",
		"tagModal.instructionsPlaceholder": "留空自动生成：这篇笔记是否主要关于 [标签]？",
		"tagModal.matchCriteria": "判定匹配特征 (Match Criteria)",
		"tagModal.matchCriteriaDesc": "笔记符合该标签时所具备的主题或内容特征。留空自动生成默认匹配特征。",
		"tagModal.matchCriteriaPlaceholder": "留空自动生成：[标签] 及相关主题与实践。",
		"tagModal.otherCriteria": "判定排除特征 (Other Criteria)",
		"tagModal.otherCriteriaDesc": "笔记不符合该标签时的主题特征。留空默认为「其他主题」。",
		"tagModal.otherCriteriaPlaceholder": "留空默认为：其他主题。",
		"tagModal.createButton": "创建标签",
		"tagModal.saveButton": "保存修改",
		"tagModal.cancelButton": "取消",
		"tagModal.errorEmptyName": "标签名称不能为空！",
		"tagModal.errorInvalidName": "标签名称不能包含空格或斜杠！",
		"tagModal.errorDuplicateName": "标签 #{tag} 已存在于规则库中！",
		"tagModal.createSuccess": "已成功创建标签 #{tag}！",
		"tagModal.editSuccess": "已成功更新标签 #{tag} 的判断规则！",

		"tagSuggest.title": "{name}",

		"tagSuggest.loadingSubtitle": "正在通过当前模型评估已启用的标签。",
		"tagSuggest.loading": "AI 决策分析中...",

		"tagSuggest.analysisFailed": "分析失败：{error}",

		"tagSuggest.resultSubtitle": "自动应用阈值 {threshold}%，你也可以逐个确认。",

		"tagSuggest.empty": "没有符合自动应用条件的标签。",
		"tagSuggest.alreadyTagged": "(已打标)",
		"tagSuggest.addButton": "+ 添加",

		"tagSuggest.applyAllButton": "应用推荐标签（{count}）",
		"tagSuggest.close": "关闭",

		"batch.title": "批量分类",

		"batch.subtitle": "达到 {threshold}% 阈值且被模型判定匹配的标签，将自动追加到笔记。",
		"batch.scopeLabel": "扫描范围",
		"batch.scopeDesc": "选择文件夹后，也会扫描其下级文件夹中的 Markdown 笔记。",
		"batch.scopeAll": "整个知识库",

		"batch.statScanned": "已处理笔记",

		"batch.statModified": "更新笔记",

		"batch.statAdded": "新增标签",
		"batch.ready": "准备就绪，点击下方按钮开始。",

		"batch.logHeader": "最近结果 · 最多显示 100 条",

		"batch.startHint": "开始后将在这里显示新增、无新增与失败记录。",

		"batch.startButton": "开始分类",
		"batch.close": "关闭",

		"batch.stopButton": "停止分类",

		"batch.stopping": "正在停止，等待已开始的写入结束…",
		"batch.finishedButton": "完成关闭",
		"batch.rescanButton": "重新扫描",
		"batch.logStart": "开始批量分析，范围：{scope}，共 {total} 篇 Markdown 笔记",
		"batch.logCancelled": "用户主动中止了批量打标。",
		"batch.logCurrentFile": "正在分析 ({index}/{total}): {path}",

		"batch.logAddedTags": "已添加 · {name} → {tags}",

		"batch.logError": "失败 · {name}：{error}",

		"batch.allDone": "分类完成",
		"model.heading": "模型提供商",
		"model.desc": "支持选择 TypeSafe 与 OpenRouter 模型提供商，Base URL 已内置，可自定义模型 ID 与 API Key。",
		"model.provider": "模型提供商",
		"model.providerDesc": "选择要使用的决策模型服务商（TypeSafe 或 OpenRouter）。",
		"model.active": "当前模型",
		"model.add": "添加模型",
		"model.name": "配置名称",
		"model.endpoint": "Base URL",
		"model.baseurlFixedDesc": "服务接口 Base URL（已内置固定，无需手动配置）。",
		"model.id": "模型 ID",
		"model.modelFixedDesc": "当前提供商指定的决策模型（可自定义）。",
		"model.idDesc": "输入要使用的决策模型 ID，留空时使用提供商默认模型。",
		"model.idPlaceholder": "留空则使用默认模型",
		"model.keyDesc": "输入所选提供商的 API Key，保存在本地配置中。",
		"model.test": "测试连接",
		"model.testDesc": "发送内置测试请求，验证 API Key 与服务连通性。",
		"model.testing": "正在测试连接…",
		"model.testOk": "连接成功，响应模型：{model}",
		"model.remove": "删除配置",
		"model.confirmRemove": "确认删除此配置",
		"error.config": "请检查 Base URL 与 API Key；地址需要是可访问的 http(s) 服务。",
		"error.network": "连接失败，请检查服务地址、网络或代理。",
		"error.timeout": "请求超过 60 秒，请检查服务后重试。",
		"error.response": "模型返回格式无效或结果不完整，本次未写入标签。",
		"error.http": "服务返回 HTTP {status}，请检查认证、地址、模型权限或配额。",
		"error.cancelled": "已停止请求，后续返回的结果不会写入。",
		"error.noTags": "请先在设置中扫描标签库，并启用至少一个标签。",
		"progress.stages": "分类阶段",
		"progress.reading": "读取笔记",
		"progress.evaluating": "模型判断",
		"progress.writing": "写入标签",
		"progress.completed": "已完成比例",
		"batch.statFailed": "失败笔记",
		"batch.readyCount": "准备分类 · {count} 篇笔记",
		"batch.timing": "已用 {elapsed} · 预计剩余 {eta} · 无新增 {unchanged} 篇",
		"batch.unchanged": "无新增 · {name}",
		"batch.busy": "已有批量任务在运行，请先停止该任务。",
		"batch.cancelled": "已停止 · 已写入的标签保留",
		"batch.withErrors": "处理结束 · {failed} 篇失败，请查看记录",
		"batch.summary": "已处理 {processed}/{total} 篇 · 更新 {modified} 篇 · 新增 {added} 个标签",
		"result.summary": "{count} 个推荐 · 已评估 {total} 个标签",
		"result.low": "其他判断（{count}）",
		"result.lowHint": "未满足自动应用条件；你仍可手动添加。",
		"result.recommended": "建议添加",
		"result.below": "未达推荐条件",
		"result.retry": "重新分析",
		"result.scoreNote": "分数是所选模型给出的匹配评分，不代表经校准的准确率。",
		"result.writeFailed": "写入失败：{error}",
	},

	en: {
		"plugin.ribbon": "decision tagger: Suggest Tags",

		"notice.noActiveFile": "Please open a note in the editor first.",

		"notice.analyzing": "Analyzing note: {name}…",
		"notice.noEligibleTags": "No new tags found at or above the {threshold}% confidence threshold.",
		"notice.autoApplySuccess": "Successfully appended {count} high-confidence tags!",
		"notice.tagsAlreadyExist": "All relevant tags already exist in this note.",
		"notice.autoApplyFailed": "Auto-tagging failed: {error}",
		"notice.tagAdded": "Added tag #{tag}",
		"notice.applyAllSuccess": "Successfully added {count} tags to the frontmatter!",
		"notice.noVaultTags": "No existing tags were detected in this vault.",
		"notice.vaultTagsSynced": "🏷️ Tag library sync complete! Scanned {total} existing tags and discovered {added} new tags added to the rule library!",
		"notice.batchComplete": "Batch tagging complete! Scanned {scanned} notes and appended {added} new tags across {modified} notes.",
		"notice.predictFailed": "decision tagger prediction failed: {error}",

		"command.suggestTags": "Suggest tags for the active note",
		"command.autoApply": "Auto-apply tags to the active note",
		"command.batchTagAll": "Batch scan notes and add high-confidence tags",
		"command.syncVaultTags": "Detect and sync vault tags",
		"command.createTag": "Create Tag Rule",
		"menu.suggestTags": "decision tagger: Suggest Tags",

		"settings.title": "decision tagger Settings",

		"settings.subtitle": "From notes to tags, with a clear view of every step.",

		"settings.section.general": "General",
		"settings.language.name": "Interface Language",
		"settings.language.desc": "Choose the display language for the plugin interface.",
		"settings.apiKey.name": "Jev API Key",
		"settings.apiKey.desc": "Your official TypeSafe Jev API key, automatically masked as password dots after entry.",
		"settings.apiKey.toggleTooltip": "Toggle API Key visibility",

		"settings.threshold.name": "Automatic application threshold",

		"settings.threshold.desc": "Automatic writes require a matching decision and a score at or above this threshold. Other results remain available for review.",

		"settings.section.actions": "Vault actions",
		"settings.batch.name": "Batch Scan & Tag",
		"settings.batch.desc": "Open the batch tagging panel to scan the entire vault or specific folders.",
		"settings.batch.button": "Open Batch Panel",
		"settings.sync.name": "Sync Vault Tags",
		"settings.sync.desc": "Scan all existing tags across your vault and automatically add new tags to the rule library below.",
		"settings.sync.button": "Scan Vault Tags",

		"settings.section.tags": "Tag library",
		"settings.tagLibrary.desc": "Target tags for evaluation. Toggle individual tags on or off as needed.",
		"settings.tagLibrary.tagName": "#{name}",
		"settings.tagLibrary.stats": "{total} tags total, {enabled} enabled",
		"settings.tagLibrary.addTag": "+ New Tag",
		"settings.tagLibrary.enableAll": "Enable All",
		"settings.tagLibrary.disableAll": "Disable All",

		"settings.tagLibrary.empty": "No tags yet. Use “Sync vault tags” to import tags already used in your vault, or click “New Tag” to create one manually.",
		"settings.tagLibrary.editTooltip": "Edit classification criteria for this tag",
		"settings.tagLibrary.deleteTooltip": "Delete this tag from the rule library and all notes",
		"settings.tagLibrary.deleteConfirmTitle": "Delete Tag #{tag}",
		"settings.tagLibrary.deleteConfirmDesc": "Are you sure you want to delete tag #{tag}? This will remove the tag from all notes across your vault and delete it from the rule library.",
		"settings.tagLibrary.deleteButton": "Confirm Delete",
		"settings.tagLibrary.cancel": "Cancel",
		"settings.tagLibrary.deleting": "Deleting and cleaning notes…",
		"settings.tagLibrary.deleteSuccess": "Successfully removed tag #{tag} from {count} notes and deleted it from the library!",
		"settings.tagLibrary.deleteFailed": "Failed to delete tag: {error}",

		"tagModal.createTitle": "New Tag Rule",
		"tagModal.editTitle": "Edit Tag #{tag}",
		"tagModal.name": "Tag Name",
		"tagModal.nameDesc": "The tag name to evaluate (without leading #, no spaces or slashes).",
		"tagModal.namePlaceholder": "e.g. AI, BookNotes, Architecture",
		"tagModal.instructions": "Evaluation Question / Prompt",
		"tagModal.instructionsDesc": "Question to guide the model. Leave empty to auto-generate default question.",
		"tagModal.instructionsPlaceholder": "Leave blank to auto-generate: Is this note primarily about [tag]?",
		"tagModal.matchCriteria": "Match Criteria",
		"tagModal.matchCriteriaDesc": "Topic characteristics when the note matches this tag. Leave empty for default.",
		"tagModal.matchCriteriaPlaceholder": "Leave blank to auto-generate: [tag] and related topics.",
		"tagModal.otherCriteria": "Other / Negative Criteria",
		"tagModal.otherCriteriaDesc": "Topic characteristics when the note does not match this tag. Leave empty for default.",
		"tagModal.otherCriteriaPlaceholder": "Leave blank to default: Other topics.",
		"tagModal.createButton": "Create Tag",
		"tagModal.saveButton": "Save Changes",
		"tagModal.cancelButton": "Cancel",
		"tagModal.errorEmptyName": "Tag name cannot be empty!",
		"tagModal.errorInvalidName": "Tag name cannot contain spaces or slashes!",
		"tagModal.errorDuplicateName": "Tag #{tag} already exists in the library!",
		"tagModal.createSuccess": "Successfully created tag #{tag}!",
		"tagModal.editSuccess": "Successfully updated criteria for tag #{tag}!",

		"tagSuggest.title": "{name}",

		"tagSuggest.loadingSubtitle": "Evaluating enabled tags with the selected model.",
		"tagSuggest.loading": "Running AI decision analysis...",

		"tagSuggest.analysisFailed": "Analysis failed: {error}",

		"tagSuggest.resultSubtitle": "Automatic application threshold: {threshold}%. You can also review each tag.",

		"tagSuggest.empty": "No tags qualify for automatic application.",
		"tagSuggest.alreadyTagged": "(already tagged)",
		"tagSuggest.addButton": "+ Add",

		"tagSuggest.applyAllButton": "Apply recommended tags ({count})",
		"tagSuggest.close": "Close",

		"batch.title": "Batch classification",

		"batch.subtitle": "Tags with a matching decision and score ≥ {threshold}% will be appended to notes.",
		"batch.scopeLabel": "Scan scope",
		"batch.scopeDesc": "Selecting a folder also includes Markdown notes in its subfolders.",
		"batch.scopeAll": "Entire vault",

		"batch.statScanned": "Processed notes",

		"batch.statModified": "Updated notes",

		"batch.statAdded": "Tags added",
		"batch.ready": "Ready. Click the button below to start.",

		"batch.logHeader": "Recent results · Up to 100 entries",

		"batch.startHint": "New tags, unchanged notes and failures will appear here.",

		"batch.startButton": "Start classification",
		"batch.close": "Close",

		"batch.stopButton": "Stop classification",

		"batch.stopping": "Stopping; waiting for any write already in progress…",
		"batch.finishedButton": "Done",
		"batch.rescanButton": "Rescan",
		"batch.logStart": "Starting batch analysis in {scope} over {total} Markdown notes",
		"batch.logCancelled": "Batch tagging was cancelled by the user.",
		"batch.logCurrentFile": "Analyzing ({index}/{total}): {path}",

		"batch.logAddedTags": "Added · {name} → {tags}",

		"batch.logError": "Failed · {name}: {error}",

		"batch.allDone": "Classification complete",
		"model.heading": "Model Provider",
		"model.desc": "Choose between TypeSafe and OpenRouter. Base URL is preconfigured. Customize model ID and API Key.",
		"model.provider": "Model Provider",
		"model.providerDesc": "Select the decision model provider to use (TypeSafe or OpenRouter).",
		"model.active": "Active model",
		"model.add": "Add model",
		"model.name": "Profile name",
		"model.endpoint": "Base URL",
		"model.baseurlFixedDesc": "Service Base URL (fixed and preconfigured).",
		"model.id": "Model ID",
		"model.modelFixedDesc": "Decision model specified for this provider (customizable).",
		"model.idDesc": "Decision model ID to use. Leave empty for provider default.",
		"model.idPlaceholder": "Leave empty for default",
		"model.keyDesc": "Enter API Key for the selected provider. Saved locally.",
		"model.test": "Test Connection",
		"model.testDesc": "Sends a test request to verify API Key and connectivity.",
		"model.testing": "Testing connection…",
		"model.testOk": "Connected successfully, model: {model}",
		"model.remove": "Delete profile",
		"model.confirmRemove": "Confirm deletion",
		"error.config": "Check the base URL and API key; the address must be a reachable http(s) service.",
		"error.network": "Connection failed. Check the service URL, network or proxy.",
		"error.timeout": "Request exceeded 60 seconds. Check the service and retry.",
		"error.response": "Invalid or incomplete model response. No tags were written for this request.",
		"error.http": "Service returned HTTP {status}. Check credentials, endpoint, model access or quota.",
		"error.cancelled": "Request stopped. Late results will not be applied.",
		"error.noTags": "Sync your tag library and enable at least one tag in settings first.",
		"progress.stages": "Classification stages",
		"progress.reading": "Read note",
		"progress.evaluating": "Evaluate",
		"progress.writing": "Apply tags",
		"progress.completed": "Completed percentage",
		"batch.statFailed": "Failed notes",
		"batch.readyCount": "Ready to classify · {count} notes",
		"batch.timing": "Elapsed {elapsed} · Est. remaining {eta} · Unchanged {unchanged}",
		"batch.unchanged": "Unchanged · {name}",
		"batch.busy": "Another batch is running. Stop it before starting a new batch.",
		"batch.cancelled": "Stopped · Applied tags are retained",
		"batch.withErrors": "Finished · {failed} notes failed; check the results",
		"batch.summary": "Processed {processed}/{total} · Updated {modified} · Added {added} tags",
		"result.summary": "{count} recommended · {total} tags evaluated",
		"result.low": "Other decisions ({count})",
		"result.lowHint": "Not eligible for automatic application. You can still add these manually.",
		"result.recommended": "Recommended",
		"result.below": "Not recommended",
		"result.retry": "Analyze again",
		"result.scoreNote": "Scores are model-reported match scores, not calibrated accuracy.",
		"result.writeFailed": "Could not save tags: {error}",
	},
} as const;

export type TranslationKey = keyof (typeof translations)["zh"];

export function t(
	language: Language,
	key: TranslationKey,
	params?: Record<string, string | number>
): string {
	const template: string = translations[language]?.[key] ?? translations.en[key] ?? key;
	if (!params) return template;

	return template.replace(/\{(\w+)\}/g, (match, name) =>
		Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
	);
}
