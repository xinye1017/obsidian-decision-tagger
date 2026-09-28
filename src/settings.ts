import { App, PluginSettingTab, Setting } from "obsidian";
import type JevTaggerPlugin from "./main";
import type { TagDefinition } from "./jevClient";
import { BatchTagModal } from "./batchTagModal";
import { Language, LANGUAGES, LANGUAGE_OPTIONS, TranslationKey, t } from "./i18n";
import { defaultProfile, ModelClient, ModelProfile, ModelProvider, PROVIDERS } from "./modelClient";

export interface JevTaggerSettings {
	provider: ModelProvider;
	apiKeys: Record<ModelProvider, string>;
	models: ModelProfile[];
	activeModelId: string;
	language: Language;
	confidenceThreshold: number;
	tags: TagDefinition[];
}

export const DEFAULT_SETTINGS: JevTaggerSettings = {
	provider: "typesafe",
	apiKeys: {
		typesafe: "",
		openrouter: "",
	},
	models: [
		{ id: "typesafe", name: "TypeSafe", endpoint: PROVIDERS.typesafe.endpoint, model: PROVIDERS.typesafe.model, apiKey: "" },
		{ id: "openrouter", name: "OpenRouter", endpoint: PROVIDERS.openrouter.endpoint, model: PROVIDERS.openrouter.model, apiKey: "" },
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

	private renderModels(container: HTMLElement) {
		const lang = this.plugin.settings.language;
		const tr = (key: TranslationKey, params?: Record<string, string | number>) => t(lang, key, params);
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

		// 2. Model (Fixed display)
		new Setting(panel)
			.setName(tr("model.id"))
			.setDesc(tr("model.modelFixedDesc"))
			.addText(text => {
				text.setValue(profile.model);
				text.inputEl.disabled = true;
				text.inputEl.addClass("is-disabled");
			});

		// 3. Base URL (Fixed display)
		new Setting(panel)
			.setName(tr("model.endpoint"))
			.setDesc(tr("model.baseurlFixedDesc"))
			.addText(text => {
				text.setValue(profile.endpoint);
				text.inputEl.disabled = true;
				text.inputEl.addClass("is-disabled");
			});

		// 4. API Key
		let input: HTMLInputElement;
		new Setting(panel)
			.setName("API Key")
			.setDesc(tr("model.keyDesc"))
			.addText(text => {
				input = text.inputEl;
				input.type = "password";
				input.autocomplete = "off";
				text.setPlaceholder(activeProvider === "openrouter" ? "sk-or-v1-..." : "apikey_...");
				text.setValue(profile.apiKey).onChange(async value => {
					const val = value.trim();
					profile.apiKey = val;
					if (!this.plugin.settings.apiKeys) {
						this.plugin.settings.apiKeys = { typesafe: "", openrouter: "" };
					}
					this.plugin.settings.apiKeys[this.plugin.settings.provider] = val;
					const found = this.plugin.settings.models.find(m => m.id === this.plugin.settings.provider);
					if (found) found.apiKey = val;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton(button => button.setIcon("eye-off").setTooltip(tr("settings.apiKey.toggleTooltip")).onClick(() => {
				input.type = input.type === "password" ? "text" : "password";
				button.setIcon(input.type === "password" ? "eye-off" : "eye");
			}));

		// 5. Test Connection
		const status = panel.createDiv({ cls: "jev-model-status", attr: { role: "status", "aria-live": "polite" } });
		new Setting(panel)
			.setDesc(tr("model.testDesc"))
			.addButton(button => button.setButtonText(tr("model.test")).setCta().onClick(async () => {
				button.setDisabled(true);
				status.setText(tr("model.testing"));
				const controller = this.plugin.createController();
				try {
					const detected = await new ModelClient(profile).detect(controller.signal);
					status.setText(tr("model.testOk", { model: detected.model }));
				} catch (error) {
					status.setText(this.plugin.errorText(error));
				} finally {
					button.setDisabled(false);
					this.plugin.releaseController(controller);
				}
			}));

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

				// Left: Tag pill with # symbol
				const chip = tagCard.createDiv({ cls: "jev-tag-card-chip" });
				chip.createSpan({ cls: "jev-tag-hash", text: "#" });
				const nameEl = chip.createSpan({ cls: "jev-tag-name", text: tag.name });
				if (tag.instructions) {
					nameEl.title = tag.instructions;
				}

				// Right: Toggle
				const toggleContainer = tagCard.createDiv({ cls: "jev-tag-card-toggle" });
				new Setting(toggleContainer).addToggle((toggle) => {
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
				});
			});
		} else {
			// Empty state guidance card
			const emptyEl = containerEl.createDiv({ cls: "jev-tag-empty-state" });
			emptyEl.createEl("div", {
				cls: "jev-tag-empty-text",
				text: t(lang, "settings.tagLibrary.empty"),
			});
		}
	}
}
