import { App, Modal, Notice, TFile } from "obsidian";
import type JevTaggerPlugin from "./main";
import { t, TranslationKey } from "./i18n";
import { isEligible, ModelError, validateProfile } from "./modelClient";
import { duration, ProgressView } from "./progressView";
import { ScopePicker } from "./scopePicker";

/** Hidden paths and templates are never scanned, whatever the scope is. */
export function isScannablePath(path: string): boolean {
	return !path.startsWith(".") && !path.includes("/.") && !path.includes("\\.") && !/templates|模板/i.test(path);
}

export function inBatchScope(path: string, folder: string): boolean {
	if (folder && !path.startsWith(`${folder}/`)) return false;
	return isScannablePath(path);
}

/** Notes per folder, so the scope picker can show what each choice would scan. */
export function countNotesByFolder(paths: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const path of paths) {
		if (!isScannablePath(path)) continue;
		const segments = path.split("/");
		for (let depth = segments.length - 1; depth > 0; depth--) {
			const folder = segments.slice(0, depth).join("/");
			counts.set(folder, (counts.get(folder) ?? 0) + 1);
		}
	}
	return counts;
}

export class BatchTagModal extends Modal {
	private running = false;
	private closed = false;
	private controller?: AbortController;
	private folder = "";
	private processed = 0;
	private modified = 0;
	private added = 0;
	private failed = 0;
	private unchanged = 0;
	private total = 0;
	private startedAt = 0;
	private progress: ProgressView;
	private metrics: HTMLElement[];
	private detail: HTMLElement;
	private modelLabel: HTMLElement;
	private currentFile: HTMLElement;
	private log: HTMLElement;
	private start: HTMLButtonElement;
	private stop: HTMLButtonElement;
	private picker: ScopePicker;
	private resultsSection: HTMLElement;
	private counts = new Map<string, number>();
	constructor(app: App, private plugin: JevTaggerPlugin) { super(app); }
	private tr(key: TranslationKey, params?: Record<string, string | number>) { return t(this.plugin.settings.language, key, params); }
	private files(): TFile[] { return this.app.vault.getMarkdownFiles().filter(file => inBatchScope(file.path, this.folder)); }
	private countIn = (path: string): number => (path ? this.counts.get(path) ?? 0 : this.files().length);

	onOpen() {
		this.closed = false;
		this.modalEl.addClass("jev-modal-shell");
		this.contentEl.addClass("jev-batch-modal");
		const header = this.contentEl.createDiv({ cls: "jev-tagger-header" });
		header.createDiv({ cls: "jev-eyebrow", text: "DECISION TAGGER / BATCH" });
		header.createEl("h2", { text: this.tr("batch.title") });
		this.modelLabel = header.createDiv({ cls: "jev-model-label" });
		this.updateModelLabel();
		this.counts = countNotesByFolder(this.app.vault.getMarkdownFiles().map(file => file.path));
		this.picker = new ScopePicker(
			this.app,
			this.contentEl,
			() => this.plugin.settings.language,
			path => { this.folder = path; this.ready(); },
			path => this.countIn(path),
		);
		this.progress = new ProgressView(this.contentEl, this.plugin.settings.language);
		this.currentFile = this.contentEl.createDiv({ cls: "jev-batch-current-file" });
		this.resultsSection = this.contentEl.createDiv({ cls: "jev-batch-results is-hidden" });
		const stats = this.resultsSection.createDiv({ cls: "jev-batch-stats" });
		this.metrics = (["batch.statScanned", "batch.statModified", "batch.statAdded", "batch.statFailed"] as const).map(key => {
			const metric = stats.createDiv({ cls: "jev-stat-card" });
			const value = metric.createDiv({ cls: "jev-stat-num", text: "0" });
			metric.createDiv({ cls: "jev-stat-label", text: this.tr(key) }); return value;
		});
		this.detail = this.resultsSection.createDiv({ cls: "jev-batch-detail" });
		this.resultsSection.createEl("h3", { text: this.tr("batch.logHeader"), cls: "jev-log-heading" });
		this.log = this.resultsSection.createDiv({ cls: "jev-batch-log", attr: { "aria-label": this.tr("batch.logHeader"), tabindex: "0" } });
		this.addLog(this.tr("batch.startHint"));
		const footer = this.contentEl.createDiv({ cls: "jev-actions-footer" });
		this.stop = footer.createEl("button", { text: this.tr("batch.close") });
		this.stop.onclick = () => { if (this.running) this.cancel(); else this.close(); };
		this.start = footer.createEl("button", { cls: "mod-cta", text: this.tr("batch.startButton") });
		this.start.onclick = () => this.run();
		this.ready();
	}
	private updateModelLabel(concurrency = 1) {
		const base = `${this.plugin.activeModel.model} · ${Math.round(this.plugin.settings.confidenceThreshold * 100)}%`;
		this.modelLabel.setText(concurrency > 1 ? `${base} · ${this.tr("batch.concurrency", { count: concurrency })}` : base);
	}
	private ready() {
		this.counts = countNotesByFolder(this.app.vault.getMarkdownFiles().map(file => file.path));
		this.total = this.files().length;
		this.processed = this.modified = this.added = this.failed = this.unchanged = 0;
		this.startedAt = 0;
		this.refresh(); this.currentFile.setText("");
		this.progress.status.setText(this.tr("batch.readyCount", { count: this.total }));
		this.start.disabled = this.total === 0;
	}
	private addLog(text: string, state = "neutral") {
		const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
		this.log.createDiv({ cls: `jev-log-item is-${state}`, text });
		while (this.log.children.length > 100) this.log.firstElementChild?.remove();
		if (atBottom) this.log.scrollTop = this.log.scrollHeight;
	}
	private refresh() {
		if (this.closed) return;
		[`${this.processed} / ${this.total}`, this.modified, this.added, this.failed].forEach((value, index) => this.metrics[index].setText(String(value)));
		this.progress.update(this.processed, this.total);
		const elapsed = this.startedAt ? Date.now() - this.startedAt : 0;
		const eta = this.running && this.processed > 0 ? duration(elapsed / this.processed * (this.total - this.processed)) : "—";
		this.detail.setText(this.tr("batch.timing", { elapsed: duration(elapsed), eta, unchanged: this.unchanged }));
	}
	private cancel() {
		this.controller?.abort();
		this.stop.disabled = true;
		this.progress.status.setText(this.tr("batch.stopping"));
	}
	private async run() {
		if (this.running) return;
		if (this.plugin.batchRunning) { this.progress.status.setText(this.tr("batch.busy")); return; }
		let session: ReturnType<JevTaggerPlugin["createEvaluationSession"]>;
		try { session = this.plugin.createEvaluationSession(); validateProfile(session.client.profile); }
		catch (error) { this.progress.status.setText(this.plugin.errorText(error)); return; }
		const files = this.files();
		if (!files.length) { this.ready(); return; }
		const availableKeys = session.client.pool ? session.client.pool.available().length : 1;
		const concurrency = Math.max(1, Math.min(availableKeys, files.length, 8));
		this.ready(); this.updateModelLabel(concurrency); this.log.empty();
		if (this.resultsSection) this.resultsSection.removeClass("is-hidden");
		this.running = this.plugin.batchRunning = true;
		this.controller = this.plugin.createController();
		const signal = this.controller.signal;
		this.startedAt = Date.now();
		this.start.disabled = true;
		this.picker.setDisabled(true);
		this.stop.setText(this.tr("batch.stopButton"));
		if (concurrency > 1) {
			const scopeName = this.folder || (this.app.vault.getName ? this.app.vault.getName() : "Vault");
			this.addLog(this.tr("batch.logStartParallel", { scope: scopeName, total: files.length, concurrency }));
		}
		const timer = window.setInterval(() => this.refresh(), 1000);

		let nextIndex = 0;
		const activeFiles = new Set<string>();

		const updateActiveFilesDisplay = () => {
			if (this.closed) return;
			if (activeFiles.size === 0) {
				this.currentFile.setText("");
				this.currentFile.title = "";
			} else if (concurrency === 1) {
				const path = Array.from(activeFiles)[0];
				this.currentFile.setText(path);
				this.currentFile.title = path;
			} else {
				const names = Array.from(activeFiles).map(p => {
					const parts = p.split("/");
					return parts[parts.length - 1] || p;
				});
				this.currentFile.setText(this.tr("batch.activeParallel", { count: activeFiles.size, names: names.join(", ") }));
				this.currentFile.title = Array.from(activeFiles).join("\n");
				this.progress.status.setText(this.tr("progress.evaluating"));
			}
		};

		const runWorker = async () => {
			while (nextIndex < files.length && !signal.aborted) {
				const file = files[nextIndex++];
				if (!file || signal.aborted) break;

				activeFiles.add(file.path);
				updateActiveFilesDisplay();
				const addedNames: string[] = [];
				let finished = false;
				try {
					const results = await this.plugin.evaluateFile(file, session, signal, stage => {
						if (this.closed) return;
						if (concurrency === 1) this.progress.status.setText(this.tr(`progress.${stage}`));
					});
					if (signal.aborted) break;
					const eligible = results.filter(result => isEligible(result, session.threshold));
					if (concurrency === 1) this.progress.status.setText(this.tr("progress.writing"));
					for (const result of eligible) {
						if (signal.aborted) break;
						if (await this.plugin.addTagToFile(file, result.tagName)) { this.added++; addedNames.push(result.tagName); }
					}
					if (!signal.aborted) {
						finished = true;
						if (!addedNames.length) { this.unchanged++; this.addLog(this.tr("batch.unchanged", { name: file.basename })); }
					}
				} catch (error) {
					if (error instanceof ModelError && error.code === "cancelled") break;
					this.failed++; finished = true;
					this.addLog(this.tr("batch.logError", { name: file.basename, error: this.plugin.errorText(error) }), "error");
					// Stop the run when no key can serve the request any more: a dead
					// endpoint, a dead pool, or an entire pool that is limited or broke.
					if (error instanceof ModelError && (error.code === "config" || error.code === "quota" || (error.code === "http" && [401, 402, 403, 404, 429].includes(error.status)))) this.controller?.abort();
				} finally {
					activeFiles.delete(file.path);
					updateActiveFilesDisplay();
					if (addedNames.length) { this.modified++; this.addLog(this.tr("batch.logAddedTags", { name: file.basename, tags: addedNames.map(name => `#${name}`).join(" · ") }), "success"); }
					if (finished) this.processed++;
					this.refresh();
				}
				if (signal.aborted) break;
				await new Promise(resolve => window.setTimeout(resolve, concurrency === 1 ? 80 : 30));
			}
		};

		try {
			await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
		} finally {
			window.clearInterval(timer);
			if (this.controller) this.plugin.releaseController(this.controller);
			this.running = this.plugin.batchRunning = false;
			if (!this.closed) {
				const key = signal.aborted ? "batch.cancelled" : this.failed ? "batch.withErrors" : "batch.allDone";
				this.progress.status.setText(this.tr(key, { failed: this.failed }));
				this.currentFile.setText(this.tr("batch.summary", { processed: this.processed, total: this.total, modified: this.modified, added: this.added }));
				this.refresh();
				this.start.disabled = this.stop.disabled = false;
				this.picker.setDisabled(false);
				this.start.setText(this.tr("batch.rescanButton")); this.stop.setText(this.tr("batch.close"));
				new Notice(this.tr(key, { failed: this.failed }));
			}
		}
	}
	onClose() { this.closed = true; this.controller?.abort(); this.picker?.close(); this.contentEl.empty(); }
}
