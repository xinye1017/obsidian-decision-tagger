/**
 * Opt-in live check for the decision model protocol (System-1 / Decisions API).
 *
 * It bundles the real ./src/modelClient.ts and ./src/main.ts and runs them inside a
 * vm whose obsidian `requestUrl` is backed by fetch, so endpoint resolution, the
 * request body, the note-state builder and the answer parser are exercised end to end.
 *
 * Usage (PowerShell):
 *   npm run live -- --mock                                  # built-in mock decision service
 *   $env:DECISION_TAGGER_API_KEY='sk-...'
 *   npm run live -- --endpoint http://127.0.0.1:3000 --model respan/span-01-lite:free
 *   npm run live -- --mock --model ''                       # detection discovers the model
 *
 * Exit code 0 = the protocol contract holds. Tag-quality expectations (for example the
 * AI note should match the AI tag) are reported as PASS/WARN, because model judgement is
 * probabilistic and must not break the build.
 */
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name) => {
	const index = argv.indexOf(`--${name}`);
	return index >= 0 ? argv[index + 1] : undefined;
};

const USE_MOCK = argv.includes('--mock');
const MOCK_PORT = Number(arg('port') || 3931);
const MOCK_SERVED_MODEL = arg('served-model') || 'respan/span-01-lite:free';
const ENDPOINT = arg('endpoint') || process.env.DECISION_TAGGER_ENDPOINT || process.env.SMART_TAGGER_ENDPOINT || (USE_MOCK ? `http://127.0.0.1:${MOCK_PORT}` : 'http://127.0.0.1:3000');
const MODEL = arg('model') ?? process.env.DECISION_TAGGER_MODEL ?? process.env.SMART_TAGGER_MODEL ?? 'respan/span-01-lite:free';
const API_KEY = arg('key') || process.env.DECISION_TAGGER_API_KEY || process.env.SMART_TAGGER_API_KEY || '';
const THRESHOLD = Number(arg('threshold') || process.env.DECISION_TAGGER_THRESHOLD || process.env.SMART_TAGGER_THRESHOLD || 0.7);
const REQUEST_TIMEOUT_MS = Number(arg('timeout') || 60_000);

const mask = (value) => (value ? `${value.slice(0, 6)}...${value.slice(-4)} (${value.length} chars)` : '<empty>');
const enabledOf = (tags) => tags.filter((tag) => tag.enabled);
const eligibleOf = (results) => results.filter((result) => result.isMatch && result.probability >= THRESHOLD);

// Mirrors LEGACY_DEFAULT_TAG_RULES in src/main.ts (the rules shipped to users).
const TAGS = [
	{
		name: '异常检测',
		enabled: true,
		instructions: 'Is this note primarily about image anomaly detection or anomaly segmentation?',
		matchCriteria: 'Computer vision anomaly detection, defect localization, and benchmark experiments.',
		otherCriteria: 'General database schemas, web engineering, reading lists, or thesis checklists.',
	},
	{
		name: '社交媒体',
		enabled: true,
		instructions: 'Is this note primarily about social media, creator accounts, or tweets?',
		matchCriteria: 'Social platforms, creator profiles, tweet drafts, or audience growth.',
		otherCriteria: 'Machine learning research, backend coding, or internal project planning.',
	},
	{
		name: '资讯',
		enabled: true,
		instructions: 'Does this note primarily record recent news, announcements, or industry developments?',
		matchCriteria: 'The note reports or aggregates external news, model releases, company updates, or daily roundups.',
		otherCriteria: 'An evergreen tutorial, research explanation, personal plan, or general design document.',
	},
	{
		name: 'AI',
		enabled: true,
		instructions: 'Is this note primarily about artificial intelligence models, AI agents, or AI tools?',
		matchCriteria: 'Artificial intelligence models, AI agents, LLM prompting, or AI tools.',
		otherCriteria: 'General software development, database administration, UI styling, or personal notes.',
	},
];

const NOTES = [
	{
		path: '研究笔记/如何构建可靠的 AI 工作流.md',
		basename: '如何构建可靠的 AI 工作流',
		expect: ['AI'],
		content: [
			'# 背景',
			'最近在把 AI agents 接到日常笔记系统里，重点是 LLM prompting 的输出稳定可解析。',
			'# 关键做法',
			'提示词里固定 JSON 契约，并声明笔记内容是不可信数据，避免提示注入。',
			'# 结论',
			'模型侧只做单轮决策，重试与阈值判断交给插件逻辑，这样失败可以复现。',
		].join('\n'),
	},
	{
		path: '研究笔记/本周阅读记录.md',
		basename: '本周阅读记录',
		expect: [],
		content: [
			'# 本周阅读记录',
			'- 《系统之美》：讲系统动力学的入门书，读完第一章。',
			'- 《设计中的设计》：关于信息层级和排版的一些笔记。',
			'- 周六去图书馆，顺便整理了书架。',
			'# 下周计划',
			'继续读完剩下的两章，写一篇读书笔记。',
		].join('\n'),
	},
	{
		path: 'Research/PatchCore on MVTec AD.md',
		basename: 'PatchCore on MVTec AD',
		expect: ['异常检测'],
		content: [
			'# Setup',
			'Reproduce PatchCore memory-bank embeddings for anomaly detection and defect localization on MVTec AD.',
			'# Results',
			'Image-level AUROC improved after reweighting the coreset subsampling; pixel-level PRO is reported per category.',
			'# Next',
			'Compare against a reconstruction baseline and log the memory bank size per defect class.',
		].join('\n'),
	},
	{
		path: '自媒体/推文草稿.md',
		basename: '推文草稿',
		expect: ['社交媒体'],
		content: [
			'# 推文草稿',
			'这条 tweet drafts 想分享本周更新的内容，顺便 @ 几位创作者互推，调整 audience growth 节奏。',
			'# 发布节奏',
			'周一到周三每天一条，看数据再调整封面风格。',
		].join('\n'),
	},
];

const bundle = await build({
	stdin: {
		contents: `export * from './src/modelClient'; export { default as PluginClass } from './src/main';`,
		resolveDir: root,
		loader: 'ts',
	},
	bundle: true,
	platform: 'node',
	format: 'cjs',
	external: ['obsidian'],
	write: false,
});

/** Records every transport call so the payload contract can be asserted. */
const calls = [];
const mockCalls = [];
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'not', 'but', 'note', 'notes', 'into', 'over', 'than', 'then']);

/**
 * Deterministic stand-in for a decision service: it answers every `choice` question by
 * keyword overlap against the criteria, echoes a served model and returns usage.
 */
function startMock() {
	return new Promise((resolve) => {
		const server = http.createServer((request, response) => {
			const send = (status, payload) => {
				response.writeHead(status, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify(payload));
			};
			if (request.method !== 'POST' || request.url.split('?')[0] !== '/api/alpha/decisions') {
				return send(404, { error: { code: 404, message: `Invalid URL (${request.method} ${request.url})` } });
			}
			let raw = '';
			request.on('data', (chunk) => { raw += chunk; });
			request.on('end', () => {
				mockCalls.push({ url: request.url, headers: request.headers, body: raw });
				const body = JSON.parse(raw);
				const state = JSON.stringify(body.state ?? '').toLowerCase();
				const answers = {};
				for (const [key, question] of Object.entries(body.questions ?? {})) {
					if (question.type !== 'choice') return send(400, { error: { code: 400, message: `unsupported question type ${question.type}` } });
					const words = String(question.criteria?.match ?? '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)
						.filter((word) => word.length > 3 && !STOPWORDS.has(word));
					const hit = words.some((word) => state.includes(word));
					answers[key] = {
						type: 'choice',
						choice: hit ? 'match' : 'other',
						confidence: hit ? 0.82 : 0.78,
						probabilities: { match: hit ? 0.82 : 0.18, other: hit ? 0.18 : 0.82 },
					};
				}
				send(200, { model: body.model || MOCK_SERVED_MODEL, answers, usage: { input_tokens: 128, output_tokens: 12 } });
			});
		});
		server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server));
	});
}

function createRequestUrl() {
	return async (options) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		const startedAt = Date.now();
		try {
			const response = await fetch(options.url, { method: options.method, headers: options.headers, body: options.body, signal: controller.signal });
			const text = await response.text();
			let json = null;
			try { json = JSON.parse(text); } catch { json = null; }
			calls.push({ url: options.url, headers: options.headers, body: options.body, status: response.status, ms: Date.now() - startedAt, text, json });
			return { status: response.status, text, json };
		} catch (error) {
			calls.push({ url: options.url, headers: options.headers, body: options.body, status: 0, ms: Date.now() - startedAt, text: String(error?.message || error), json: null });
			throw error;
		} finally {
			clearTimeout(timer);
		}
	};
}

/** Loads the real plugin sources with an obsidian shim whose requestUrl uses fetch. */
function load(requestUrl = createRequestUrl()) {
	const module = { exports: {} };
	const obsidian = {
		requestUrl,
		Modal: class { constructor(app) { this.app = app; } },
		Plugin: class {},
		PluginSettingTab: class {},
		Setting: class {},
		Notice: class {},
		TFile: class {},
		TFolder: class {},
		getAllTags: (cache) => cache.tags || [],
	};
	vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require: () => obsidian, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console, fetch });
	return module.exports;
}

const api = load();

let warnings = 0;
const warn = (message) => { warnings++; console.log(`   WARN  ${message}`); };
const ok = (message) => console.log(`   OK    ${message}`);

function printTable(results) {
	const width = Math.max(...results.map((result) => [...result.tagName].length), 6);
	console.log(`   ${'tag'.padEnd(width)}  prob    match  criteria`);
	for (const result of results) {
		console.log(`   ${result.tagName.padEnd(width)}  ${result.probability.toFixed(3)}   ${result.isMatch ? 'yes  ' : 'no   '}  ${result.description.slice(0, 60)}`);
	}
}

async function run() {
	const profile = { id: 'live', name: 'Live endpoint', endpoint: ENDPOINT, model: MODEL, apiKey: API_KEY };

	console.log(`1. Configuration${USE_MOCK ? ' (built-in mock decision service)' : ''}`);
	console.log(`   base URL:  ${ENDPOINT}\n   model:     ${MODEL || '<auto-detect>'}\n   api key:   ${mask(API_KEY)}\n   threshold: ${THRESHOLD}`);
	api.validateProfile(profile);
	ok('validateProfile accepts the profile');
	const resolved = api.resolveEndpoint(profile);
	ok(`resolveEndpoint -> ${resolved}`);
	if (!new URL(ENDPOINT).pathname.replace(/\/+$/, '')) assert.equal(resolved, `${ENDPOINT.replace(/\/+$/, '')}/api/alpha/decisions`);

	const plugin = new api.PluginClass();
	plugin.app = { vault: { read: async (file) => file.content } };
	plugin.settings = {
		models: [{ ...profile }],
		activeModelId: 'live',
		language: 'zh',
		confidenceThreshold: THRESHOLD,
		tags: TAGS.map((tag) => ({ ...tag })),
	};
	assert.equal(plugin.activeModel.id, 'live');

	console.log('\n2. Detection (base URL + API key only)');
	const detected = await new api.ModelClient({ ...profile, model: '' }).detect();
	const detectPayload = JSON.parse(calls.at(-1).body);
	assert.equal('model' in detectPayload, false, 'detection must not require a model ID');
	assert.equal(detectPayload.questions.q_detect.type, 'choice');
	ok(`HTTP ${calls.at(-1).status} -> detected decision model "${detected.model}" (${detected.inputTokens} input tokens)`);
	if (USE_MOCK) assert.equal(detected.model, MOCK_SERVED_MODEL);
	if (!detected.model) warn('the service did not report a model ID; set one in the profile');

	// Pin the detected model when the profile has none, mirroring the settings button.
	if (!plugin.settings.models[0].model) plugin.settings.models[0].model = detected.model;

	console.log(`\n3. Note classification (${NOTES.length} notes x ${enabledOf(plugin.settings.tags).length} tags)`);
	const quality = [];
	for (const note of NOTES) {
		const session = plugin.createEvaluationSession();
		const startedAt = Date.now();
		const results = await plugin.evaluateFile({ ...note, parent: { path: path.dirname(note.path) } }, session);
		const elapsed = Date.now() - startedAt;
		const tags = enabledOf(session.tags);

		assert.equal(results.length, tags.length, `expected one decision per enabled tag for ${note.basename}`);
		assert.deepEqual(results.map((result) => result.tagName).sort(), tags.map((tag) => tag.name).sort());
		for (const result of results) {
			assert.equal(typeof result.isMatch, 'boolean');
			assert.ok(result.probability >= 0 && result.probability <= 1, `probability out of range for ${result.tagName}`);
			assert.ok(result.description.length > 0, `missing criteria for ${result.tagName}`);
		}
		for (let i = 1; i < results.length; i++) assert.ok(results[i - 1].probability >= results[i].probability, 'results must be sorted by probability');

		const eligible = eligibleOf(results);
		const last = calls.at(-1);
		console.log(`\n   ${note.basename}  (${elapsed} ms, HTTP ${last?.status}, ${last?.json?.usage?.input_tokens ?? '?'} input tokens)`);
		printTable(results);
		console.log(`   -> eligible: ${eligible.length ? eligible.map((result) => `${result.tagName}@${result.probability.toFixed(2)}`).join(', ') : 'none'}`);

		const expected = note.expect.join('+') || 'no eligible tag';
		const hit = note.expect.every((name) => eligible.some((result) => result.tagName === name));
		const miss = note.expect.length === 0 && eligible.length === 0;
		if (hit || miss) ok(`matches expectation (${expected})`);
		else {
			quality.push(note.basename);
			warn(`expected "${expected}", got "${eligible.map((result) => result.tagName).join('+') || 'none'}"`);
		}
	}


	console.log('\n4. Request contract');
	const first = calls[1] ?? calls[0];
	assert.ok(first, 'expected at least one classification request');
	assert.equal(first.status, 200, `HTTP ${first.status}: ${first.text.slice(0, 300)}`);
	assert.equal(first.url, resolved);
	assert.equal(first.headers['Content-Type'], 'application/json');
	const payload = JSON.parse(first.body);
	assert.equal(payload.model, plugin.settings.models[0].model || undefined);
	assert.equal(payload.questions.q_AI.type, 'choice');
	assert.deepEqual(Object.keys(payload.questions).sort(), ['q_AI', 'q_异常检测', 'q_社交媒体', 'q_资讯'].sort());
	assert.equal(payload.questions.q_AI.criteria.match, TAGS[3].matchCriteria);
	assert.equal(payload.questions.q_AI.criteria.other, TAGS[3].otherCriteria);
	assert.ok(['title', 'headings', 'content_start', 'content_excerpt'].every((key) => key in payload.state));
	assert.ok(!JSON.stringify(payload).includes('oldtag'), 'frontmatter and inline tags must be stripped');
	ok(`POST ${first.url} -> 200 with ${Object.keys(payload.questions).length} choice questions`);
	ok(`state fields: ${Object.keys(payload.state).join(', ')}`);
	if (API_KEY) { assert.equal(first.headers.Authorization, `Bearer ${API_KEY}`); ok('Bearer authentication header present'); }
	else ok('no Authorization header sent (keyless service)');

	console.log('\n5. Disabled tags are excluded from the request');
	const scoped = new api.PluginClass();
	scoped.app = plugin.app;
	scoped.settings = { ...plugin.settings, tags: plugin.settings.tags.map((tag) => (tag.name === '资讯' ? { ...tag, enabled: false } : { ...tag })) };
	const scopedResults = await scoped.evaluateFile({ ...NOTES[0], parent: { path: '.' } }, scoped.createEvaluationSession());
	assert.equal(scopedResults.length, TAGS.length - 1);
	assert.ok(!scopedResults.some((result) => result.tagName === '资讯'));
	const scopedQuestions = Object.keys(JSON.parse(calls.at(-1).body).questions);
	assert.equal(scopedQuestions.includes('q_资讯'), false);
	ok(`3 enabled tags requested: ${scopedQuestions.join(', ')}`);

	console.log('\n6. Failures surface as ModelError without leaking the key');
	const failing = load(async () => ({ status: 401, text: '{"error":{"message":"invalid key"}}', json: { error: { message: 'invalid key' } } }));
	await assert.rejects(
		new failing.ModelClient({ ...profile, apiKey: 'sk-invalid' }).detect(),
		(error) => error.code === 'http' && error.status === 401 && !error.message.includes('sk-invalid'),
	);
	const malformed = load(async () => ({ status: 200, json: { answers: {} } }));
	await assert.rejects(new malformed.ModelClient(profile).detect(), (error) => error.code === 'response');
	ok('401 -> ModelError(http, 401), empty answers -> ModelError(response), both redacted');

	const responses = calls.filter((call) => call.status === 200);
	console.log(`\nSummary${USE_MOCK ? ' (mock)' : ''}`);
	console.log(`   requests: ${calls.length} (${responses.length} x HTTP 200), avg latency: ${Math.round(responses.reduce((sum, call) => sum + call.ms, 0) / (responses.length || 1))} ms`);
	console.log(`   decision model: ${detected.model || '(not reported)'}`);
	console.log(`   tag-quality warnings: ${warnings}${quality.length ? ` (${quality.join(', ')})` : ''}`);
	console.log(`   RESULT: protocol contract OK${quality.length ? ', tag quality needs attention' : ', tag quality within expectations'}`);
}

let mock;
try {
	if (USE_MOCK) mock = await startMock();
	await run();
} catch (error) {
	console.error('\nFAILED');
	if (error instanceof api.ModelError) console.error(`   ModelError(code=${error.code}, status=${error.status})`);
	else if (error?.code && !error?.stack?.includes('node:assert')) console.error(`   ${error.code}`);
	console.error(`   ${error?.stack || error}`);
	process.exitCode = 1;
} finally {
	if (mock) await new Promise((resolve) => mock.close(resolve));
}

