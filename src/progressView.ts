import { t, Language } from "./i18n";

export type EvaluationStage = "reading" | "evaluating" | "writing" | "done";

/**
 * One live status line plus the completion bar. The stage name is carried by
 * the status text itself, which keeps the panel to two compact rows instead of
 * repeating the same three stage labels in a separate track.
 */
export class ProgressView {
	readonly status: HTMLElement;
	private bar: HTMLProgressElement;
	private percentage: HTMLElement;
	constructor(container: HTMLElement, language: Language) {
		const panel = container.createDiv({ cls: "jev-progress-panel" });
		const heading = panel.createDiv({ cls: "jev-progress-heading" });
		this.status = heading.createDiv({ cls: "jev-progress-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
		this.percentage = heading.createSpan({ cls: "jev-progress-percent" });
		this.bar = panel.createEl("progress", { cls: "jev-native-progress", attr: { max: "100", value: "0", "aria-label": t(language, "progress.completed") } });
	}
	update(completed: number, total: number) {
		this.bar.value = total > 0 ? Math.floor(completed / total * 100) : 0;
		this.percentage.setText(`${this.bar.value}%`);
	}
	/** Unknown total: a moving bar with no percentage, used by the single note flow. */
	indeterminate() {
		this.bar.removeAttribute("value");
		this.percentage.setText("");
	}
}

export function duration(milliseconds: number): string {
	const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
