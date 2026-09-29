import { App, setIcon, TFolder } from "obsidian";
import { Language, t, TranslationKey } from "./i18n";

/**
 * Level by level folder choice, collapsed to a single line showing the current
 * scope: the vault name by default, the folder path once one is picked. Opening
 * it reveals the list, which only ever shows the children of the selected
 * folder, so a vault with deep folder trees stays navigable instead of
 * flattening every level into one long list.
 *
 * Clicking a folder selects it as the scan scope and opens it; the breadcrumb
 * walks back up, and each row shows how many notes the choice would scan.
 */
export class ScopePicker {
	private el: HTMLElement;
	private path = "";
	private open = false;
	private disabled = false;

	constructor(
		private app: App,
		container: HTMLElement,
		private language: () => Language,
		private onChange: (path: string) => void,
		private countNotes: (path: string) => number,
	) {
		this.el = container.createDiv({ cls: "jev-scope is-collapsed" });
		this.render();
	}

	get value(): string {
		return this.path;
	}

	setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.el.classList.toggle("is-disabled", disabled);
		this.el.querySelectorAll("button").forEach(button => { (button as HTMLButtonElement).disabled = disabled; });
		this.el.querySelector(".jev-scope-toggle")?.setAttribute("aria-disabled", String(disabled));
	}

	private tr(key: TranslationKey, params?: Record<string, string | number>): string {
		return t(this.language(), key, params);
	}

	private childFolders(): TFolder[] {
		const parent = this.path ? this.app.vault.getAbstractFileByPath(this.path) : this.app.vault.getRoot();
		if (!(parent instanceof TFolder)) return [];
		return parent.children
			.filter((child): child is TFolder => child instanceof TFolder)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	private enter(path: string) {
		this.path = path;
		this.onChange(path);
		this.render();
	}

	private render() {
		this.el.empty();
		this.el.toggleClass("is-collapsed", !this.open);
		this.renderToggle();
		if (!this.open) return;
		this.el.createDiv({ cls: "jev-scope-desc", text: this.tr("batch.scopeDesc") });
		this.renderTrail();
		this.renderList();
	}

	private renderToggle() {
		const label = this.path || this.app.vault.getName();
		const toggle = this.el.createDiv({
			cls: "jev-scope-toggle",
			attr: {
				role: "button",
				tabindex: this.disabled ? "-1" : "0",
				"aria-expanded": String(this.open),
				"aria-disabled": String(this.disabled),
				"aria-label": this.tr("batch.scopeToggle", { name: label }),
			},
		});
		setIcon(toggle, this.open ? "folder-open" : "folder");
		toggle.createSpan({ cls: "jev-scope-name", text: label });
		toggle.createSpan({ cls: "jev-scope-count", text: this.tr("batch.scopeNotes", { count: this.countNotes(this.path) }) });
		setIcon(toggle.createSpan({ cls: "jev-scope-caret" }), this.open ? "chevron-up" : "chevron-down");
		const flip = () => {
			if (this.disabled) return;
			this.open = !this.open;
			this.render();
		};
		toggle.onclick = flip;
		toggle.onkeydown = event => {
			if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); }
		};
	}

	private renderTrail() {
		const trail = this.el.createDiv({ cls: "jev-scope-trail" });
		this.crumb(trail, "", this.tr("batch.scopeAll"), this.path === "");
		let prefix = "";
		for (const segment of this.path.split("/").filter(Boolean)) {
			prefix = prefix ? `${prefix}/${segment}` : segment;
			trail.createSpan({ cls: "jev-scope-sep", text: "/" });
			this.crumb(trail, prefix, segment, prefix === this.path);
		}
	}

	private renderList() {
		const list = this.el.createDiv({ cls: "jev-scope-list" });
		if (this.path) {
			const up = list.createDiv({ cls: "jev-scope-row" });
			const parent = this.path.split("/").slice(0, -1).join("/");
			this.pick(up, "corner-up-left", this.tr("batch.scopeUp"), "", () => this.enter(parent));
		}
		const children = this.childFolders();
		if (!children.length) {
			list.createDiv({ cls: "jev-scope-empty", text: this.tr("batch.scopeEmpty") });
		}
		for (const child of children) {
			const row = list.createDiv({ cls: "jev-scope-row" });
			this.pick(row, "folder", child.name, this.tr("batch.scopeNotes", { count: this.countNotes(child.path) }), () => this.enter(child.path));
		}
	}

	private crumb(trail: HTMLElement, path: string, label: string, current: boolean) {
		const crumb = trail.createEl("button", { cls: `jev-scope-crumb${current ? " is-current" : ""}`, text: label });
		crumb.onclick = () => this.enter(path);
	}

	private pick(row: HTMLElement, icon: string, label: string, meta: string, onPick: () => void) {
		const button = row.createEl("button", { cls: "jev-scope-pick" });
		setIcon(button, icon);
		button.createSpan({ cls: "jev-scope-name", text: label });
		if (meta) button.createSpan({ cls: "jev-scope-count", text: meta });
		button.onclick = onPick;
	}
}
