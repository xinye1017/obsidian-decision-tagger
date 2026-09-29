import { BatchTagModal } from '../src/batchTagModal';
import { TagSuggestModal } from '../src/tagSuggestModal';
import { JevTaggerSettingTab } from '../src/settings';
import { KeyPool } from '../src/keyPool';
import Plugin from '../src/main';
import { TFile, TFolder } from './obsidian-preview';
const tags = ['人工智能', '知识管理', '产品设计', '研究笔记', '学习方法', '软件开发', '阅读', '日常记录'].map(name => ({ name, enabled: true, instructions: name, matchCriteria: name, otherCriteria: '其他' }));
const files = ['如何构建可靠的 AI 工作流', '知识库的组织与检索', '设计中的信息层级', '本周阅读记录', '模型评估与决策', '项目复盘'].map(name => new TFile(`研究笔记/${name}.md`, name));
// Nested folders so the scope picker can be walked level by level in the preview.
const folderPaths = ['工作', '工作/项目 Alpha', '工作/项目 Beta', '工作/归档', '工作/归档/2024', '工作/归档/2025', '工作/归档/模板', '生活', '研究笔记'];
const folders = new Map(folderPaths.map(path => [path, new TFolder(path)]));
const root = new TFolder('/');
for (const [path, folder] of folders) {
 const parent = path.includes('/') ? folders.get(path.split('/').slice(0, -1).join('/'))! : root;
 parent.children.push(folder);
}
const plugin = new Plugin({} as any, {} as any);
plugin.settings = { provider: 'openrouter', apiKeys: { typesafe: [], openrouter: ['sk-or-v1-a1b2c3d4e5f6g7h8', 'sk-or-v1-z9y8x7w6v5u4t3s2'] }, models: [{ id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/alpha/decisions', model: 'respan/span-01-lite:free' }], activeModelId: 'openrouter', language: 'zh', confidenceThreshold: .7, tags };
plugin.keyPool = new KeyPool(['sk-or-v1-a1b2c3d4e5f6g7h8', 'sk-or-v1-z9y8x7w6v5u4t3s2']);
plugin.keyPool.record(plugin.keyPool.keys[0], 'healthy', 812);
plugin.keyPool.record(plugin.keyPool.keys[1], 'limited', 0, 429);
const app: any = { vault: {
  getMarkdownFiles: () => files,
  getAllLoadedFiles: () => [...folders.values()],
  getRoot: () => root,
  getName: () => 'lixinye',
  getAbstractFileByPath: (path: string) => folders.get(path) ?? null,
}, metadataCache: { getFileCache: () => ({ frontmatter: { tags: ['阅读'] } }) } };
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
