import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: `export * from './src/modelClient'; export * from './src/keyPool'; export * from './src/keyProbe'; export * from './src/frontmatter'; export * from './src/batchTagModal'; export {default as PluginClass} from './src/main';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false });
const element = () => ({ text: '', setText(value) { this.text = value; }, empty() {}, title: '', disabled: false });
function load(request = async () => ({ status: 200, json: {} }), timers = {}) {
 const module = { exports: {} };
 const obsidian = { requestUrl: request, Modal: class { constructor(app) { this.app = app; } }, Plugin: class {}, PluginSettingTab: class {}, Notice: class {}, TFolder: class {}, getAllTags: cache => cache.tags || [] };
 vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console, ...timers });
 return module.exports;
}
const tag = (name = 'AI') => ({ name, enabled: true, instructions: 'Classify', matchCriteria: 'AI research', otherCriteria: 'Other topics' });
const decision = (overrides = {}) => ({ tagName: 'AI', isMatch: true, probability: .9, reason: 'Relevant', ...overrides });
const answer = (overrides = {}) => ({ answers: { q_AI: { type: 'choice', choice: 'match', confidence: .9, probabilities: { match: .9, other: .1 }, ...overrides } } });
const profile = { id: 'local', name: 'Local', endpoint: 'http://localhost:1234', model: 'test-model' };
/** A client bound to `keys`, which is where credentials live now. */
const client = (api, source = profile, keys = ['test-key']) => new api.ModelClient(source, keys instanceof api.KeyPool ? keys : new api.KeyPool(keys));

test('legacy credentials and endpoint migrate without replacing custom profiles', () => {
 const api = load();
 const migrated = api.migrateModels({ apiKey: 'test-key', endpoint: 'https://example.test/custom' });
 assert.deepEqual([...migrated.apiKeys.typesafe], ['test-key']); assert.equal(migrated.models[0].endpoint, 'https://example.test/custom');
 const pooled = api.migrateModels({ apiKeys: { openrouter: ['a', 'b', 'a'] }, provider: 'openrouter' });
 assert.deepEqual([...pooled.apiKeys.openrouter], ['a', 'b']);
 const custom = api.migrateModels({ models: [{ ...profile, protocol: 'openai' }], activeModelId: 'missing' });
 assert.equal(custom.activeModelId, 'local'); assert.notEqual(custom.models[0], profile);
 assert.deepEqual(Object.keys(custom.models[0]).sort(), ['endpoint', 'id', 'model', 'name']);
 assert.deepEqual([...api.migrateModels({ models: [{ id: 'openrouter', apiKey: 'legacy-or' }], activeModelId: 'openrouter' }).apiKeys.openrouter], ['legacy-or']);
});
test('base URLs resolve to the decisions endpoint while full decision endpoints are kept', () => {
 const { resolveEndpoint, validateProfile } = load();
 assert.equal(resolveEndpoint(profile), 'http://localhost:1234/api/alpha/decisions');
 assert.equal(resolveEndpoint({ ...profile, endpoint: 'http://localhost:1234/' }), 'http://localhost:1234/api/alpha/decisions');
 assert.equal(resolveEndpoint({ ...profile, endpoint: 'https://openrouter.ai/api' }), 'https://openrouter.ai/api/alpha/decisions');
 assert.equal(resolveEndpoint({ ...profile, endpoint: 'https://openrouter.ai/api/v1' }), 'https://openrouter.ai/api/v1/alpha/decisions');
 assert.equal(resolveEndpoint({ ...profile, endpoint: 'https://api.typesafe.ai/v1/systemone' }), 'https://api.typesafe.ai/v1/systemone');
 assert.equal(resolveEndpoint({ ...profile, endpoint: 'https://example.test/api/alpha/decisions/?version=1' }), 'https://example.test/api/alpha/decisions?version=1');
 assert.throws(() => validateProfile({ ...profile, endpoint: 'ftp://example.test' }), e => e.code === 'config');
 assert.throws(() => validateProfile({ ...profile, endpoint: 'https://user:pass@example.test/v1' }), e => e.code === 'config');
});
test('choice answers map to match probabilities and respect both match flag and threshold', () => {
 const api = load();
 const result = api.parseResults(answer(), [tag()])[0];
 assert.equal(result.probability, .9); assert.equal(result.isMatch, true); assert.equal(result.description, 'AI research');
 assert.equal(api.isEligible(result, .7), true);
 const negative = api.parseResults({ answers: { q_AI: { choice: 'other', confidence: .9 } } }, [tag()])[0];
 assert.ok(negative.probability < .11); assert.equal(negative.isMatch, false); assert.equal(api.isEligible(negative, .1), false);
 assert.equal(api.parseResults({ answers: { q_AI: { choice: 'match', confidence: .7 } } }, [tag()])[0].probability, .7);
});
test('malformed, incomplete and out-of-range decision answers fail closed', () => {
 const { parseResults } = load();
 for (const data of [{}, { answers: {} }, answer({ choice: 'maybe' }), answer({ probabilities: { match: 90 } }), answer({ choice: 'other', confidence: '0.9' }), answer({ choice: 'match', confidence: 2 })]) {
  assert.throws(() => parseResults(data, [tag()]), e => e.code === 'response');
 }
 assert.equal(parseResults(answer(), [tag(), { ...tag('off'), enabled: false }]).length, 1);
});
test('detection reports the served decision model and omits an unset model ID', async () => {
 let request;
 const api = load(async value => { request = value; return { status: 200, json: { model: 'span-01-lite', answers: { q_detect: { type: 'choice', choice: 'other', confidence: .8 } }, usage: { input_tokens: 42 } } }; });
 const detected = await client(api, { ...profile, model: '' }).detect();
 assert.equal(detected.model, 'span-01-lite'); assert.equal(detected.inputTokens, 42); assert.ok(detected.probability < .21);
 const payload = JSON.parse(request.body);
 assert.equal('model' in payload, false);
 assert.equal(payload.questions.q_detect.type, 'choice'); assert.equal(payload.questions.q_detect.criteria.match, 'Software testing');
 assert.equal(request.url, 'http://localhost:1234/api/alpha/decisions');
 assert.equal(request.headers.Authorization, 'Bearer test-key');
 assert.equal(api.servedModel({ model: '' }, 'fallback'), 'fallback');
 const failing = load(async () => ({ status: 200, json: { answers: {} } }));
 await assert.rejects(client(failing, { ...profile, model: '' }).detect(), e => e.code === 'response');
});
test('decision requests use the snapshot model, enabled rules and optional authentication', async () => {
 let request;
 const api = load(async value => { request = value; return { status: 200, json: answer() }; });
 const source = { ...profile }; const bound = client(api, source); source.model = 'changed';
 await bound.evaluateNote({ title: 'Synthetic' }, [tag(), { ...tag('off'), enabled: false }]);
 const payload = JSON.parse(request.body);
 assert.equal(payload.model, 'test-model'); assert.equal(payload.state.title, 'Synthetic');
 assert.equal(payload.questions.q_AI.type, 'choice'); assert.equal(payload.questions.q_AI.instructions, 'Classify');
 assert.deepEqual(payload.questions.q_AI.criteria, { match: 'AI research', other: 'Other topics' });
 assert.equal(payload.questions.q_off, undefined);
 assert.equal(request.url, 'http://localhost:1234/api/alpha/decisions');
 await client(api, profile, []).evaluateNote({}, [tag()]);
 assert.equal(request.headers.Authorization, undefined);
});
test('a custom decision model ID and full endpoint are sent unchanged', async () => {
 let request;
 const api = load(async value => { request = value; return { status: 200, json: { answers: { q_AI: { choice: 'match', confidence: .9 } } } }; });
 await client(api, { ...api.defaultProfile(), model: 'jev-custom' }, ['test']).evaluateNote({ title: 'Test' }, [tag()]);
 const payload = JSON.parse(request.body); assert.equal(payload.model, 'jev-custom'); assert.equal(payload.questions.q_AI.criteria.match, 'AI research');
 assert.equal(request.headers.Authorization, 'Bearer test'); assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
});
test('HTTP errors never expose response content or credentials', async () => {
 const api = load(async () => ({ status: 401, text: 'SENSITIVE BODY', json: { error: 'SECRET' } }));
 await assert.rejects(client(api).evaluateNote({}, [tag()]), e => e.code === 'http' && e.status === 401 && !e.message.includes('SECRET'));
});
test('network failures, synchronous transport errors and timeouts settle safely', async () => {
 const api = load(() => { throw new Error('SENSITIVE URL'); });
 await assert.rejects(client(api).evaluateNote({}, [tag()]), e => e.code === 'network');
 const timed = load(() => new Promise(() => {}), { setTimeout: callback => setTimeout(callback, 5) });
 await assert.rejects(client(timed).evaluateNote({}, [tag()]), e => e.code === 'timeout');
});
test('cancel discards a late API response', async () => {
 let finish; const api = load(() => new Promise(resolve => { finish = resolve; }));
 const controller = new AbortController(); const pending = client(api).evaluateNote({}, [tag()], controller.signal);
 await Promise.resolve(); controller.abort();
 await assert.rejects(pending, e => e.code === 'cancelled');
 finish({ status: 200, json: answer() });
});
test('batch scope includes descendants, excludes sibling prefixes and templates', () => {
 const { inBatchScope, countNotesByFolder, isScannablePath } = load();
 assert.equal(inBatchScope('work/sub/note.md', 'work'), true);
 assert.equal(inBatchScope('work-other/note.md', 'work'), false);
 for (const path of ['.hidden/note.md', 'work/.hidden/n.md', 'work/templates/n.md', '模板/a.md']) assert.equal(inBatchScope(path, ''), false);
 assert.equal(isScannablePath('work/note.md'), true);
});
test('note counts per folder let the scope picker price every level', () => {
 const { countNotesByFolder } = load();
 const counts = countNotesByFolder(['a/one.md', 'a/b/two.md', 'a/b/three.md', 'other/four.md', 'a/templates/skip.md', 'a/b/模板/skip.md']);
 assert.equal(counts.get('a'), 3, 'subfolder notes roll up into their parent');
 assert.equal(counts.get('a/b'), 2);
 assert.equal(counts.get('other'), 1);
 assert.equal(counts.has('a/b/three.md'), false, 'files are not folders');
 assert.equal(counts.get('a/templates'), undefined, 'template notes are never counted');
});
function batch(api, overrides = {}, paths = ['one.md', 'two.md']) {
 const files = paths.map(path => ({ path, basename: path }));
 const session = { client: { profile }, tags: [tag()], threshold: .7 };
 const plugin = { activeModel: profile, settings: { language: 'en', confidenceThreshold: .7 }, batchRunning: false,
  createEvaluationSession: () => session, createController: () => new AbortController(), releaseController() {},
  evaluateFile: async () => [decision()], addTagToFile: async () => true, errorText: e => e.code || e.message, ...overrides };
 const modal = new api.BatchTagModal({ vault: { getMarkdownFiles: () => files } }, plugin);
 modal.progress = { status: element(), value: 0, stage() {}, update(n, total) { this.value = total ? Math.floor(n / total * 100) : 0; } };
 modal.metrics = [element(), element(), element(), element()];
 for (const key of ['detail', 'modelLabel', 'currentFile', 'log', 'start', 'stop']) modal[key] = element();
 modal.picker = { setDisabled() {} };
 modal.entries = []; modal.addLog = (message, state) => modal.entries.push({ message, state });
 return { modal, plugin };
}
test('batch progress advances only after completed processing and counts errors honestly', async () => {
 const api = load(); let calls = 0; let current;
 const { modal } = batch(api, { evaluateFile: async () => { assert.equal(current.progress.value, calls * 50); if (++calls === 2) throw new api.ModelError('response'); return [decision()]; } }); current = modal;
 await modal.run(); assert.equal(modal.processed, 2); assert.equal(modal.modified, 1); assert.equal(modal.failed, 1);
 assert.match(modal.progress.status.text, /1 notes failed/); assert.equal(modal.progress.value, 100);
});
test('stop during evaluation preserves incomplete progress and never writes returned tags', async () => {
 const api = load(); let finish; let writes = 0;
 const { modal, plugin } = batch(api, { evaluateFile: () => new Promise(resolve => { finish = resolve; }), addTagToFile: async () => { writes++; return true; } });
 const pending = modal.run(); modal.cancel(); finish([decision()]); await pending;
 assert.equal(writes, 0); assert.equal(modal.processed, 0); assert.equal(modal.progress.value, 0); assert.match(modal.progress.status.text, /Stopped/); assert.equal(plugin.batchRunning, false);
});
test('stop during a write counts the completed write and prevents subsequent writes', async () => {
 const api = load(); let finish; let writes = 0;
 const { modal } = batch(api, { evaluateFile: async () => [decision(), decision({ tagName: 'second' })], addTagToFile: () => { writes++; return new Promise(resolve => { finish = resolve; }); } });
 const pending = modal.run(); await new Promise(setImmediate); modal.cancel(); finish(true); await pending;
 assert.equal(writes, 1); assert.equal(modal.modified, 1); assert.equal(modal.added, 1); assert.equal(modal.processed, 0);
});
test('partial write failure still reports committed tags and failure', async () => {
 const api = load(); let writes = 0;
 const { modal } = batch(api, { evaluateFile: async () => [decision(), decision({ tagName: 'second' })], addTagToFile: async () => { if (++writes === 2) throw new Error('disk'); return true; } }, ['one.md']);
 await modal.run(); assert.equal(modal.failed, 1); assert.equal(modal.modified, 1); assert.equal(modal.added, 1);
});
test('authentication failure halts remaining batch; empty scope and concurrent batch do no work', async () => {
 const api = load(); let calls = 0;
 const { modal } = batch(api, { evaluateFile: async () => { calls++; throw new api.ModelError('http', 401); } });
 await modal.run(); assert.equal(calls, 1); assert.equal(modal.progress.value, 50);
 const empty = batch(api, { evaluateFile: async () => { calls++; return []; } }, []); await empty.modal.run(); assert.equal(calls, 1);
 const busy = batch(api, { batchRunning: true }); await busy.modal.run(); assert.match(busy.modal.progress.status.text, /Another batch/);
});
test('a pool that cannot serve any more stops the batch instead of failing note by note', async () => {
 const api = load(); let calls = 0;
 const run = async (error) => { const { modal } = batch(api, { evaluateFile: async () => { calls++; throw error; } }); await modal.run(); return modal; };
 const exhausted = await run(new api.ModelError('quota'));
 assert.equal(calls, 1); assert.equal(exhausted.progress.value, 50);
 const broke = await run(new api.ModelError('http', 402));
 assert.equal(calls, 2); assert.equal(broke.progress.value, 50);
 const flaky = await run(new api.ModelError('response'));
 assert.equal(calls, 4); assert.equal(flaky.progress.value, 100);
});
test('unchanged notes and rescans reset metrics', async () => {
 const api = load(); const { modal } = batch(api, { addTagToFile: async () => false }, ['one.md']);
 await modal.run(); assert.equal(modal.unchanged, 1); assert.equal(modal.modified, 0); await modal.run(); assert.equal(modal.processed, 1); assert.equal(modal.unchanged, 1);
});
test('multi-key batch runs parallel workers and distributes load across keys', async () => {
 const api = load();
 const pool = new api.KeyPool(['key-1', 'key-2', 'key-3']);
 let maxInFlight = 0;
 const activeTasks = new Set();
 const { modal } = batch(api, {
  createEvaluationSession: () => ({ client: { profile, pool }, tags: [tag()], threshold: .7 }),
  evaluateFile: async (file) => {
   activeTasks.add(file.path);
   if (activeTasks.size > maxInFlight) maxInFlight = activeTasks.size;
   await new Promise(resolve => setTimeout(resolve, 20));
   activeTasks.delete(file.path);
   return [decision()];
  }
 }, ['f1.md', 'f2.md', 'f3.md', 'f4.md', 'f5.md', 'f6.md']);
 await modal.run();
 assert.equal(modal.processed, 6);
 assert.equal(modal.modified, 6);
 assert.equal(maxInFlight, 3, 'runs 3 workers concurrently with 3 keys');
 assert.match(modal.modelLabel.text, /3 parallel/);
});
test('key pool balances concurrent in-flight requests across distinct accounts', async () => {
 const api = load();
 const pool = new api.KeyPool(['key-a', 'key-b', 'key-c']);
 const k1 = pool.take();
 const k2 = pool.take();
 const k3 = pool.take();
 assert.deepEqual([k1, k2, k3], ['key-a', 'key-b', 'key-c']);
 assert.equal(pool.activeCount('key-a'), 1);
 assert.equal(pool.activeCount('key-b'), 1);
 assert.equal(pool.activeCount('key-c'), 1);
 pool.release('key-b');
 assert.equal(pool.activeCount('key-b'), 0);
 const next = pool.take();
 assert.equal(next, 'key-b');
 pool.release('key-a');
 pool.release('key-b');
 pool.release('key-c');
});
test('frontmatter writes preserve other fields and existing tags, avoid duplicates', async () => {
 const api = load(); const plugin = new api.PluginClass(); const data = { tags: ['old'], title: 'Keep', nested: { key: 1 } };
 plugin.app = { vault: { read: async () => '---\ntitle: Keep\ntags:\n  - old\n---\nbody', modify: async () => {} }, fileManager: { processFrontMatter: async (_file, callback) => callback(data) } };
 assert.equal(await plugin.addTagToFile({}, 'AI'), true); assert.equal(await plugin.addTagToFile({}, 'AI'), false);
 assert.deepEqual(JSON.parse(JSON.stringify(data)), { tags: ['old', 'AI'], title: 'Keep', nested: { key: 1 } });
});
/**
 * Stands in for the Obsidian file APIs, including the documented behaviour that
 * processFrontMatter writes properties as plain body text when the file has no
 * frontmatter block yet. https://forum.obsidian.md/t/77008
 */
function vaultWith(files) {
 const BLOCK = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
 const parse = (block) => {
  const frontmatter = { tags: (block.match(/^\s+-\s+(.+)$/gm) || []).map(item => item.replace(/^\s*-\s+/, '')) };
  for (const line of block.split(/\r?\n/).slice(1, -1)) {
   const pair = /^([\w-]+):\s*(.+)$/.exec(line);
   if (pair && pair[1] !== 'tags') frontmatter[pair[1]] = pair[2];
  }
  return frontmatter;
 };
 const serialize = (frontmatter, eol) => {
  const lines = Object.keys(frontmatter).filter(key => key !== 'tags').map(key => `${key}: ${frontmatter[key]}`);
  if (frontmatter.tags && frontmatter.tags.length) lines.push('tags:', ...frontmatter.tags.map(tag => `  - ${tag}`));
  return lines.length ? lines.join(eol) + eol : '';
 };
 return {
  files,
  app: {
   vault: { read: async file => files[file.path] ?? '', modify: async (file, content) => { files[file.path] = content; } },
   fileManager: {
    async processFrontMatter(file, fn) {
     const content = files[file.path] ?? '';
     const match = BLOCK.exec(content);
     const frontmatter = match ? parse(match[0]) : {};
     fn(frontmatter);
     const eol = content.includes('\r\n') ? '\r\n' : '\n';
     const yaml = serialize(frontmatter, eol);
     // The bug: with no block to update, Obsidian writes the properties as
     // plain text and never adds the --- delimiters, so they end up in the body.
     files[file.path] = match ? content.replace(match[0], yaml ? `---${eol}${yaml}---${eol}` : '') : `${yaml}${content}`;
    },
   },
  },
 };
}
test('a tag added to a note without frontmatter lands in the YAML, not in the body', async () => {
 const api = load(); const plugin = new api.PluginClass();
 const files = { 'plain.md': 'Body only, no properties.\n' };
 plugin.app = vaultWith(files).app;
 assert.equal(await plugin.addTagToFile({ path: 'plain.md' }, 'AI'), true);
 assert.equal(files['plain.md'], '---\ntags:\n  - AI\n---\nBody only, no properties.\n');
 assert.ok(api.hasFrontmatter(files['plain.md']));
});
test('an existing frontmatter block is updated in place and never duplicated', async () => {
 const api = load(); const plugin = new api.PluginClass();
 const files = { 'note.md': '---\ntitle: Keep\ntags:\n  - old\n---\nBody\n' };
 plugin.app = vaultWith(files).app;
 assert.equal(await plugin.addTagToFile({ path: 'note.md' }, 'AI'), true);
 assert.equal(files['note.md'], '---\ntitle: Keep\ntags:\n  - old\n  - AI\n---\nBody\n');
 assert.equal(await plugin.addTagToFile({ path: 'note.md' }, 'AI'), false, 'a tag that is already there is not written again');
 assert.equal(files['note.md'], '---\ntitle: Keep\ntags:\n  - old\n  - AI\n---\nBody\n');
});
test('CRLF notes get a CRLF block so line endings stay consistent', async () => {
 const api = load(); const plugin = new api.PluginClass();
 const files = { 'win.md': 'Body\r\n' };
 plugin.app = vaultWith(files).app;
 await plugin.addTagToFile({ path: 'win.md' }, 'AI');
 assert.equal(files['win.md'], '---\r\ntags:\r\n  - AI\r\n---\r\nBody\r\n', files['win.md']);
 assert.ok(api.hasFrontmatter(files['win.md']));
});
test('removing a tag from a note without frontmatter leaves the file untouched', async () => {
 const api = load(); const plugin = new api.PluginClass();
 const files = { 'plain.md': 'Body with #AI inline.\n' };
 plugin.app = vaultWith(files).app;
 assert.equal(await plugin.removeTagFromFile({ path: 'plain.md' }, 'AI'), true);
 assert.equal(files['plain.md'], 'Body with inline.\n', 'no block is created and no properties leak into the body');
 const clean = { 'clean.md': 'Nothing to remove.\n' };
 plugin.app = vaultWith(clean).app;
 assert.equal(await plugin.removeTagFromFile({ path: 'clean.md' }, 'AI'), false);
 assert.equal(clean['clean.md'], 'Nothing to remove.\n');
});
test('a horizontal rule in the body is not mistaken for frontmatter', async () => {
 const api = load(); const plugin = new api.PluginClass(); const files = { 'rule.md': 'Intro line\n\n---\n\nTail line\n' };
 plugin.app = vaultWith(files).app;
 const state = await plugin.buildNoteState({ basename: 'Note', path: 'rule.md', parent: { path: '.' } });
 assert.ok(state.content_start.includes('Intro line'), 'the body before the rule survives');
 assert.ok(state.content_start.includes('Tail line'), 'the body after the rule is still analysed');
 assert.equal(api.splitFrontmatter('---\ntitle: x\n---\nBody').body, 'Body');
 assert.deepEqual([...api.splitFrontmatter('no block here').frontmatter], []);
 assert.equal(api.withEmptyFrontmatter('---\n---\nBody'), '---\n---\nBody', 'an existing block is left alone');
});
test('note context removes frontmatter and inline tags while preserving headings', async () => {
 const api = load(); const plugin = new api.PluginClass();
 plugin.app = { vault: { read: async () => '---\ntags: [secret]\n---\n# Heading\nContent #oldtag text' } };
 const state = await plugin.buildNoteState({ basename: 'Note', parent: { path: 'folder' } });
 assert.equal(state.headings[0], 'Heading'); assert.ok(!state.content_start.includes('oldtag')); assert.ok(!state.content_start.includes('secret'));
});
test('account pool rotates round-robin and skips a key that answers with a non-200', async () => {
 const used = [];
 const api = load(async req => { used.push(req.headers.Authorization); return { status: 200, json: answer() }; });
 const pool = new api.KeyPool(['key-a', 'key-b', 'key-c']);
 const bound = client(api, profile, pool);
 for (let round = 0; round < 4; round++) await bound.evaluateNote({}, [tag()]);
 assert.deepEqual(used, ['Bearer key-a', 'Bearer key-b', 'Bearer key-c', 'Bearer key-a']);
 assert.equal(pool.summary().healthy, 3);
});
test('a failing account is recorded and the request continues on the next key', async () => {
 const used = [];
 const codes = { 'Bearer key-a': 429, 'Bearer key-b': 401, 'Bearer key-c': 200 };
 const api = load(async req => { used.push(req.headers.Authorization); return { status: codes[req.headers.Authorization], json: answer() }; });
 const pool = new api.KeyPool(['key-a', 'key-b', 'key-c'], { now: () => 1_000 });
 const bound = client(api, profile, pool);
 const results = await bound.evaluateNote({}, [tag()]);
 assert.equal(results[0].probability, .9);
 assert.deepEqual(used, ['Bearer key-a', 'Bearer key-b', 'Bearer key-c']);
 assert.equal(pool.state('key-a').status, 'limited');
 assert.equal(pool.state('key-b').status, 'invalid');
 assert.equal(pool.state('key-c').status, 'healthy');
 assert.deepEqual([...pool.available()], ['key-c']);
 const summary = pool.summary();
 assert.equal(summary.usable, 1); assert.equal(summary.percent, 1 / 3); assert.equal(summary.limited, 1); assert.equal(summary.dead, 1);
 assert.equal(summary.unchecked, 0);
});
test('rate limited keys return to rotation once the cooldown ends, dead ones never do', async () => {
 const api = load(); let now = 1_000;
 const pool = new api.KeyPool(['limited', 'dead'], { cooldownMs: 500, now: () => now });
 pool.record('limited', 'limited', 0, 429); pool.record('dead', 'banned', 0, 403);
 assert.deepEqual([...pool.available()], []);
 now = 1_600;
 assert.deepEqual([...pool.available()], ['limited']);
 assert.equal(pool.state('dead').status, 'banned');
 pool.record('limited', 'healthy', 812);
 assert.equal(pool.state('limited').latencyMs, 812);
 assert.equal(pool.summary().avgLatencyMs, 812);
});
test('an exhausted pool fails with a quota error instead of sending an unauthenticated request', async () => {
 let calls = 0;
 const api = load(async () => { calls++; return { status: 402, json: {} }; });
 const bound = client(api, profile, ['a', 'b']);
 // Both accounts run dry on the first request, which reports the last status it saw.
 await assert.rejects(bound.evaluateNote({}, [tag()]), e => e.code === 'http' && e.status === 402);
 assert.equal(calls, 2); assert.equal(bound.pool.summary().dead, 2);
 // Nothing is left to send, so the next request never leaves the plugin.
 await assert.rejects(bound.evaluateNote({}, [tag()]), e => e.code === 'quota');
 assert.equal(calls, 2);
});
test('probing records one status per key and returns the model that answered', async () => {
 const codes = { 'Bearer slow': 200, 'Bearer gone': 401 };
 const api = load(async req => ({ status: codes[req.headers.Authorization] ?? 500, json: { model: 'span-01-lite', answers: { q_detect: { type: 'choice', choice: 'other', confidence: .8 } } } }));
 const pool = new api.KeyPool(['slow', 'gone', 'boom']);
 const served = await api.probeKeys(profile, pool);
 assert.equal(served, 'span-01-lite');
 assert.equal(pool.state('slow').status, 'healthy');
 assert.equal(pool.state('gone').status, 'invalid');
 assert.equal(pool.state('boom').status, 'unknown');
 assert.equal(pool.summary().usable, 1);
});
test('TypeSafe and OpenRouter provider definitions and protocols are configured properly', async () => {
 const api = load();
 assert.equal(api.PROVIDERS.typesafe.endpoint, 'https://api.typesafe.ai/v1/systemone');
 assert.equal(api.PROVIDERS.typesafe.model, 'jev-latest');
 assert.equal(api.PROVIDERS.openrouter.endpoint, 'https://openrouter.ai/api/alpha/decisions');
 assert.equal(api.PROVIDERS.openrouter.model, 'respan/span-01-lite:free');

 const orProfile = { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/alpha/decisions', model: 'respan/span-01-lite:free' };
 assert.equal(api.isNoulProvider(orProfile), true);
 assert.equal(api.isNoulProvider(api.defaultProfile()), false);

 // Test OpenRouter evaluation converts state to string and uses noul questions
 let capturedRequest;
 const orClient = client(load(async (req) => { capturedRequest = req; return { status: 200, json: { model: 'respan/span-01-lite', answers: { q_AI: { type: 'noul', noul: 0.95 } } } }; }), orProfile);
 const evalResult = await orClient.evaluateNote({ title: 'AI Note', headings: ['Intro'], content_start: 'AI content' }, [tag()]);
 assert.equal(evalResult[0].isMatch, true);
 assert.equal(evalResult[0].probability, 0.95);
 assert.equal(evalResult[0].confidence, 0.95);

 const sentBody = JSON.parse(capturedRequest.body);
 assert.equal(typeof sentBody.state, 'string');
 assert.match(sentBody.state, /Title: AI Note/);
 assert.equal(sentBody.questions.q_AI.type, 'noul');
 assert.deepEqual(sentBody.questions.q_AI.criteria, { true: 'AI research', false: 'Other topics' });

 // Test OpenRouter detect
 let detectRequest;
 const detectClient = client(load(async (req) => { detectRequest = req; return { status: 200, json: { model: 'respan/span-01-lite-free', answers: { q_detect: { type: 'noul', noul: 0.92 } } } }; }), orProfile);
 const detectResult = await detectClient.detect();
 assert.equal(detectResult.model, 'respan/span-01-lite-free');
 assert.equal(detectResult.probability, 0.92);
 const sentDetectBody = JSON.parse(detectRequest.body);
 assert.equal(sentDetectBody.questions.q_detect.type, 'noul');
});

test('removeTagFromFile removes tag from frontmatter and note body, preserving other content', async () => {
 const api = load();
 const plugin = new api.PluginClass();

 let fileContent = '---\ntags:\n  - AI\n  - MachineLearning\n---\n# AI Research\nThis is a note about #AI and #DeepLearning.';
 const fm = { tags: ['AI', 'MachineLearning'] };

 plugin.app = {
  fileManager: {
   processFrontMatter: async (_file, cb) => cb(fm),
  },
  vault: {
   read: async () => fileContent,
   modify: async (_file, updated) => { fileContent = updated; },
  },
 };

 const modified = await plugin.removeTagFromFile({}, 'AI');
 assert.equal(modified, true);
 assert.deepEqual(fm.tags, ['MachineLearning']);
 assert.ok(!fileContent.includes('#AI and'));
 assert.ok(fileContent.includes('#DeepLearning'));
 assert.ok(fileContent.includes('# AI Research')); // Heading preserved

 // Calling again should return false since AI tag is already removed
 const modifiedAgain = await plugin.removeTagFromFile({}, 'AI');
 assert.equal(modifiedAgain, false);
});

test('removeTagFromVault removes tag from all affected files and updates settings library', async () => {
 const api = load();
 const plugin = new api.PluginClass();

 const file1 = { path: 'note1.md', basename: 'note1' };
 const file2 = { path: 'note2.md', basename: 'note2' };
 let file1Content = '# Heading\nNote 1 with #AI tag';
 let file2Content = '# Heading\nNote 2 with #Web tag';

 plugin.settings = {
  tags: [
   { name: 'AI', enabled: true },
   { name: 'Web', enabled: true },
  ],
 };
 plugin.saveSettings = async () => {};

 plugin.app = {
  vault: {
   getMarkdownFiles: () => [file1, file2],
   read: async (f) => f === file1 ? file1Content : file2Content,
   modify: async (f, updated) => {
    if (f === file1) file1Content = updated;
    else file2Content = updated;
   },
  },
  metadataCache: {
   getFileCache: (f) => ({ tags: f === file1 ? ['#AI'] : ['#Web'] }),
  },
  fileManager: {
   processFrontMatter: async () => {},
  },
 };

 const res = await plugin.removeTagFromVault('AI');
 assert.equal(res.affectedNotes, 1);
 assert.equal(res.totalNotes, 2);
 assert.ok(!file1Content.includes('#AI'));
 assert.ok(file2Content.includes('#Web'));
 assert.deepEqual(plugin.settings.tags, [{ name: 'Web', enabled: true }]);
});

test('addTagDefinition creates new tag with defaults, strips leading hash, and validates inputs', async () => {
 const api = load();
 const plugin = new api.PluginClass();
 plugin.settings = {
  language: 'zh',
  tags: [{ name: 'ExistingTag', enabled: true, instructions: '', matchCriteria: '', otherCriteria: '' }],
 };
 plugin.saveSettings = async () => {};

 // 1. Add valid tag with leading #
 await plugin.addTagDefinition({
  name: '#Python',
  instructions: '',
  matchCriteria: '',
  otherCriteria: '',
  enabled: true,
 });

 assert.equal(plugin.settings.tags.length, 2);
 const added = plugin.settings.tags[1];
 assert.equal(added.name, 'Python');
 assert.equal(added.instructions, '这篇笔记是否主要关于 Python？');
 assert.equal(added.matchCriteria, 'Python 及相关主题。');
 assert.equal(added.otherCriteria, '其他主题。');
 assert.equal(added.enabled, true);

 // 2. Reject empty name
 await assert.rejects(async () => {
  await plugin.addTagDefinition({ name: '   ', instructions: '', matchCriteria: '', otherCriteria: '', enabled: true });
 }, /不能为空/);

 // 3. Reject names with spaces or slashes
 await assert.rejects(async () => {
  await plugin.addTagDefinition({ name: 'invalid tag', instructions: '', matchCriteria: '', otherCriteria: '', enabled: true });
 }, /空格或斜杠/);
 await assert.rejects(async () => {
  await plugin.addTagDefinition({ name: 'nested/tag', instructions: '', matchCriteria: '', otherCriteria: '', enabled: true });
 }, /空格或斜杠/);

 // 4. Reject duplicate tag (case-insensitive)
 await assert.rejects(async () => {
  await plugin.addTagDefinition({ name: 'python', instructions: '', matchCriteria: '', otherCriteria: '', enabled: true });
 }, /已存在/);
});

test('updateTagDefinition updates existing tag criteria and ignores missing tags', async () => {
 const api = load();
 const plugin = new api.PluginClass();
 plugin.settings = {
  language: 'en',
  tags: [{ name: 'ML', instructions: 'old', matchCriteria: 'old match', otherCriteria: 'old other', enabled: true }],
 };
 plugin.saveSettings = async () => {};

 const ok = await plugin.updateTagDefinition('ML', {
  instructions: 'New instructions for ML',
  matchCriteria: 'New match criteria',
  otherCriteria: 'New other criteria',
  enabled: false,
 });
 assert.equal(ok, true);
 assert.equal(plugin.settings.tags[0].instructions, 'New instructions for ML');
 assert.equal(plugin.settings.tags[0].matchCriteria, 'New match criteria');
 assert.equal(plugin.settings.tags[0].otherCriteria, 'New other criteria');
 assert.equal(plugin.settings.tags[0].enabled, false);

 const missing = await plugin.updateTagDefinition('NonExistent', { instructions: 'xyz' });
 assert.equal(missing, false);
});

test('parseApiKeys parses single, comma-separated and newline-separated keys with deduplication', () => {
 const { parseApiKeys } = load();
 assert.deepEqual([...parseApiKeys('sk-single')], ['sk-single']);
 assert.deepEqual([...parseApiKeys('sk-1, sk-2, sk-3')], ['sk-1', 'sk-2', 'sk-3']);
 assert.deepEqual([...parseApiKeys('sk-1，sk-2')], ['sk-1', 'sk-2']);
 assert.deepEqual([...parseApiKeys('sk-1\nsk-2\nsk-3')], ['sk-1', 'sk-2', 'sk-3']);
 assert.deepEqual([...parseApiKeys('  sk-1 ,  sk-2 , sk-1  ')], ['sk-1', 'sk-2']);
 assert.deepEqual([...parseApiKeys('')], []);
 assert.deepEqual([...parseApiKeys('   ')], []);
 assert.deepEqual([...parseApiKeys(null)], []);
});


/** Tags a note actually carries, frontmatter list items and inline #tags alike. */
const tagsIn = (content) => [
  ...[...content.matchAll(/^\s*-\s+(.+)$/gm)].map(match => match[1]),
  ...[...content.matchAll(/(?:^|\s)#([^\s#]+)/g)].map(match => match[1]),
];
function tagger(api, files, tags) {
  const plugin = new api.PluginClass();
  const mock = vaultWith(files);
  plugin.app = { ...mock.app, vault: { ...mock.app.vault, getMarkdownFiles: () => Object.keys(files).map(path => ({ path })) }, metadataCache: { getFileCache: file => ({ tags: tagsIn(files[file.path] ?? '') }) } };
  plugin.settings = { language: 'en', provider: 'openrouter', models: [], apiKeys: { typesafe: [], openrouter: ['key'] }, tags, confidenceThreshold: 0.7 };
  plugin.saveSettings = async () => {};
  return plugin;
}
test('renaming a tag applies it to the library and to every note that carried it', async () => {
 const api = load();
 const files = {
  'frontmatter.md': '---\ntags:\n  - AI\n---\nBody stays.\n',
  'inline.md': 'A plain note with #AI in the body.\n',
  'untouched.md': 'Nothing to do here.\n',
 };
 const plugin = tagger(api, files, [{ name: 'AI', enabled: true, instructions: 'Is this note primarily about AI?', matchCriteria: 'AI and related topics.', otherCriteria: 'Other topics.' }]);
 const result = await plugin.renameTag('AI', '人工智能');
 assert.deepEqual({ ...result }, { notes: 2, from: 'AI', to: '人工智能' });
 assert.equal(files['frontmatter.md'], '---\ntags:\n  - 人工智能\n---\nBody stays.\n');
 assert.equal(files['inline.md'], '---\ntags:\n  - 人工智能\n---\nA plain note with in the body.\n', 'the inline tag moves into the frontmatter');
 assert.equal(files['untouched.md'], 'Nothing to do here.\n');
 const rule = plugin.settings.tags[0];
 assert.equal(rule.name, '人工智能');
 assert.equal(rule.instructions, 'Is this note primarily about 人工智能?', 'generated criteria follow the new name');
 assert.equal(rule.matchCriteria, '人工智能 and related topics.');
 assert.equal(rule.enabled, true, 'the rest of the rule is untouched');
 assert.equal(plugin.notesWithTag('人工智能').length, 2);
 assert.equal(plugin.notesWithTag('AI').length, 0);
});
test('renaming leaves hand written criteria alone', async () => {
 const api = load(); const plugin = tagger(api, {}, [{ name: 'AI', enabled: true, instructions: 'Does this note discuss models?', matchCriteria: 'Weights, training runs.', otherCriteria: 'Deployment.' }]);
 await plugin.renameTag('#AI', '人工智能');
 const rule = plugin.settings.tags[0];
 assert.equal(rule.name, '人工智能');
 assert.deepEqual([rule.instructions, rule.matchCriteria, rule.otherCriteria], ['Does this note discuss models?', 'Weights, training runs.', 'Deployment.']);
});
test('renaming rejects names that clash, break the rule, or do not exist', async () => {
 const api = load();
 const plugin = tagger(api, {}, [{ name: 'AI', enabled: true, instructions: 'x', matchCriteria: 'y', otherCriteria: 'z' }, { name: 'ML', enabled: true, instructions: 'x', matchCriteria: 'y', otherCriteria: 'z' }]);
 await assert.rejects(plugin.renameTag('AI', 'ML'), /already exists/);
 await assert.rejects(plugin.renameTag('AI', 'two words'), /cannot contain spaces/);
 await assert.rejects(plugin.renameTag('AI', 'a/b'), /cannot contain spaces/);
 await assert.rejects(plugin.renameTag('AI', '  '), /cannot be empty/);
 await assert.rejects(plugin.renameTag('Nope', 'New'), /is not in the library/);
 assert.deepEqual([...plugin.settings.tags].map(tag => tag.name), ['AI', 'ML']);
 assert.deepEqual({ ...(await plugin.renameTag('AI', 'AI')) }, { notes: 0, from: 'AI', to: 'AI' }, 'renaming to the same name is a no-op');
});
