// Browser-only Obsidian host shim. No vault or remote API is accessed.
const proto = HTMLElement.prototype as any;
proto.createEl = function(tag: string, options: any = {}) {
 const node = document.createElement(tag);
 if (options.cls) node.className = options.cls;
 if (options.text) node.textContent = options.text;
 for (const [name, value] of Object.entries(options.attr || {})) node.setAttribute(name, String(value));
 this.append(node); return node;
};
proto.createDiv = function(options: any) { return this.createEl('div', typeof options === 'string' ? { cls: options } : options); };
proto.createSpan = function(options: any) { return this.createEl('span', options); };
proto.empty = function() { this.replaceChildren(); };
proto.setText = function(text: string) { this.textContent = text; };
proto.addClass = function(name: string) { this.classList.add(name); };
proto.toggleClass = function(name: string, active: boolean) { this.classList.toggle(name, active); };
export class App {}
export class TFile { extension = 'md'; constructor(public path: string, public basename: string) {} }
export class TFolder { constructor(public path: string) {} }
export class Plugin {}
export class Notice { constructor(public text: string) { document.querySelector('#notice')!.textContent = text; } }
export const getAllTags = () => [];
export const requestUrl = async () => ({ status: 200, json: { choices: [{ message: { content: '{"results":[{"tagName":"test","isMatch":true,"probability":0.99,"reason":"Test"}]}' } }] } });
export class Modal {
 modalEl: HTMLElement; contentEl: HTMLElement;
 constructor(public app: any) {
  this.modalEl = document.createElement('section'); this.modalEl.className = 'modal';
  this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
 }
 open() { document.querySelector('#surface')!.replaceChildren(this.modalEl); (this as any).onOpen(); }
 close() { (this as any).onClose(); this.modalEl.remove(); }
}
export class PluginSettingTab {
 containerEl: HTMLElement;
 constructor(public app: any, public plugin: any) { this.containerEl = document.querySelector('#surface') as HTMLElement; }
}
class Control {
 inputEl: HTMLInputElement; selectEl: HTMLSelectElement; toggleEl: HTMLElement; buttonEl: HTMLButtonElement;
 constructor(public el: any) { this.inputEl = el; this.selectEl = el; this.toggleEl = el; this.buttonEl = el; }
 setValue(value: any) { if (this.el.type === 'checkbox') this.el.checked = value; else this.el.value = value; return this; }
 onChange(callback: any) { this.el.onchange = () => callback(this.el.type === 'checkbox' ? this.el.checked : this.el.type === 'range' ? Number(this.el.value) : this.el.value); this.el.oninput = this.el.onchange; return this; }
 addOption(value: string, label: string) { const option = document.createElement('option'); option.value = value; option.textContent = label; this.el.append(option); return this; }
 setButtonText(value: string) { this.el.textContent = value; return this; }
 setIcon(value: string) { this.el.textContent = value === 'plus' ? '+' : '◉'; return this; }
 setTooltip(value: string) { this.el.title = value; this.el.setAttribute('aria-label', value); return this; }
 setDisabled(value: boolean) { this.el.disabled = value; return this; }
 setCta() { this.el.classList.add('mod-cta'); return this; }
 onClick(callback: any) { this.el.onclick = callback; return this; }
 setPlaceholder(value: string) { this.el.placeholder = value; return this; }
 setLimits(min: number, max: number, step: number) { Object.assign(this.el, { min, max, step }); return this; }
 setDynamicTooltip() { return this; }
}
export class Setting {
 settingEl: HTMLElement; info: HTMLElement; nameEl: HTMLElement; desc: HTMLElement; controlEl: HTMLElement;
 constructor(container: HTMLElement) {
  this.settingEl = container.createDiv({ cls: 'setting-item' }); this.info = this.settingEl.createDiv({ cls: 'setting-item-info' });
  this.nameEl = this.info.createDiv({ cls: 'setting-item-name' }); this.desc = this.info.createDiv({ cls: 'setting-item-description' });
  this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
 }
 setName(value: string) { this.nameEl.setText(value); return this; }
 setDesc(value: string) { this.desc.setText(value); return this; }
 setHeading() { this.settingEl.classList.add('setting-item-heading'); return this; }
 control(tag: string, callback: any, type?: string) { const node = document.createElement(tag); if (type) (node as HTMLInputElement).type = type; node.setAttribute('aria-label', this.nameEl.textContent || 'Action'); this.controlEl.append(node); callback(new Control(node)); return this; }
 addDropdown(callback: any) { return this.control('select', callback); }
 addText(callback: any) { return this.control('input', callback, 'text'); }
 addButton(callback: any) { return this.control('button', callback); }
 addExtraButton(callback: any) { return this.control('button', callback); }
 addToggle(callback: any) { return this.control('input', callback, 'checkbox'); }
 addSlider(callback: any) { return this.control('input', callback, 'range'); }
}
