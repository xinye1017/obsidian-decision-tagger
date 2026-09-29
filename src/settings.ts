import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type JevTaggerPlugin from "./main";
import type { TagDefinition } from "./jevClient";
import { BatchTagModal } from "./batchTagModal";
import { TagModal } from "./tagModal";
import { Language, LANGUAGES, LANGUAGE_OPTIONS, TranslationKey, t } from "./i18n";
import { defaultProfile, ModelProfile, ModelProvider, PROVIDERS } from "./modelClient";
import { parseApiKeys } from "./keyPool";

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

	private renderModels(container: HTMLElement) {
		const tr = (key: TranslationKey, params?: Record<string, string | number>) => t(this.plugin.settings.language, key, params);
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
		const defaultModel = PROVIDERS[activeProvider]?.model || "jev-latest";
		new Setting(panel)
			.setName(tr("model.id"))
			.setDesc(tr("model.idDesc"))
			.addText(text => {
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

		// 3. API Key (supports single key, comma/line separated keys, and expandable batch import)
		let keyInput: HTMLInputElement;
		let isRevealed = false;
		let isBatchOpen = false;
		const currentKeys = this.poolKeys();
		const defaultPlaceholder = activeProvider === "openrouter" ? "sk-or-v1-..., sk-or-v2-..." : "apikey_1, apikey_2...";

		const keySetting = new Setting(panel)
			.setName(tr("model.key"))
			.setDesc(tr("model.keyDesc"));

		const countHintEl = keySetting.descEl.createDiv({ cls: "jev-key-count-hint" });
		const updateCountHint = (count: number) => {
			if (count > 1) {
				countHintEl.setText(tr("model.keyCount", { count }));
			} else {
				countHintEl.setText("");
			}
		};
		updateCountHint(currentKeys.length);

		let batchContainer: HTMLElement;
		let batchTextarea: HTMLTextAreaElement;
		let batchCountEl: HTMLElement;
		const updateBatchCount = (count: number) => {
			if (batchCountEl) {
				batchCountEl.setText(tr("model.keyCount", { count }));
			}
		};

		keySetting
			.addText(text => {
				keyInput = text.inputEl;
				keyInput.type = "password";
				keyInput.autocomplete = "off";
				keyInput.spellcheck = false;
				text.setPlaceholder(defaultPlaceholder)
					.setValue(currentKeys.join(", "))
					.onChange(async value => {
						const parsed = parseApiKeys(value);
						await this.setPoolKeys(parsed);
						updateCountHint(parsed.length);
						if (batchTextarea) batchTextarea.value = parsed.join("\n");
						updateBatchCount(parsed.length);
					});

				keyInput.addEventListener("paste", async (e: ClipboardEvent) => {
					const textData = e.clipboardData?.getData("text");
					if (textData && (textData.includes("\n") || textData.includes("\r") || textData.includes("，") || textData.includes(","))) {
						e.preventDefault();
						const incoming = parseApiKeys(textData);
						if (incoming.length) {
							const current = parseApiKeys(keyInput.value);
							const merged = Array.from(new Set([...current, ...incoming]));
							keyInput.value = merged.join(", ");
							if (batchTextarea) batchTextarea.value = merged.join("\n");
							await this.setPoolKeys(merged);
							updateCountHint(merged.length);
							updateBatchCount(merged.length);
							new Notice(tr("model.keyClipboardImported", { count: incoming.length, total: merged.length }));
						}
					}
				});
			})
			.addExtraButton(button => {
				button
					.setIcon("eye-off")
					.setTooltip(tr("key.pool.reveal"))
					.onClick(() => {
						isRevealed = !isRevealed;
						keyInput.type = isRevealed ? "text" : "password";
						button.setIcon(isRevealed ? "eye" : "eye-off");
					});
			})
			.addButton(button => {
				button
					.setButtonText(tr("model.keyBatchButton"))
					.setTooltip(tr("model.keyBatchTitle"))
					.onClick(() => {
						isBatchOpen = !isBatchOpen;
						if (isBatchOpen) {
							batchContainer.style.display = "block";
							batchTextarea.value = this.poolKeys().join("\n");
							updateBatchCount(this.poolKeys().length);
							batchTextarea.focus();
							button.setCta();
						} else {
							batchContainer.style.display = "none";
							button.removeCta();
						}
					});
			});

		// Expandable batch container
		batchContainer = panel.createDiv({ cls: "jev-key-batch-container" });
		batchContainer.style.display = "none";

		const batchHeader = batchContainer.createDiv({ cls: "jev-key-batch-header" });
		batchHeader.createSpan({ cls: "jev-key-batch-title", text: tr("model.keyBatchTitle") });
		batchCountEl = batchHeader.createSpan({ cls: "jev-key-batch-count" });
		updateBatchCount(currentKeys.length);

		batchTextarea = batchContainer.createEl("textarea", {
			cls: "jev-key-batch-textarea",
			attr: {
				rows: "5",
				placeholder: `sk-...\nsk-...\nsk-...\n(${tr("model.keyBatchPlaceholder")})`,
				spellcheck: "false",
			},
		});
		batchTextarea.value = currentKeys.join("\n");
		batchTextarea.addEventListener("input", async () => {
			const parsed = parseApiKeys(batchTextarea.value);
			await this.setPoolKeys(parsed);
			keyInput.value = parsed.join(", ");
			updateCountHint(parsed.length);
			updateBatchCount(parsed.length);
		});

		const batchActions = batchContainer.createDiv({ cls: "jev-key-batch-actions" });

		const pasteBtn = batchActions.createEl("button", {
			cls: "mod-cta jev-key-batch-btn",
			text: `📋 ${tr("model.keyBatchPaste")}`,
		});
		pasteBtn.onclick = async () => {
			try {
				const clipText = await navigator.clipboard.readText();
				if (!clipText || !clipText.trim()) {
					new Notice(tr("model.keyClipboardEmpty"));
					return;
				}
				const incoming = parseApiKeys(clipText);
				if (!incoming.length) {
					new Notice(tr("model.keyClipboardEmpty"));
					return;
				}
				const existing = parseApiKeys(batchTextarea.value);
				const merged = Array.from(new Set([...existing, ...incoming]));
				batchTextarea.value = merged.join("\n");
				await this.setPoolKeys(merged);
				keyInput.value = merged.join(", ");
				updateCountHint(merged.length);
				updateBatchCount(merged.length);
				new Notice(tr("model.keyClipboardImported", { count: incoming.length, total: merged.length }));
			} catch {
				new Notice(tr("model.keyClipboardError"));
			}
		};

		const copyBtn = batchActions.createEl("button", {
			cls: "jev-key-batch-btn",
			text: `📑 ${tr("model.keyBatchCopy")}`,
		});
		copyBtn.onclick = async () => {
			const keys = this.poolKeys();
			if (!keys.length) {
				new Notice(tr("model.keyEmptyNotice"));
				return;
			}
			try {
				await navigator.clipboard.writeText(keys.join("\n"));
				new Notice(tr("model.keyCopiedNotice", { count: keys.length }));
			} catch {
				new Notice(tr("model.keyClipboardError"));
			}
		};

		const clearBtn = batchActions.createEl("button", {
			cls: "mod-warning jev-key-batch-btn",
			text: tr("model.keyBatchClear"),
		});
		clearBtn.onclick = async () => {
			batchTextarea.value = "";
			await this.setPoolKeys([]);
			keyInput.value = "";
			updateCountHint(0);
			updateBatchCount(0);
		};

		const closeBtn = batchActions.createEl("button", {
			cls: "jev-key-batch-btn",
			text: tr("model.keyBatchClose"),
		});
		closeBtn.onclick = () => {
			isBatchOpen = false;
			batchContainer.style.display = "none";
			const batchBtnEl = keySetting.controlEl.querySelector("button:not(.clickable-icon)") as HTMLElement;
			if (batchBtnEl) batchBtnEl.removeClass("mod-cta");
		};

		panel.querySelectorAll<HTMLElement>(".setting-item").forEach(row => {
			const label = row.querySelector(".setting-item-name")?.textContent;
			if (label) row.querySelectorAll("input, select").forEach(control => control.setAttribute("aria-label", label));
		});
	}

	private getScrollSnapshots(): Array<{ el: HTMLElement; top: number; left: number }> {
		const snapshots: Array<{ el: HTMLElement; top: number; left: number }> = [];
		if (!this.containerEl) return snapshots;
		let el: HTMLElement | null = this.containerEl;
		while (el) {
			if (typeof el.scrollTop === "number" && (el.scrollTop > 0 || el.scrollLeft > 0)) {
				snapshots.push({ el, top: el.scrollTop, left: el.scrollLeft });
			}
			el = el.parentElement;
		}
		const tabContent = this.containerEl.closest?.(".vertical-tab-content") as HTMLElement;
		if (tabContent && !snapshots.some(s => s.el === tabContent) && typeof tabContent.scrollTop === "number") {
			snapshots.push({ el: tabContent, top: tabContent.scrollTop, left: tabContent.scrollLeft });
		}
		return snapshots;
	}

	private restoreScrollSnapshots(snapshots: Array<{ el: HTMLElement; top: number; left: number }>): void {
		if (!snapshots.length) return;
		const apply = () => {
			for (const { el, top, left } of snapshots) {
				if (top > 0) el.scrollTop = top;
				if (left > 0) el.scrollLeft = left;
			}
		};
		apply();
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(apply);
		}
		if (typeof setTimeout === "function") {
			setTimeout(apply, 10);
		}
	}

	display(): void {
		const scrollSnapshots = this.getScrollSnapshots();
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

		this.renderModels(containerEl);

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

		this.restoreScrollSnapshots(scrollSnapshots);
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

