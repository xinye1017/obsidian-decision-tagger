import { App, Modal, Notice, Setting } from "obsidian";
import type JevTaggerPlugin from "./main";
import type { TagDefinition } from "./jevClient";
import { t } from "./i18n";

export class TagModal extends Modal {
	plugin: JevTaggerPlugin;
	tag?: TagDefinition;
	onSaved: () => void;

	constructor(app: App, plugin: JevTaggerPlugin, tag?: TagDefinition, onSaved: () => void = () => {}) {
		super(app);
		this.plugin = plugin;
		this.tag = tag;
		this.onSaved = onSaved;
	}

	onOpen() {
		const { contentEl } = this;
		const lang = this.plugin.settings.language;
		const isEdit = !!this.tag;

		contentEl.createEl("h2", {
			text: isEdit
				? t(lang, "tagModal.editTitle", { tag: this.tag!.name })
				: t(lang, "tagModal.createTitle"),
		});

		let name = this.tag ? this.tag.name : "";
		let instructions = this.tag ? this.tag.instructions : "";
		let matchCriteria = this.tag ? this.tag.matchCriteria : "";
		let otherCriteria = this.tag ? this.tag.otherCriteria : "";

		// 1. Tag Name
		const nameSetting = new Setting(contentEl)
			.setName(t(lang, "tagModal.name"))
			.setDesc(t(lang, "tagModal.nameDesc"));

		nameSetting.addText((text) => {
			text.setPlaceholder(t(lang, "tagModal.namePlaceholder"))
				.setValue(name)
				.onChange((val) => {
					name = val;
				});
			if (isEdit) {
				text.setDisabled(true);
			}
		});

		// 2. Instructions / Question
		new Setting(contentEl)
			.setName(t(lang, "tagModal.instructions"))
			.setDesc(t(lang, "tagModal.instructionsDesc"))
			.addTextArea((ta) => {
				ta.setPlaceholder(t(lang, "tagModal.instructionsPlaceholder"))
					.setValue(instructions)
					.onChange((val) => {
						instructions = val;
					});
				ta.inputEl.rows = 2;
				ta.inputEl.addClass("jev-modal-textarea");
			});

		// 3. Match Criteria
		new Setting(contentEl)
			.setName(t(lang, "tagModal.matchCriteria"))
			.setDesc(t(lang, "tagModal.matchCriteriaDesc"))
			.addTextArea((ta) => {
				ta.setPlaceholder(t(lang, "tagModal.matchCriteriaPlaceholder"))
					.setValue(matchCriteria)
					.onChange((val) => {
						matchCriteria = val;
					});
				ta.inputEl.rows = 2;
				ta.inputEl.addClass("jev-modal-textarea");
			});

		// 4. Other Criteria
		new Setting(contentEl)
			.setName(t(lang, "tagModal.otherCriteria"))
			.setDesc(t(lang, "tagModal.otherCriteriaDesc"))
			.addTextArea((ta) => {
				ta.setPlaceholder(t(lang, "tagModal.otherCriteriaPlaceholder"))
					.setValue(otherCriteria)
					.onChange((val) => {
						otherCriteria = val;
					});
				ta.inputEl.rows = 2;
				ta.inputEl.addClass("jev-modal-textarea");
			});

		// 5. Buttons
		const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = btnContainer.createEl("button", {
			text: t(lang, "tagModal.cancelButton"),
		});
		cancelBtn.onclick = () => this.close();

		const submitBtn = btnContainer.createEl("button", {
			cls: "mod-cta",
			text: isEdit ? t(lang, "tagModal.saveButton") : t(lang, "tagModal.createButton"),
		});

		submitBtn.onclick = async () => {
			submitBtn.disabled = true;
			try {
				if (isEdit && this.tag) {
					await this.plugin.updateTagDefinition(this.tag.name, {
						instructions,
						matchCriteria,
						otherCriteria,
					});
					new Notice(t(lang, "tagModal.editSuccess", { tag: this.tag.name }));
				} else {
					const cleanName = name.replace(/^#/, "").trim();
					await this.plugin.addTagDefinition({
						name: cleanName,
						instructions,
						matchCriteria,
						otherCriteria,
						enabled: true,
					});
					new Notice(t(lang, "tagModal.createSuccess", { tag: cleanName }));
				}
				this.onSaved();
				this.close();
			} catch (err: any) {
				new Notice(err?.message || String(err));
				submitBtn.disabled = false;
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
