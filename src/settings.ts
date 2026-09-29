import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type JevTaggerPlugin from "./main";
import type { TagDefinition } from "./jevClient";
import { BatchTagModal } from "./batchTagModal";
import { TagModal } from "./tagModal";
import { Language, LANGUAGES, LANGUAGE_OPTIONS, TranslationKey, t } from "./i18n";
import { defaultProfile, ModelProfile, ModelProvider, PROVIDERS } from "./modelClient";
import { maskKey } from "./keyPool";
import { probeKeys } from "./keyProbe";

export interface JevTaggerSettings {
	provider: ModelProvider;
	/** One key per account, rotated round-robin. */
	apiKeys: Record<ModelProvider, string[]>;
	models: ModelProfile[];
	activeModelId: string;
	language: Language;
	confidenceThreshold: number;
	tags: TagDefinition[];
}

export const DEFAULT_SETTINGS: JevTaggerSettings = {
	provider: "typesafe",
	apiKeys: {
		typesafe: [],
		openrouter: [],
	},
	models: [
		{ id: "typesafe", name: "TypeSafe", endpoint: PROVIDERS.typesafe.endpoint, model: PROVIDERS.typesafe.model },
		{ id: "openrouter", name: "OpenRouter", endpoint: PROVIDERS.openrouter.endpoint, model: PROVIDERS.openrouter.model },
	],
	activeModelId: "typesafe",
	language: "zh",
	confidenceThreshold: 0.70,
	tags: [],
};

export class JevTaggerSettingTab extends PluginSettingTab {
	plugin: JevTaggerPlugin;

	constructor(app: App, plugin: JevTaggerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private tr(key: TranslationKey, params?: Record<string, string | number>): string {
		return t(this.plugin.settings.language, key, params);
	}

	private poolKeys(): string[] {
		return this.plugin.settings.apiKeys?.[this.plugin.settings.provider] || [];
	}

	private async setPoolKeys(keys: string[]) {
		this.plugin.settings.apiKeys[this.plugin.settings.provider] = keys;
		await this.plugin.saveSettings();
	}

	/**
	 * One row per account: the masked key, the health the pool recorded for it,
	 * and the latency of its last successful answer. Rows are derived from the
	 * pool, never stored, so a re-render always shows the live state.
	 */
	private renderKeyPool(container: HTMLElement, remove: (index: number) => void) {
		const keys = this.poolKeys();
		const pool = this.plugin.keyPool;
		if (!keys.length) {
			container.createDiv({ cls: "jev-key-empty", text: this.tr("key.pool.empty") });
			return;
		}
		keys.forEach((key, index) => {
			const state = pool.state(key);
			const row = container.createDiv({ cls: `jev-key-row is-${state.status}` });
			let revealed = false;
			const secret = row.createSpan({ cls: "jev-key-secret", text: maskKey(key) });
			row.createSpan({
				cls: "jev-key-status",
				text: state.latencyMs
					? `${this.tr(`key.status.${state.status}`)} · ${state.latencyMs}ms`
					: this.tr(`key.status.${state.status}`),
			});
			new Setting(row)
				.addExtraButton(button => button
					.setIcon("eye-off")
					.setTooltip(this.tr("key.pool.reveal"))
					.onClick(() => {
						revealed = !revealed;
						secret.setText(revealed ? key : maskKey(key));
						button.setIcon(revealed ? "eye" : "eye-off");
					}))
				.addExtraButton(button => button
					.setIcon("trash-2")
					.setTooltip(this.tr("key.pool.remove"))
					.onClick(() => remove(index)));
		});
		const summary = pool.summary();
		container.createDiv({
			cls: "jev-key-summary",
			text: this.tr("key.pool.summary", {
				usable: summary.usable,
				total: summary.total,
				percent: Math.round(summary.percent * 100),
				latency: summary.avgLatencyMs,
			}),
		});
	}

	private renderModels(container: HTMLElement) {
		const tr = (key: TranslationKey, params?: Record<string, string | number>) => t(this.plugin.settings.language, key, params);
		let checking = false;
		new Setting(container).setHeading().setName(tr("model.heading")).setDesc(tr("model.desc"));
		const panel = container.createDiv({ cls: "jev-model-panel" });
		const activeProvider = this.plugin.settings.provider || "typesafe";
		const profile = this.plugin.activeModel;

		// 1. Model Provider Dropdown
		new Setting(panel)
			.setName(tr("model.provider"))
			.setDesc(tr("model.providerDesc"))
			.addDropdown(dropdown => {
				dropdown.addOption("typesafe", "TypeSafe");
				dropdown.addOption("openrouter", "OpenRouter");
				dropdown.setValue(activeProvider).onChange(async (val: string) => {
					this.plugin.settings.provider = val as ModelProvider;
					this.plugin.settings.activeModelId = val;
					this.plugin.syncActiveModel();
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// 2. Model ID (Editable)
		let modelInput: HTMLInputElement;
		const defaultModel = PROVIDERS[activeProvider]?.model || "jev-latest";
		new Setting(panel)
			.setName(tr("model.id"))
			.setDesc(tr("model.idDesc"))
			.addText(text => {
				modelInput = text.inputEl;
				text.setPlaceholder(defaultModel)
					.setValue(profile.model)
					.onChange(async value => {
						const val = value.trim();
						profile.model = val;
						const found = this.plugin.settings.models.find(m => m.id === this.plugin.settings.provider);
						if (found) found.model = val;
						await this.plugin.saveSettings();
					});
			});

		// 3. Account pool: one key per account, rotated round-robin
		new Setting(panel)
			.setName(tr("key.pool.heading"))
			.setDesc(tr("key.pool.desc"));
		const list = panel.createDiv({ cls: "jev-key-pool" });
		const removeKey = async (index: number) => {
			await this.setPoolKeys(this.poolKeys().filter((_key, position) => position !== index));
			this.display();
		};
		this.renderKeyPool(list, removeKey);

		let draft = "";
		const addKey = async () => {
			const secret = draft.trim();
			if (!secret) return;
			if (this.poolKeys().includes(secret)) {
				new Notice(tr("key.pool.duplicate"));
				return;
			}
			draft = "";
			await this.setPoolKeys([...this.poolKeys(), secret]);
			this.display();
		};
		new Setting(panel)
			.setDesc(tr("key.pool.addDesc"))
			.addText(text => {
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.setPlaceholder(activeProvider === "openrouter" ? "sk-or-v1-…" : "apikey_…")
					.onChange(value => { draft = value; });
				text.inputEl.addEventListener("keydown", event => {
					if (event.key === "Enter") addKey();
				});
			})
			.addButton(button => button.setButtonText(tr("key.pool.add")).onClick(addKey));

		// 4. Check every account in the pool
		const status = panel.createDiv({ cls: "jev-model-status", attr: { role: "status", "aria-live": "polite" } });
		const keys = this.poolKeys();
		new Setting(panel)
			.setDesc(tr("key.pool.checkDesc"))
			.addButton(button => {
				button.setButtonText(tr("key.pool.check")).setCta();
				button.setDisabled(checking || !keys.length);
				button.onClick(async () => {
					checking = true;
					button.setDisabled(true);
					status.setText(tr("key.pool.checking", { count: keys.length }));
					const controller = this.plugin.createController();
					let failure: unknown = null;
					try {
						const served = await probeKeys(this.plugin.activeModel, this.plugin.keyPool, controller.signal);
						if (served && !this.plugin.activeModel.model.trim()) {
							this.plugin.activeModel.model = served;
							if (modelInput) modelInput.value = served;
							await this.plugin.saveSettings();
						}
					} catch (error) {
						failure = error;
					}
					checking = false;
					this.plugin.releaseController(controller);
					if (failure) {
						status.setText(this.plugin.errorText(failure));
						button.setDisabled(false);
						return;
					}
					this.display();
				});
			});

		panel.querySelectorAll<HTMLElement>(".setting-item").forEach(row => {
			const label = row.querySelector(".setting-item-name")?.textContent;
			if (label) row.querySelectorAll("input, select").forEach(control => control.setAttribute("aria-label", label));
		});
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("jev-settings-container");

		const lang = this.plugin.settings.language;

		// 1. Header Block
		const headerEl = containerEl.createDiv({ cls: "jev-settings-header" });
		headerEl.createEl("h2", { text: t(lang, "settings.title") });
		headerEl.createEl("p", {
			text: t(lang, "settings.subtitle"),
			cls: "setting-item-description",
		});

		// 2. General Settings
		new Setting(containerEl).setHeading().setName(t(lang, "settings.section.general"));

		// Language
		new Setting(containerEl)
			.setName(t(lang, "settings.language.name"))
			.setDesc(t(lang, "settings.language.desc"))
			.addDropdown((dropdown) => {
				dropdown.selectEl.setAttribute("aria-label", t(lang, "settings.language.name"));
				LANGUAGES.forEach((key) => {
					dropdown.addOption(key, LANGUAGE_OPTIONS[key]);
				});
				dropdown.setValue(lang).onChange(async (value) => {
					this.plugin.settings.language = value as Language;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.renderModels(containerEl);

		// Threshold Setting with real-time percentage badge
		const thresholdSetting = new Setting(containerEl)
			.setName(t(lang, "settings.threshold.name"))
			.setDesc(t(lang, "settings.threshold.desc"));

		const currentPct = Math.round(this.plugin.settings.confidenceThreshold * 100);
		const badgeEl = thresholdSetting.controlEl.createSpan({
			cls: "jev-threshold-badge",
			text: `${currentPct}%`,
		});

		thresholdSetting.addSlider((slider) =>
			slider
				.setLimits(0.1, 0.95, 0.05)
				.setValue(this.plugin.settings.confidenceThreshold)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.confidenceThreshold = value;
					badgeEl.setText(`${Math.round(value * 100)}%`);
					await this.plugin.saveSettings();
				})
		);
		thresholdSetting.controlEl.prepend(badgeEl);

		// 3. Batch Actions & Maintenance
		new Setting(containerEl).setHeading().setName(t(lang, "settings.section.actions"));

		new Setting(containerEl)
			.setName(t(lang, "settings.batch.name"))
			.setDesc(t(lang, "settings.batch.desc"))
			.addButton((btn) =>
				btn
					.setButtonText(t(lang, "settings.batch.button"))
					.setCta()
					.onClick(() => {
						new BatchTagModal(this.app, this.plugin).open();
					})
			);

		new Setting(containerEl)
			.setName(t(lang, "settings.sync.name"))
			.setDesc(t(lang, "settings.sync.desc"))
			.addButton((btn) =>
				btn.setButtonText(t(lang, "settings.sync.button")).onClick(async () => {
					await this.plugin.detectAndSyncVaultTags();
					this.display();
				})
			);

		// 4. Tag Criteria Library
		new Setting(containerEl)
			.setHeading()
			.setName(t(lang, "settings.section.tags"))
			.setDesc(t(lang, "settings.tagLibrary.desc"));

		const tags = this.plugin.settings.tags;
		const totalTags = tags.length;

		if (totalTags > 0) {
			const enabledCount = tags.filter((tag) => tag.enabled).length;

			// Toolbar with stats & bulk toggle buttons
			const toolbar = containerEl.createDiv({ cls: "jev-tag-toolbar" });
			const statsEl = toolbar.createDiv({
				cls: "jev-tag-stats",
				text: t(lang, "settings.tagLibrary.stats", { total: totalTags, enabled: enabledCount }),
			});

			const toolbarButtons = toolbar.createDiv({ cls: "jev-tag-toolbar-buttons" });
			const addBtn = toolbarButtons.createEl("button", {
				cls: "mod-cta jev-tag-action-btn",
				text: t(lang, "settings.tagLibrary.addTag"),
			});
			addBtn.onclick = () => {
				new TagModal(this.app, this.plugin, undefined, () => this.display()).open();
			};

			const enableAllBtn = toolbarButtons.createEl("button", {
				cls: "jev-tag-action-btn",
				text: t(lang, "settings.tagLibrary.enableAll"),
			});
			enableAllBtn.onclick = async () => {
				tags.forEach((tag) => (tag.enabled = true));
				await this.plugin.saveSettings();
				this.display();
			};

			const disableAllBtn = toolbarButtons.createEl("button", {
				cls: "jev-tag-action-btn",
				text: t(lang, "settings.tagLibrary.disableAll"),
			});
			disableAllBtn.onclick = async () => {
				tags.forEach((tag) => (tag.enabled = false));
				await this.plugin.saveSettings();
				this.display();
			};

			// Card Grid
			const tagGrid = containerEl.createDiv({ cls: "jev-tag-library-grid" });
			tags.forEach((tag, index) => {
				const tagCard = tagGrid.createDiv({
					cls: `jev-tag-card ${tag.enabled ? "is-enabled" : "is-disabled"}`,
				});

				// Left: Tag pill with # symbol (clickable to edit)
				const chip = tagCard.createDiv({ cls: "jev-tag-card-chip" });
				chip.style.cursor = "pointer";
				chip.onclick = () => {
					new TagModal(this.app, this.plugin, tag, () => this.display()).open();
				};
				chip.createSpan({ cls: "jev-tag-hash", text: "#" });
				const nameEl = chip.createSpan({ cls: "jev-tag-name", text: tag.name });
				if (tag.instructions) {
					nameEl.title = tag.instructions;
				}

				// Right: Toggle, Edit & Delete
				const toggleContainer = tagCard.createDiv({ cls: "jev-tag-card-toggle" });
				new Setting(toggleContainer)
					.addToggle((toggle) => {
						toggle.toggleEl.setAttribute("aria-label", `#${tag.name}`);
						toggle.setValue(tag.enabled).onChange(async (val) => {
							tags[index].enabled = val;
							tagCard.toggleClass("is-enabled", val);
							tagCard.toggleClass("is-disabled", !val);
							await this.plugin.saveSettings();

							const updatedEnabled = tags.filter((item) => item.enabled).length;
							statsEl.setText(
								t(lang, "settings.tagLibrary.stats", { total: totalTags, enabled: updatedEnabled })
							);
						});
					})
					.addExtraButton((btn) => {
						btn.setIcon("pencil")
							.setTooltip(t(lang, "settings.tagLibrary.editTooltip"))
							.onClick(() => {
								new TagModal(this.app, this.plugin, tag, () => {
									this.display();
								}).open();
							});
					})
					.addExtraButton((btn) => {
						btn.setIcon("trash-2")
							.setTooltip(t(lang, "settings.tagLibrary.deleteTooltip"))
							.onClick(() => {
								new DeleteTagConfirmModal(this.app, this.plugin, tag, () => {
									this.display();
								}).open();
							});
					});
			});
		} else {
			// Empty state guidance card
			const emptyEl = containerEl.createDiv({ cls: "jev-tag-empty-state" });
			emptyEl.createEl("div", {
				cls: "jev-tag-empty-text",
				text: t(lang, "settings.tagLibrary.empty"),
			});
			const emptyBtns = emptyEl.createDiv({ cls: "jev-tag-empty-buttons" });
			const createBtn = emptyBtns.createEl("button", {
				cls: "mod-cta",
				text: t(lang, "settings.tagLibrary.addTag"),
			});
			createBtn.onclick = () => {
				new TagModal(this.app, this.plugin, undefined, () => this.display()).open();
			};
			const syncBtn = emptyBtns.createEl("button", {
				text: t(lang, "settings.sync.button"),
			});
			syncBtn.onclick = async () => {
				await this.plugin.detectAndSyncVaultTags();
				this.display();
			};
		}
	}
}

export class DeleteTagConfirmModal extends Modal {
	tag: TagDefinition;
	plugin: JevTaggerPlugin;
	onDeleted: () => void;

	constructor(app: App, plugin: JevTaggerPlugin, tag: TagDefinition, onDeleted: () => void) {
		super(app);
		this.plugin = plugin;
		this.tag = tag;
		this.onDeleted = onDeleted;
	}

	onOpen() {
		const { contentEl } = this;
		const lang = this.plugin.settings.language;

		contentEl.createEl("h2", {
			text: t(lang, "settings.tagLibrary.deleteConfirmTitle", { tag: this.tag.name }),
		});

		contentEl.createEl("p", {
			text: t(lang, "settings.tagLibrary.deleteConfirmDesc", { tag: this.tag.name }),
			cls: "setting-item-description",
		});

		const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = btnContainer.createEl("button", {
			text: t(lang, "settings.tagLibrary.cancel"),
		});
		cancelBtn.onclick = () => this.close();

		const confirmBtn = btnContainer.createEl("button", {
			cls: "mod-warning",
			text: t(lang, "settings.tagLibrary.deleteButton"),
		});

		confirmBtn.onclick = async () => {
			confirmBtn.disabled = true;
			confirmBtn.setText(t(lang, "settings.tagLibrary.deleting"));
			try {
				const result = await this.plugin.removeTagFromVault(this.tag.name);
				new Notice(
					t(lang, "settings.tagLibrary.deleteSuccess", {
						tag: this.tag.name,
						count: result.affectedNotes,
					})
				);
				this.onDeleted();
				this.close();
			} catch (err: any) {
				new Notice(
					t(lang, "settings.tagLibrary.deleteFailed", {
						error: err?.message || String(err),
					})
				);
				confirmBtn.disabled = false;
				confirmBtn.setText(t(lang, "settings.tagLibrary.deleteButton"));
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

