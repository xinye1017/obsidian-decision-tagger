import { BatchTagModal } from '../src/batchTagModal';
import { TagSuggestModal } from '../src/tagSuggestModal';
import { JevTaggerSettingTab } from '../src/settings';
import Plugin from '../src/main';
import { TFile, TFolder } from './obsidian-preview';
const tags = ['人工智能', '知识管理', '产品设计', '研究笔记', '学习方法', '软件开发', '阅读', '日常记录'].map(name => ({ name, enabled: true, instructions: name, matchCriteria: name, otherCriteria: '其他' }));
const files = ['如何构建可靠的 AI 工作流', '知识库的组织与检索', '设计中的信息层级', '本周阅读记录', '模型评估与决策', '项目复盘'].map(name => new TFile(`研究笔记/${name}.md`, name));
const plugin = new Plugin({} as any, {} as any);
plugin.settings = { models: [{ id: 'preview', name: '我的决策模型', endpoint: 'http://127.0.0.1:3000', model: 'respan/span-01-lite:free', apiKey: 'sk-preview' }], activeModelId: 'preview', language: 'zh', confidenceThreshold: .7, tags };
const app: any = { vault: { getMarkdownFiles: () => files, getAllLoadedFiles: () => [new TFolder('研究笔记'), new TFolder('归档')] }, metadataCache: { getFileCache: () => ({ frontmatter: { tags: ['阅读'] } }) } };
plugin.app = app;
plugin.saveSettings = async () => {};
plugin.detectAndSyncVaultTags = async () => ({ added: 0, total: 8 });
plugin.evaluateFile = async (file, session, signal, stage) => {
 stage?.('reading'); await new Promise(resolve => setTimeout(resolve, 150));
 stage?.('evaluating'); await new Promise(resolve => setTimeout(resolve, 1600));
 if (file.basename.includes('本周')) throw new Error('模拟服务暂时不可用');
 return tags.map((tag, index) => ({ tagName: tag.name, probability: [0.96, 0.87, 0.76, 0.58, 0.32, 0.21, 0.12, 0.04][index], confidence: .9, isMatch: index < 3, description: ['内容主要围绕 AI 工作流的构建与模型决策。', '涉及知识的组织方式和高效检索。', '包含信息层级与交互设计的讨论。'][index] || '与笔记主题的关联较弱。' }));
};
plugin.addTagToFile = async () => { await new Promise(resolve => setTimeout(resolve, 180)); return true; };
let current: any;
function open(kind: string) {
 current?.onClose?.();
 document.querySelector('#surface')!.className = '';
 document.querySelector('#surface')!.replaceChildren();
 if (kind === 'settings') { current = new JevTaggerSettingTab(app, plugin); current.display(); }
 else { current = kind === 'note' ? new TagSuggestModal(app, plugin, files[0] as any) : new BatchTagModal(app, plugin); current.open(); }
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => open((button as HTMLElement).dataset.view!)));
document.querySelector('#theme')!.addEventListener('click', () => document.body.classList.toggle('dark'));
document.querySelector('#language')!.addEventListener('click', () => { plugin.settings.language = plugin.settings.language === 'zh' ? 'en' : 'zh'; open('settings'); });
open('batch');
