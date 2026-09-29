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
		if (disabled) this.close();
		this.el.classList.toggle("is-disabled", disabled);
		this.el.querySelectorAll("button").forEach(button => { (button as HTMLButtonElement).disabled = disabled; });
		this.el.querySelector(".jev-scope-toggle")?.setAttribute("aria-disabled", String(disabled));
	}

	close(): void {
		if (!this.open) return;
		this.open = false;
		document.removeEventListener("click", this.onDocClick);
		document.removeEventListener("keydown", this.onDocKeydown);
		this.render();
	}

	private onDocClick = (e: MouseEvent) => {
		if (!this.el.contains(e.target as Node)) {
			this.close();
		}
	};

	private onDocKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape" && this.open) {
			e.stopPropagation();
			this.close();
		}
	};

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
		const dropdown = this.el.createDiv({ cls: "jev-scope-dropdown" });
		this.renderTrail(dropdown);
		this.renderList(dropdown);
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
			if (this.open) {
				this.close();
			} else {
				this.open = true;
				document.addEventListener("click", this.onDocClick);
				document.addEventListener("keydown", this.onDocKeydown);
				this.render();
			}
		};
		toggle.onclick = flip;
		toggle.onkeydown = event => {
			if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); }
		};
	}

	private renderTrail(container: HTMLElement) {
		if (!this.path) return;
		const trail = container.createDiv({ cls: "jev-scope-trail" });
		this.crumb(trail, "", this.app.vault.getName(), false);
		let prefix = "";
		const segments = this.path.split("/").filter(Boolean);
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			prefix = prefix ? `${prefix}/${segment}` : segment;
			trail.createSpan({ cls: "jev-scope-sep", text: "/" });
			const isCurrent = i === segments.length - 1;
			this.crumb(trail, prefix, segment, isCurrent);
		}
	}

	private renderList(container: HTMLElement) {
		const list = container.createDiv({ cls: "jev-scope-list" });
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
		if (current) {
			trail.createSpan({ cls: "jev-scope-crumb is-current", text: label });
		} else {
			const crumb = trail.createEl("button", { cls: "jev-scope-crumb", text: label });
			crumb.onclick = () => this.enter(path);
		}
	}

	private pick(row: HTMLElement, icon: string, label: string, meta: string, onPick: () => void) {
		const button = row.createEl("button", { cls: "jev-scope-pick" });
		setIcon(button, icon);
		button.createSpan({ cls: "jev-scope-name", text: label });
		if (meta) button.createSpan({ cls: "jev-scope-count", text: meta });
		button.onclick = onPick;
	}
}
