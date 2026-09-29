import { App, Modal, Notice, TFile } from "obsidian";
import type { NoteEvaluationResult } from "./jevClient";
import type JevTaggerPlugin from "./main";
import { t, TranslationKey } from "./i18n";
import { isEligible, ModelError } from "./modelClient";
import { ProgressView } from "./progressView";

export class TagSuggestModal extends Modal {
	private results: NoteEvaluationResult[] = [];
	private existingTags = new Set<string>();
	private controller?: AbortController;
	private closed = false;
	private writing = false;
	private threshold: number;
	private modelName = "";
	private error = "";
	constructor(app: App, private plugin: JevTaggerPlugin, private file: TFile) { super(app); }
	private tr(key: TranslationKey, params?: Record<string, string | number>): string { return t(this.plugin.settings.language, key, params); }
	private header(subtitle: string) {
		const header = this.contentEl.createDiv({ cls: "jev-tagger-header" });
		header.createDiv({ cls: "jev-eyebrow", text: "DECISION TAGGER / NOTE" });
		header.createEl("h2", { text: this.file.basename });
		header.createDiv({ cls: "jev-tagger-subtitle", text: subtitle });
		header.createDiv({ cls: "jev-model-label", text: this.modelName });
	}
	async onOpen() {
		this.closed = false;
		this.modalEl.addClass("jev-modal-shell");
		this.contentEl.addClass("jev-tagger-modal");
		await this.analyze();
	}
	private async analyze() {
		this.error = "";
		this.contentEl.empty();
		this.modelName = `${this.plugin.activeModel.name} · ${this.plugin.activeModel.model}`;
		this.header(this.tr("tagSuggest.loadingSubtitle"));
		const progress = new ProgressView(this.contentEl, this.plugin.settings.language);
		progress.indeterminate();
		const close = this.contentEl.createEl("button", { text: this.tr("tagSuggest.close") });
		close.onclick = () => this.close();
		this.controller = this.plugin.createController();
		try {
			const session = this.plugin.createEvaluationSession();
			this.threshold = session.threshold;
			const cache = this.app.metadataCache.getFileCache(this.file);
			const raw = cache?.frontmatter?.tags;
			this.existingTags = new Set((Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/) : []).map(tag => tag.replace(/^#/, "")));
			this.results = await this.plugin.evaluateFile(this.file, session, this.controller.signal, stage => {
				if (this.closed) return;
				progress.status.setText(this.tr(`progress.${stage}`));
			});
			if (!this.closed) this.renderResults();
		} catch (error) {
			if (this.closed || (error instanceof ModelError && error.code === "cancelled")) return;
			this.contentEl.empty(); this.header(this.tr("tagSuggest.loadingSubtitle"));
			this.contentEl.createDiv({ cls: "jev-inline-error", text: this.tr("tagSuggest.analysisFailed", { error: this.plugin.errorText(error) }), attr: { role: "alert" } });
			const footer = this.contentEl.createDiv({ cls: "jev-actions-footer" });
			footer.createEl("button", { text: this.tr("tagSuggest.close") }).onclick = () => this.close();
			footer.createEl("button", { text: this.tr("result.retry"), cls: "mod-cta" }).onclick = () => this.analyze();
		} finally { this.plugin.releaseController(this.controller); }
	}
	private renderResults() {
		if (this.closed) return;
		this.contentEl.empty();
		this.header(this.tr("tagSuggest.resultSubtitle", { threshold: Math.round(this.threshold * 100) }));
		const recommended = this.results.filter(result => isEligible(result, this.threshold));
		const other = this.results.filter(result => !isEligible(result, this.threshold));
		this.contentEl.createDiv({ cls: "jev-result-summary", text: this.tr("result.summary", { count: recommended.length, total: this.results.length }), attr: { tabindex: "-1" } });
		this.contentEl.createDiv({ cls: "jev-score-note", text: this.tr("result.scoreNote") });
		if (this.error) this.contentEl.createDiv({ cls: "jev-inline-error", text: this.error, attr: { role: "alert" } });
		const list = this.contentEl.createDiv({ cls: "jev-tag-list" });
		if (!recommended.length) list.createDiv({ cls: "jev-tag-empty-state", text: this.tr("tagSuggest.empty") });
		recommended.forEach(result => this.renderTag(list, result, true));
		if (other.length) {
			const details = this.contentEl.createEl("details", { cls: "jev-other-results" });
			details.createEl("summary", { text: this.tr("result.low", { count: other.length }) });
			details.createDiv({ cls: "jev-score-note", text: this.tr("result.lowHint") });
			other.forEach(result => this.renderTag(details, result, false));
		}
		const footer = this.contentEl.createDiv({ cls: "jev-actions-footer" });
		footer.createEl("button", { text: this.tr("tagSuggest.close") }).onclick = () => this.close();
		const pending = recommended.filter(result => !this.existingTags.has(result.tagName));
		if (pending.length) {
			const button = footer.createEl("button", { cls: "mod-cta", text: this.tr("tagSuggest.applyAllButton", { count: pending.length }) });
			button.disabled = this.writing;
			button.onclick = () => this.apply(pending.map(result => result.tagName));
		}
	}
	private renderTag(container: HTMLElement, result: NoteEvaluationResult, recommended: boolean) {
		const existing = this.existingTags.has(result.tagName);
		const row = container.createDiv({ cls: `jev-tag-item ${recommended ? "is-recommended" : "is-muted"}` });
		const info = row.createDiv({ cls: "jev-tag-info" });
		const name = info.createDiv({ cls: "jev-tag-name-row" });
		name.createSpan({ cls: "jev-tag-badge", text: `#${result.tagName}` });
		name.createSpan({ cls: "jev-tag-existing", text: this.tr(existing ? "tagSuggest.alreadyTagged" : recommended ? "result.recommended" : "result.below") });
		info.createDiv({ cls: "jev-tag-desc", text: result.description });
		const track = info.createDiv({ cls: "jev-score-track" });
		track.createEl("meter", { cls: "jev-score-meter", attr: { min: "0", max: "1", value: String(result.probability), "aria-label": `#${result.tagName}`, "aria-valuetext": `${Math.round(result.probability * 100)}%` } });
		const marker = track.createSpan({ cls: "jev-threshold-marker", attr: { "aria-hidden": "true" } });
		marker.style.left = `${this.threshold * 100}%`;
		const actions = row.createDiv({ cls: "jev-tag-actions" });
		actions.createSpan({ cls: "jev-confidence-score", text: `${Math.round(result.probability * 100)}%` });
		if (!existing) {
			const button = actions.createEl("button", { cls: "jev-btn-add", text: this.tr("tagSuggest.addButton"), attr: { "aria-label": `${this.tr("tagSuggest.addButton")} #${result.tagName}` } });
			button.disabled = this.writing;
			button.onclick = () => this.apply([result.tagName]);
		}
	}
	private async apply(tags: string[]) {
		if (this.writing || this.closed) return;
		this.writing = true; this.error = "";
		this.contentEl.querySelectorAll<HTMLButtonElement>(".jev-btn-add, .mod-cta").forEach(button => button.disabled = true);
		let added = 0;
		try {
			for (const tag of tags) {
				if (this.closed) break;
				if (await this.plugin.addTagToFile(this.file, tag)) added++;
				this.existingTags.add(tag);
			}
			if (added) new Notice(this.tr("notice.applyAllSuccess", { count: added }));
		} catch (error) { this.error = this.tr("result.writeFailed", { error: this.plugin.errorText(error) }); }
		finally {
			this.writing = false; this.renderResults();
			if (!this.closed) this.contentEl.querySelector<HTMLElement>(".jev-result-summary")?.focus();
		}
	}
	onClose() { this.closed = true; this.controller?.abort(); this.contentEl.empty(); }
}
