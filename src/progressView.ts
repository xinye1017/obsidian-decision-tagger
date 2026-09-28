import { t, Language } from "./i18n";

export type EvaluationStage = "reading" | "evaluating" | "writing" | "done";

export class ProgressView {
	private stages: HTMLElement[];
	readonly status: HTMLElement;
	private bar: HTMLProgressElement;
	private percentage: HTMLElement;
	constructor(container: HTMLElement, private language: Language) {
		const panel = container.createDiv({ cls: "jev-progress-panel" });
		const track = panel.createDiv({ cls: "jev-stage-track", attr: { "aria-label": t(language, "progress.stages") } });
		this.stages = (["reading", "evaluating", "writing"] as const).map((stage, index) => {
			const item = track.createDiv({ cls: "jev-stage" });
			item.createSpan({ cls: "jev-stage-number", text: String(index + 1), attr: { "aria-hidden": "true" } });
			item.createSpan({ text: t(language, `progress.${stage}`) });
			return item;
		});
		const heading = panel.createDiv({ cls: "jev-progress-heading" });
		this.status = heading.createDiv({ cls: "jev-progress-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
		this.percentage = heading.createSpan({ cls: "jev-progress-percent" });
		this.bar = panel.createEl("progress", { cls: "jev-native-progress", attr: { max: "100", value: "0", "aria-label": t(language, "progress.completed") } });
	}
	stage(stage?: EvaluationStage) {
		const current = stage ? ["reading", "evaluating", "writing", "done"].indexOf(stage) : -1;
		this.stages.forEach((item, index) => {
			item.toggleClass("is-active", index === current);
			item.toggleClass("is-complete", current > index);
			if (index === current) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
		});
	}
	update(completed: number, total: number) {
		const value = total > 0 ? Math.floor(completed / total * 100) : 0;
		this.bar.value = value;
		this.percentage.setText(`${value}%`);
	}
	indeterminate() { this.bar.removeAttribute("value"); this.percentage.setText(""); }
}

export function duration(milliseconds: number): string {
	const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
