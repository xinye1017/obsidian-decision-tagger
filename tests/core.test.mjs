import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: `export * from './src/modelClient'; export * from './src/batchTagModal'; export {default as PluginClass} from './src/main';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false });
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
const profile = { id: 'local', name: 'Local', endpoint: 'http://localhost:1234', model: 'test-model', apiKey: 'test-key' };

test('legacy credentials and endpoint migrate without replacing custom profiles', () => {
 const api = load();
 const migrated = api.migrateModels({ apiKey: 'test-key', endpoint: 'https://example.test/custom' });
 assert.equal(migrated.models[0].apiKey, 'test-key'); assert.equal(migrated.models[0].endpoint, 'https://example.test/custom');
 const custom = api.migrateModels({ models: [{ ...profile, protocol: 'openai' }], activeModelId: 'missing' });
 assert.equal(custom.activeModelId, 'local'); assert.notEqual(custom.models[0], profile);
 assert.deepEqual(Object.keys(custom.models[0]).sort(), ['apiKey', 'endpoint', 'id', 'model', 'name']);
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
 const detected = await new api.ModelClient({ ...profile, model: '' }).detect();
 assert.equal(detected.model, 'span-01-lite'); assert.equal(detected.inputTokens, 42); assert.ok(detected.probability < .21);
 const payload = JSON.parse(request.body);
 assert.equal('model' in payload, false);
 assert.equal(payload.questions.q_detect.type, 'choice'); assert.equal(payload.questions.q_detect.criteria.match, 'Software testing');
 assert.equal(request.url, 'http://localhost:1234/api/alpha/decisions');
 assert.equal(request.headers.Authorization, 'Bearer test-key');
 assert.equal(api.servedModel({ model: '' }, 'fallback'), 'fallback');
 const failing = load(async () => ({ status: 200, json: { answers: {} } }));
 await assert.rejects(new failing.ModelClient({ ...profile, model: '' }).detect(), e => e.code === 'response');
});
test('decision requests use the snapshot model, enabled rules and optional authentication', async () => {
 let request;
 const api = load(async value => { request = value; return { status: 200, json: answer() }; });
 const source = { ...profile }; const client = new api.ModelClient(source); source.model = 'changed';
 await client.evaluateNote({ title: 'Synthetic' }, [tag(), { ...tag('off'), enabled: false }]);
 const payload = JSON.parse(request.body);
 assert.equal(payload.model, 'test-model'); assert.equal(payload.state.title, 'Synthetic');
 assert.equal(payload.questions.q_AI.type, 'choice'); assert.equal(payload.questions.q_AI.instructions, 'Classify');
 assert.deepEqual(payload.questions.q_AI.criteria, { match: 'AI research', other: 'Other topics' });
 assert.equal(payload.questions.q_off, undefined);
 assert.equal(request.url, 'http://localhost:1234/api/alpha/decisions');
 await new api.ModelClient({ ...profile, apiKey: '' }).evaluateNote({}, [tag()]);
 assert.equal(request.headers.Authorization, undefined);
});
test('a custom decision model ID and full endpoint are sent unchanged', async () => {
 let request;
 const api = load(async value => { request = value; return { status: 200, json: { answers: { q_AI: { choice: 'match', confidence: .9 } } } }; });
 await new api.ModelClient({ ...api.defaultProfile(), apiKey: 'test', model: 'jev-custom' }).evaluateNote({ title: 'Test' }, [tag()]);
 const payload = JSON.parse(request.body); assert.equal(payload.model, 'jev-custom'); assert.equal(payload.questions.q_AI.criteria.match, 'AI research');
 assert.equal(request.headers.Authorization, 'Bearer test'); assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
});
test('HTTP errors never expose response content or credentials', async () => {
 const api = load(async () => ({ status: 401, text: 'SENSITIVE BODY', json: { error: 'SECRET' } }));
 await assert.rejects(new api.ModelClient(profile).evaluateNote({}, [tag()]), e => e.code === 'http' && e.status === 401 && !e.message.includes('SECRET'));
});
test('network failures, synchronous transport errors and timeouts settle safely', async () => {
 const api = load(() => { throw new Error('SENSITIVE URL'); });
 await assert.rejects(new api.ModelClient(profile).evaluateNote({}, [tag()]), e => e.code === 'network');
 const timed = load(() => new Promise(() => {}), { setTimeout: callback => setTimeout(callback, 5) });
 await assert.rejects(new timed.ModelClient(profile).evaluateNote({}, [tag()]), e => e.code === 'timeout');
});
test('cancel discards a late API response', async () => {
 let finish; const api = load(() => new Promise(resolve => { finish = resolve; }));
 const controller = new AbortController(); const pending = new api.ModelClient(profile).evaluateNote({}, [tag()], controller.signal);
 await Promise.resolve(); controller.abort();
 await assert.rejects(pending, e => e.code === 'cancelled');
 finish({ status: 200, json: answer() });
});
test('batch scope includes descendants, excludes sibling prefixes and templates', () => {
 const { inBatchScope } = load();
 assert.equal(inBatchScope('work/sub/note.md', 'work'), true);
 assert.equal(inBatchScope('work-other/note.md', 'work'), false);
 for (const path of ['.hidden/note.md', 'work/.hidden/n.md', 'work/templates/n.md', '模板/a.md']) assert.equal(inBatchScope(path, ''), false);
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
 for (const key of ['detail', 'modelLabel', 'currentFile', 'log', 'start', 'stop', 'scopeSelect']) modal[key] = element();
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
test('unchanged notes and rescans reset metrics', async () => {
 const api = load(); const { modal } = batch(api, { addTagToFile: async () => false }, ['one.md']);
 await modal.run(); assert.equal(modal.unchanged, 1); assert.equal(modal.modified, 0); await modal.run(); assert.equal(modal.processed, 1); assert.equal(modal.unchanged, 1);
});
test('frontmatter writes preserve other fields and existing tags, avoid duplicates', async () => {
 const api = load(); const plugin = new api.PluginClass(); const data = { tags: ['old'], title: 'Keep', nested: { key: 1 } };
 plugin.app = { fileManager: { processFrontMatter: async (_file, callback) => callback(data) } };
 assert.equal(await plugin.addTagToFile({}, 'AI'), true); assert.equal(await plugin.addTagToFile({}, 'AI'), false);
 assert.deepEqual(JSON.parse(JSON.stringify(data)), { tags: ['old', 'AI'], title: 'Keep', nested: { key: 1 } });
});
test('note context removes frontmatter and inline tags while preserving headings', async () => {
 const api = load(); const plugin = new api.PluginClass();
 plugin.app = { vault: { read: async () => '---\ntags: [secret]\n---\n# Heading\nContent #oldtag text' } };
 const state = await plugin.buildNoteState({ basename: 'Note', parent: { path: 'folder' } });
 assert.equal(state.headings[0], 'Heading'); assert.ok(!state.content_start.includes('oldtag')); assert.ok(!state.content_start.includes('secret'));
});
test('TypeSafe and OpenRouter provider definitions and protocols are configured properly', async () => {
 const api = load();
 assert.equal(api.PROVIDERS.typesafe.endpoint, 'https://api.typesafe.ai/v1/systemone');
 assert.equal(api.PROVIDERS.typesafe.model, 'jev-latest');
 assert.equal(api.PROVIDERS.openrouter.endpoint, 'https://openrouter.ai/api/alpha/decisions');
 assert.equal(api.PROVIDERS.openrouter.model, 'respan/span-01-lite:free');

 const orProfile = { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/alpha/decisions', model: 'respan/span-01-lite:free', apiKey: 'test-key' };
 assert.equal(api.isNoulProvider(orProfile), true);
 assert.equal(api.isNoulProvider(api.defaultProfile()), false);

 // Test OpenRouter evaluation converts state to string and uses noul questions
 let capturedRequest;
 const orClient = new (load(async (req) => { capturedRequest = req; return { status: 200, json: { model: 'respan/span-01-lite', answers: { q_AI: { type: 'noul', noul: 0.95 } } } }; })).ModelClient(orProfile);
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
 const detectClient = new (load(async (req) => { detectRequest = req; return { status: 200, json: { model: 'respan/span-01-lite-free', answers: { q_detect: { type: 'noul', noul: 0.92 } } } }; })).ModelClient(orProfile);
 const detectResult = await detectClient.detect();
 assert.equal(detectResult.model, 'respan/span-01-lite-free');
 assert.equal(detectResult.probability, 0.92);
 const sentDetectBody = JSON.parse(detectRequest.body);
 assert.equal(sentDetectBody.questions.q_detect.type, 'noul');
 assert.deepEqual(sentDetectBody.questions.q_detect.criteria, { true: 'Software testing', false: 'Other topics' });
});

