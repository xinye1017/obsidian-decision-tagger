import { getAllTags, Notice, Plugin, TFile } from "obsidian";
import { NoteEvaluationResult, TagDefinition } from "./jevClient";
import { ModelClient, ModelError, migrateModels, isEligible, ModelProfile, ModelProvider, PROVIDERS } from "./modelClient";
import { KeyPool, sameKeys } from "./keyPool";
import { splitFrontmatter, withEmptyFrontmatter } from "./frontmatter";
import { DEFAULT_SETTINGS, JevTaggerSettings, JevTaggerSettingTab } from "./settings";
import { TagSuggestModal } from "./tagSuggestModal";
import { BatchTagModal } from "./batchTagModal";
import { TagModal } from "./tagModal";
import { t, TranslationKey } from "./i18n";

const LEGACY_DEFAULT_TAG_RULES = [
	{
		name: "异常检测",
		instructions: "Is this note primarily about image anomaly detection or anomaly segmentation?",
		matchCriteria: "Computer vision anomaly detection, defect localization, and benchmark experiments.",
		otherCriteria: "General database schemas, web engineering, reading lists, or thesis checklists.",
	},
	{
		name: "社交媒体",
		instructions: "Is this note primarily about social media, creator accounts, or tweets?",
		matchCriteria: "Social platforms, creator profiles, tweet drafts, or audience growth.",
		otherCriteria: "Machine learning research, backend coding, or internal project planning.",
	},
	{
		name: "资讯",
		instructions: "Does this note primarily record recent news, announcements, or industry developments?",
		matchCriteria: "The note reports or aggregates external news, model releases, company updates, or daily roundups.",
		otherCriteria: "An evergreen tutorial, research explanation, personal plan, or general design document.",
	},
	{
		name: "AI",
		instructions: "Is this note primarily about artificial intelligence models, AI agents, or AI tools?",
		matchCriteria: "Artificial intelligence models, AI agents, LLM prompting, or AI tools.",
		otherCriteria: "General software development, database administration, UI styling, or personal notes.",
	},
];

export default class JevTaggerPlugin extends Plugin {
	settings: JevTaggerSettings;
	batchRunning = false;
	/** Shared by every session so rotation continues across notes and commands. */
	keyPool = new KeyPool();
	private controllers = new Set<AbortController>();

	private tr(key: TranslationKey, params?: Record<string, string | number>): string {
		return t(this.settings.language, key, params);
	}

	async onload() {
		await this.loadSettings();

		// Add Ribbon Icon on the left bar
		this.addRibbonIcon("tags", this.tr("plugin.ribbon"), (evt: MouseEvent) => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				new TagSuggestModal(this.app, this, activeFile).open();
			} else {
				new Notice(this.tr("notice.noActiveFile"));
			}
		});

		// Add Command: Open Suggestion Modal
		this.addCommand({
			id: "jev-suggest-tags",
			name: this.tr("command.suggestTags"),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						new TagSuggestModal(this.app, this, activeFile).open();
					}
					return true;
				}
				return false;
			},
		});

		// Add Command: Quick Auto-Apply High-Confidence Tags
		this.addCommand({
			id: "jev-auto-apply-tags",
			name: this.tr("command.autoApply"),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.autoApplyTags(activeFile);
					}
					return true;
				}
				return false;
			},
		});

		// Add Command: Batch Tag All Notes
		this.addCommand({
			id: "jev-batch-tag-all",
			name: this.tr("command.batchTagAll"),
			callback: () => {
				new BatchTagModal(this.app, this).open();
			},
		});

		// Add Command: Detect and Sync Vault Tags
		this.addCommand({
			id: "jev-sync-vault-tags",
			name: this.tr("command.syncVaultTags"),
			callback: async () => {
				await this.detectAndSyncVaultTags();
			},
		});

		// Add Command: Create New Tag
		this.addCommand({
			id: "jev-create-tag",
			name: this.tr("command.createTag"),
			callback: () => {
				new TagModal(this.app, this).open();
			},
		});

		// Add Context Menu Item
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) => {
						item
							.setTitle(this.tr("menu.suggestTags"))
							.setIcon("tags")
							.onClick(() => {
								new TagSuggestModal(this.app, this, file).open();
							});
					});
				}
			})
		);

		// Add Settings Tab
		this.addSettingTab(new JevTaggerSettingTab(this.app, this));
		console.log("decision tagger plugin loaded.");
	}

	onunload() {
		this.controllers.forEach(controller => controller.abort());
		console.log("decision tagger plugin unloaded.");
	}

	syncActiveModel() {
		const provider = this.settings.provider || "typesafe";
		const config = PROVIDERS[provider] || PROVIDERS.typesafe;
		if (!Array.isArray(this.settings.apiKeys?.[provider])) {
			this.settings.apiKeys = { ...this.settings.apiKeys, [provider]: [] };
		}
		if (!Array.isArray(this.settings.models)) {
			this.settings.models = [];
		}
		let target = this.settings.models.find(m => m.id === provider);
		if (!target) {
			target = {
				id: config.id,
				name: config.name,
				endpoint: config.endpoint,
				model: config.model,
			};
			this.settings.models.push(target);
		} else {
			target.name = config.name;
			target.endpoint = config.endpoint;
			target.model = (typeof target.model === "string" && target.model.trim()) ? target.model : config.model;
		}
		this.settings.activeModelId = provider;
	}

	/** Rebuilds the pool only when the configured keys changed, so recorded statuses survive. */
	syncKeyPool() {
		const keys = this.settings.apiKeys?.[this.settings.provider] || [];
		if (!sameKeys(this.keyPool.keys, keys)) this.keyPool = new KeyPool(keys);
	}

	async loadSettings() {
		const savedData = await this.loadData();
		const { apiKey, endpoint, ...current } = savedData || {};
		const migrated = migrateModels(savedData);
		this.settings = { ...DEFAULT_SETTINGS, ...current, ...migrated, tags: Array.isArray(savedData?.tags) ? savedData.tags : [] };
		this.syncActiveModel();
		this.syncKeyPool();

		// Remove unchanged built-in rules from older versions while preserving custom rules.
		if (Array.isArray(savedData?.tags)) {
			const filteredTags = this.settings.tags.filter(
				(tag) =>
					!LEGACY_DEFAULT_TAG_RULES.some(
						(rule) =>
							tag.name === rule.name &&
							tag.instructions === rule.instructions &&
							tag.matchCriteria === rule.matchCriteria &&
							tag.otherCriteria === rule.otherCriteria
					)
			);
			if (filteredTags.length !== this.settings.tags.length) {
				this.settings.tags = filteredTags;
				await this.saveData(this.settings);
			}
		}
	}

	async saveSettings() {
		this.syncActiveModel();
		this.syncKeyPool();
		await this.saveData(this.settings);
	}

	get activeModel(): ModelProfile {
		const provider = this.settings.provider || "typesafe";
		const config = PROVIDERS[provider] || PROVIDERS.typesafe;
		const found = this.settings.models?.find(model => model.id === this.settings.activeModelId);
		if (found) {
			if (found.id === "typesafe" || found.id === "openrouter") {
				found.endpoint = PROVIDERS[found.id as ModelProvider].endpoint;
				found.model = (typeof found.model === "string" && found.model.trim()) ? found.model : PROVIDERS[found.id as ModelProvider].model;
			}
			return found;
		}
		return { id: config.id, name: config.name, endpoint: config.endpoint, model: config.model };
	}

	createEvaluationSession() {
		this.syncKeyPool();
		const client = new ModelClient(this.activeModel, this.keyPool);
		const tags = this.settings.tags.map(tag => ({ ...tag }));
		if (!tags.some(tag => tag.enabled)) throw new Error(this.tr("error.noTags"));
		return { client, tags, threshold: this.settings.confidenceThreshold };
	}

	createController() {
		const controller = new AbortController();
		this.controllers.add(controller);
		return controller;
	}

	releaseController(controller: AbortController) { this.controllers.delete(controller); }

	errorText(error: unknown): string {
		if (error instanceof ModelError) return this.tr(`error.${error.code}`, { status: error.status });
		return error instanceof Error ? error.message : this.tr("error.response");
	}

	/**
	 * Extracts clean state for Jev System-1 model evaluation
	 */
	public async buildNoteState(file: TFile): Promise<Record<string, any>> {
		// Obsidian's own rule: only a block that opens at byte 0 is frontmatter.
		// A looser match would swallow body content up to the next `---`, such as
		// a horizontal rule, in notes that have no frontmatter at all.
		let text = splitFrontmatter(await this.app.vault.read(file)).body.trim();
		// Strip inline tags like #tag
		text = text.replace(/(^|\s)#[^\s#]+/g, "$1").trim();

		const title = file.basename;
		const introduction = text.slice(0, 450);

		// Extract top headings
		const headings: string[] = [];
		const headingMatches = text.match(/^#{1,4}\s+(.+)$/gm);
		if (headingMatches) {
			for (const h of headingMatches.slice(0, 8)) {
				headings.push(h.replace(/^#{1,4}\s+/, "").trim());
			}
		}

		// Representative excerpt
		let excerpt = "";
		if (text.length > 700) {
			excerpt = text.slice(-260);
		}

		const state: Record<string, any> = {
			title: title,
			headings: headings,
			content_start: introduction,
			content_excerpt: excerpt,
		};

		// Short note context enhancement
		if (text.length < 300) {
			const folder = file.parent ? file.parent.path : "";
			state["folder_context"] = `Folder location: ${folder}`;
		}

		return state;
	}

	/**
	 * Calls Jev to evaluate the note against enabled tags
	 */
	public async evaluateFile(file: TFile, session = this.createEvaluationSession(), signal?: AbortSignal, onStage?: (stage: "reading" | "evaluating") => void): Promise<NoteEvaluationResult[]> {
		onStage?.("reading");
		const state = await this.buildNoteState(file);
		onStage?.("evaluating");
		return await session.client.evaluateNote(state, session.tags, signal);
	}

	/**
	 * Auto applies tags that meet the threshold
	 */
	public async autoApplyTags(file: TFile) {
		new Notice(this.tr("notice.analyzing", { name: file.basename }));
		const controller = this.createController();
		try {
			const session = this.createEvaluationSession();
			const results = await this.evaluateFile(file, session, controller.signal);
			const eligible = results.filter((r) => isEligible(r, session.threshold));

			if (eligible.length === 0) {
				new Notice(
					this.tr("notice.noEligibleTags", {
						threshold: Math.round(this.settings.confidenceThreshold * 100),
					})
				);
				return;
			}

			let addedCount = 0;
			for (const res of eligible) {
				if (controller.signal.aborted) return;
				const added = await this.addTagToFile(file, res.tagName);
				if (added) addedCount++;
			}

			if (addedCount > 0) {
				new Notice(this.tr("notice.autoApplySuccess", { count: addedCount }));
			} else {
				new Notice(this.tr("notice.tagsAlreadyExist"));
			}
		} catch (e) {
			new Notice(this.tr("notice.autoApplyFailed", { error: this.errorText(e) }));
		} finally { this.releaseController(controller); }
	}

	/**
	 * Adds a tag to the YAML frontmatter using Obsidian's processFrontMatter.
	 *
	 * The empty block is created first on purpose: processFrontMatter writes
	 * properties as plain body text into a file that has no frontmatter yet, so
	 * without it a tag on such a note lands in the note instead of in the YAML.
	 */
	public async addTagToFile(file: TFile, newTag: string): Promise<boolean> {
		const tag = newTag.replace(/^#/, "").trim();
		if (!tag) return false;

		const content = await this.app.vault.read(file);
		const ready = withEmptyFrontmatter(content);
		if (ready !== content) await this.app.vault.modify(file, ready);

		let modified = false;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			let currentTags: string[] = [];
			if (frontmatter.tags) {
				if (Array.isArray(frontmatter.tags)) {
					currentTags = frontmatter.tags.map((t) => String(t).replace(/^#/, ""));
				} else if (typeof frontmatter.tags === "string") {
					currentTags = frontmatter.tags.split(/[\s,]+/).map((t) => t.replace(/^#/, ""));
				}
			}

			if (!currentTags.includes(tag)) {
				currentTags.push(tag);
				modified = true;
			}

			frontmatter.tags = currentTags;
		});

		return modified;
	}

	/**
	 * Removes a tag from the frontmatter and from the note body.
	 *
	 * The body is cleaned first and the frontmatter second, so the inline edit
	 * always runs against the content that was just read. processFrontMatter is
	 * only called for files that really have a block: on a file without one it
	 * would write properties as plain body text, which is the mirror image of
	 * the bug addTagToFile guards against.
	 */
	public async removeTagFromFile(file: TFile, tagToRemove: string): Promise<boolean> {
		let modified = false;
		const cleanTag = tagToRemove.replace(/^#/, "").trim();
		if (!cleanTag) return false;

		// 1. Inline tags in the body, which never touches the frontmatter block.
		if (this.app.vault?.read && this.app.vault?.modify) {
			try {
				const { frontmatter, body } = splitFrontmatter(await this.app.vault.read(file));
				const escaped = cleanTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const inlineRegex = new RegExp(`(^|\\s)#${escaped}(?=[\\s,，.。!！?？:：;；"'\`\\]\\)\\>\\<]|$)(?!\\/)`, "g");
				if (inlineRegex.test(body)) {
					const updatedBody = body.replace(inlineRegex, (match, prefix) => {
						return prefix.includes("\n") ? prefix : "";
					});
					if (updatedBody !== body) {
						await this.app.vault.modify(file, frontmatter + updatedBody);
						modified = true;
					}
				}
			} catch {
				// Continue if file read/modify fails
			}
		}

		// 2. Frontmatter, only when the file has one.
		if (this.app.fileManager?.processFrontMatter && await this.hasFrontmatterBlock(file)) {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				if (!frontmatter) return;

				if (frontmatter.tags) {
					let currentTags: string[] = [];
					if (Array.isArray(frontmatter.tags)) {
						currentTags = frontmatter.tags.map((t) => String(t).replace(/^#/, "").trim());
					} else if (typeof frontmatter.tags === "string") {
						currentTags = frontmatter.tags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim());
					}
					const initialLength = currentTags.length;
					currentTags = currentTags.filter((t) => t !== cleanTag);
					if (currentTags.length !== initialLength) {
						modified = true;
						frontmatter.tags = currentTags;
					}
				}

				if (frontmatter.tag) {
					let currentTags: string[] = [];
					if (Array.isArray(frontmatter.tag)) {
						currentTags = frontmatter.tag.map((t) => String(t).replace(/^#/, "").trim());
					} else if (typeof frontmatter.tag === "string") {
						currentTags = frontmatter.tag.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim());
					}
					const initialLength = currentTags.length;
					currentTags = currentTags.filter((t) => t !== cleanTag);
					if (currentTags.length !== initialLength) {
						modified = true;
						frontmatter.tag = currentTags;
					}
				}
			});
		}

		return modified;
	}

	private async hasFrontmatterBlock(file: TFile): Promise<boolean> {
		return this.app.vault?.read ? splitFrontmatter(await this.app.vault.read(file)).frontmatter !== "" : false;
	}

	/**
	 * Removes a tag from all notes across the vault and deletes it from the tag library
	 */
	public async removeTagFromVault(tagName: string): Promise<{ affectedNotes: number; totalNotes: number }> {
		const cleanTag = tagName.replace(/^#/, "").trim();
		const files = this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : [];
		let affectedNotes = 0;

		for (const file of files) {
			const cache = this.app.metadataCache?.getFileCache ? this.app.metadataCache.getFileCache(file) : null;
			let hasTag = false;
			if (cache) {
				const tags = getAllTags(cache) || [];
				hasTag = tags.some((t) => (typeof t === "string" ? t : (t as any)?.tag || "").replace(/^#/, "").trim() === cleanTag);
			} else {
				hasTag = true;
			}

			if (hasTag) {
				const modified = await this.removeTagFromFile(file, cleanTag);
				if (modified) affectedNotes++;
			}
		}

		this.settings.tags = this.settings.tags.filter((t) => t.name !== cleanTag);
		await this.saveSettings();

		return { affectedNotes, totalNotes: files.length };
	}

	/**
	 * Detects all tags present in the current Obsidian Vault using metadataCache
	 * and syncs them into the plugin's tag library.
	 */
	public async detectAndSyncVaultTags(): Promise<{ added: number; total: number }> {
		const allTagsMap: Record<string, number> = Object.create(null);
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			for (const tag of cache ? getAllTags(cache) || [] : []) allTagsMap[tag] = (allTagsMap[tag] || 0) + 1;
		}
		const tagKeys = Object.keys(allTagsMap);

		if (tagKeys.length === 0) {
			new Notice(this.tr("notice.noVaultTags"));
			return { added: 0, total: 0 };
		}

		let addedCount = 0;
		const existingNames = new Set(this.settings.tags.map((t) => t.name));

		// Sort by usage count desc
		const sortedTags = tagKeys
			.map((rawTag) => ({
				name: rawTag.replace(/^#/, "").trim(),
				count: allTagsMap[rawTag],
			}))
			.filter((t) => t.name.length > 0 && !t.name.includes("/"))
			.sort((a, b) => b.count - a.count);

		for (const t of sortedTags) {
			if (!existingNames.has(t.name)) {
				this.settings.tags.push({
					name: t.name,
					instructions: `Is this note primarily about ${t.name}?`,
					matchCriteria: `${t.name} and related topics.`,
					otherCriteria: "Other topics.",
					enabled: true,
				});
				existingNames.add(t.name);
				addedCount++;
			}
		}

		await this.saveSettings();
		new Notice(this.tr("notice.vaultTagsSynced", { total: sortedTags.length, added: addedCount }));
		return { added: addedCount, total: sortedTags.length };
	}

	/**
	 * Adds a new tag definition to settings
	 */
	public async addTagDefinition(tag: TagDefinition): Promise<boolean> {
		const cleanName = tag.name.replace(/^#/, "").trim();
		if (!cleanName) {
			throw new Error(this.tr("tagModal.errorEmptyName"));
		}
		if (/\s|\//.test(cleanName)) {
			throw new Error(this.tr("tagModal.errorInvalidName"));
		}
		const exists = this.settings.tags.some(
			(t) => t.name.toLowerCase() === cleanName.toLowerCase()
		);
		if (exists) {
			throw new Error(this.tr("tagModal.errorDuplicateName", { tag: cleanName }));
		}

		const lang = this.settings.language;
		const defaultInstructions = lang === "zh"
			? `这篇笔记是否主要关于 ${cleanName}？`
			: `Is this note primarily about ${cleanName}?`;
		const defaultMatchCriteria = lang === "zh"
			? `${cleanName} 及相关主题。`
			: `${cleanName} and related topics.`;
		const defaultOtherCriteria = lang === "zh"
			? "其他主题。"
			: "Other topics.";

		this.settings.tags.push({
			name: cleanName,
			instructions: tag.instructions?.trim() || defaultInstructions,
			matchCriteria: tag.matchCriteria?.trim() || defaultMatchCriteria,
			otherCriteria: tag.otherCriteria?.trim() || defaultOtherCriteria,
			enabled: tag.enabled !== undefined ? tag.enabled : true,
		});

		await this.saveSettings();
		return true;
	}

	/**
	 * Updates an existing tag definition in settings
	 */
	public async updateTagDefinition(originalName: string, updated: Partial<TagDefinition>): Promise<boolean> {
		const target = this.settings.tags.find((t) => t.name === originalName);
		if (!target) return false;

		const lang = this.settings.language;
		const defaultInstructions = lang === "zh"
			? `这篇笔记是否主要关于 ${originalName}？`
			: `Is this note primarily about ${originalName}?`;
		const defaultMatchCriteria = lang === "zh"
			? `${originalName} 及相关主题。`
			: `${originalName} and related topics.`;
		const defaultOtherCriteria = lang === "zh"
			? "其他主题。"
			: "Other topics.";

		if (updated.instructions !== undefined) {
			target.instructions = updated.instructions.trim() || defaultInstructions;
		}
		if (updated.matchCriteria !== undefined) {
			target.matchCriteria = updated.matchCriteria.trim() || defaultMatchCriteria;
		}
		if (updated.otherCriteria !== undefined) {
			target.otherCriteria = updated.otherCriteria.trim() || defaultOtherCriteria;
		}
		if (updated.enabled !== undefined) {
			target.enabled = updated.enabled;
		}

		await this.saveSettings();
		return true;
	}
}

