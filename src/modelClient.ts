import { requestUrl } from "obsidian";
import type { NoteEvaluationResult, TagDefinition } from "./jevClient";
import { classifyStatus, KeyPool } from "./keyPool";

/**
 * Every profile speaks the decision model protocol (System-1 / Decisions API):
 * POST {model?, state, questions} -> {answers, model, usage}.
 *
 * Credentials do not live on the profile: they live in a KeyPool, one key per
 * account, so a request can rotate to the next account when one is unavailable.
 */
export interface ModelProfile {
	id: string;
	name: string;
	/** Base URL of the service, or a full decision endpoint. */
	endpoint: string;
	/** Optional: the model that answered is detected and stored when empty. */
	model: string;
}

export interface ModelDetection {
	model: string;
	probability: number;
	inputTokens: number;
}

/** Path appended to a plain base URL, matching the OpenRouter Decisions API. */
const DECISIONS_SUFFIX = "/api/alpha/decisions";
/** Bases that already host the decisions API below them. */
const DECISIONS_ALPHA_SUFFIX = "/alpha/decisions";
const FULL_DECISIONS_PATH = /\/(decisions|systemone)$/;

export type ModelProvider = "typesafe" | "openrouter";

export interface ProviderInfo {
	id: ModelProvider;
	name: string;
	endpoint: string;
	model: string;
}

export const PROVIDERS: Record<ModelProvider, ProviderInfo> = {
	typesafe: {
		id: "typesafe",
		name: "TypeSafe",
		endpoint: "https://api.typesafe.ai/v1/systemone",
		model: "jev-latest",
	},
	openrouter: {
		id: "openrouter",
		name: "OpenRouter",
		endpoint: "https://openrouter.ai/api/alpha/decisions",
		model: "respan/span-01-lite:free",
	},
};

export function isNoulProvider(profile: ModelProfile): boolean {
	return profile.id === "openrouter" || profile.endpoint.includes("openrouter.ai");
}

export interface DecisionAnswer {
	choice?: string;
	confidence?: number;
	probabilities?: {
		match?: number;
		other?: number;
		[key: string]: number | undefined;
	};
	type?: string;
	noul?: number;
}

export interface DecisionResponse {
	model?: string;
	answers?: Record<string, DecisionAnswer>;
	usage?: {
		input_tokens?: number;
		total_tokens?: number;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export function formatStateAsString(state: unknown): string {
	if (typeof state === "string") return state;
	if (!state || typeof state !== "object") return "";
	const record = state as Record<string, unknown>;
	const parts: string[] = [];
	if (typeof record.title === "string" && record.title) parts.push(`Title: ${record.title}`);
	if (Array.isArray(record.headings) && record.headings.length) {
		parts.push(`Headings: ${record.headings.map(h => String(h)).join(" > ")}`);
	}
	if (record.folder_context) parts.push(String(record.folder_context));
	if (record.content_start) parts.push(String(record.content_start));
	if (record.content_excerpt) parts.push(String(record.content_excerpt));
	return parts.join("\n\n");
}

export function defaultProfile(): ModelProfile {
	return { id: "typesafe", name: "TypeSafe", endpoint: PROVIDERS.typesafe.endpoint, model: PROVIDERS.typesafe.model };
}

function readProfile(value: unknown, fallback: ModelProfile): ModelProfile {
	const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
	return {
		id: typeof record?.id === "string" && record.id ? record.id : fallback.id,
		name: typeof record?.name === "string" && record.name ? record.name : fallback.name,
		endpoint: typeof record?.endpoint === "string" ? record.endpoint : fallback.endpoint,
		model: typeof record?.model === "string" ? record.model : fallback.model,
	};
}

/** Keys are stored as a list; a single saved string becomes a one key pool. */
function readKeyList(value: unknown, legacy: unknown = ""): string[] {
	const saved: unknown[] = Array.isArray(value) ? (value as unknown[]) : typeof value === "string" ? [value] : [];
	const legacyList: unknown[] = typeof legacy === "string" ? [legacy] : [];
	const combined: unknown[] = [...saved, ...legacyList];
	const keys = combined
		.filter((key): key is string => typeof key === "string" && !!key.trim())
		.map(key => key.trim());
	return [...new Set(keys)];
}

/** Legacy profiles may still carry the removed `protocol` field; it is dropped here. */
export function migrateModels(saved: unknown): {
	models: ModelProfile[];
	activeModelId: string;
	provider?: ModelProvider;
	apiKeys?: Record<ModelProvider, string[]>;
} {
	const savedRecord = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : null;
	const defaultTs = defaultProfile();
	const defaultOr: ModelProfile = {
		id: "openrouter",
		name: "OpenRouter",
		endpoint: PROVIDERS.openrouter.endpoint,
		model: PROVIDERS.openrouter.model,
	};

	let provider: ModelProvider = savedRecord?.provider === "openrouter" || savedRecord?.activeModelId === "openrouter" ? "openrouter" : "typesafe";
	const apiKeysRecord = savedRecord?.apiKeys && typeof savedRecord.apiKeys === "object" ? (savedRecord.apiKeys as Record<string, unknown>) : null;
	const apiKeys: Record<ModelProvider, string[]> = {
		typesafe: readKeyList(apiKeysRecord?.typesafe, provider === "typesafe" ? savedRecord?.apiKey : ""),
		openrouter: readKeyList(apiKeysRecord?.openrouter, provider === "openrouter" ? savedRecord?.apiKey : ""),
	};

	let models: ModelProfile[];
	if (Array.isArray(savedRecord?.models) && savedRecord.models.length) {
		const modelsList = savedRecord.models as unknown[];
		// Older profiles carried their own key; harvest it into the pool before it is dropped.
		const legacyKeys = (id: string) => {
			const found = modelsList.find(m => m && typeof m === "object" && (m as Record<string, unknown>).id === id);
			return readKeyList((found as Record<string, unknown> | undefined)?.apiKey);
		};
		models = modelsList.map(p => readProfile(p, defaultTs));
		if (!apiKeys.typesafe.length) apiKeys.typesafe = legacyKeys("typesafe");
		if (!apiKeys.openrouter.length) apiKeys.openrouter = legacyKeys("openrouter");
	} else {
		const ts = readProfile({ ...defaultTs, endpoint: savedRecord?.endpoint }, defaultTs);
		if (savedRecord?.endpoint) {
			models = [ts];
		} else {
			const or = readProfile({ ...defaultOr }, defaultOr);
			models = [ts, or];
		}
	}

	const activeModelId = typeof savedRecord?.activeModelId === "string" && models.some(p => p.id === savedRecord.activeModelId)
		? savedRecord.activeModelId
		: (models.some(p => p.id === provider) ? provider : models[0].id);

	return { models, activeModelId, provider, apiKeys };
}

export class ModelError extends Error {
	constructor(public code: "config" | "network" | "timeout" | "response" | "http" | "cancelled" | "quota", public status = 0) {
		super(code);
	}
}

export function validateProfile(profile: ModelProfile): void {
	try {
		const url = new URL(profile.endpoint.trim());
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
	} catch { throw new ModelError("config"); }
}

/**
 * Turns a base URL into the decision endpoint. Full decision endpoints
 * (`.../decisions`, `.../systemone`) and `/api` or `/v1` bases are kept as they are.
 */
export function resolveEndpoint(profile: ModelProfile): string {
	const url = new URL(profile.endpoint.trim());
	const path = url.pathname.replace(/\/+$/, "");
	if (FULL_DECISIONS_PATH.test(path)) url.pathname = path;
	else if (path.endsWith("/api") || path.endsWith("/v1")) url.pathname = `${path}${DECISIONS_ALPHA_SUFFIX}`;
	else url.pathname = `${path}${DECISIONS_SUFFIX}`;
	return url.toString();
}

function score(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new ModelError("response");
	return value;
}

export function servedModel(data: unknown, fallback: string): string {
	const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
	return typeof record?.model === "string" && record.model ? record.model : fallback;
}

/**
 * Reads one `choice` answer per enabled tag from the decision response.
 * Answers must be present exactly once; anything else fails closed.
 */
export function parseResults(data: unknown, tags: TagDefinition[]): NoteEvaluationResult[] {
	const resp = data && typeof data === "object" ? (data as DecisionResponse) : null;
	return tags.filter(t => t.enabled).map(tag => {
		const answer = resp?.answers?.[`q_${tag.name}`];
		if (!answer) throw new ModelError("response");
		if (typeof answer.choice === "string" && ["match", "other"].includes(answer.choice)) {
			const probability = answer.probabilities?.match !== undefined
				? score(answer.probabilities.match)
				: answer.choice === "match" ? score(answer.confidence) : 1 - score(answer.confidence);
			return { tagName: tag.name, probability, confidence: score(answer.confidence ?? probability), isMatch: answer.choice === "match", description: tag.matchCriteria };
		}
		if (answer.type === "noul" && typeof answer.noul === "number") {
			const probability = score(answer.noul);
			return {
				tagName: tag.name,
				probability,
				confidence: probability,
				isMatch: probability >= 0.5,
				description: tag.matchCriteria,
			};
		}
		throw new ModelError("response");
	}).sort((a, b) => b.probability - a.probability);
}

export function isEligible(result: NoteEvaluationResult, threshold: number): boolean {
	return result.isMatch && result.probability >= threshold;
}

/** Built-in probe used to verify a service and discover which decision model answers. */
const DETECTION_QUESTION = { type: "choice", instructions: "Is this note about software testing?", criteria: { match: "Software testing", other: "Other topics" } };
const DETECTION_STATE = { title: "Connection test", content_start: "This note describes a software connection test." };

export class ModelClient {
	readonly profile: ModelProfile;
	readonly pool: KeyPool;
	/** An empty pool sends unauthenticated requests, which keyless local services accept. */
	constructor(profile: ModelProfile, pool: KeyPool = new KeyPool()) {
		this.profile = { ...profile };
		this.pool = pool;
	}

	private modelField(): Record<string, string> {
		const model = this.profile.model.trim();
		return model ? { model } : {};
	}

	// requestUrl cannot abort its transport. Cancellation/timeout discard late responses.
	private sendOnce(body: Record<string, unknown>, key: string | null, signal?: AbortSignal): Promise<DecisionResponse> {
		return new Promise<DecisionResponse>((resolve, reject) => {
			let settled = false;
			const timer = window.setTimeout(() => finish(new ModelError("timeout")), 60_000);
			const abort = () => finish(new ModelError("cancelled"));
			const finish = (error?: ModelError, value?: DecisionResponse) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				if (error) reject(error); else resolve(value as DecisionResponse);
			};
			signal?.addEventListener("abort", abort, { once: true });
			Promise.resolve().then(() => {
				if (signal?.aborted) throw new ModelError("cancelled");
				return requestUrl({
					url: resolveEndpoint(this.profile), method: "POST", throw: false,
					headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
					body: JSON.stringify(body),
				});
			}).then(response => {
				if (settled) return;
				if (response.status < 200 || response.status >= 300) return finish(new ModelError("http", response.status));
				try { finish(undefined, response.json as DecisionResponse); } catch { finish(new ModelError("response")); }
			}, (error: unknown) => finish(error instanceof ModelError ? error : new ModelError("network")));
		});
	}

	/**
	 * Sends the body with the next key in rotation. A non-200 is recorded against
	 * the key that served it and the request moves on to the next account, so one
	 * rate limited, exhausted or dead account cannot block the pool.
	 */
	private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<DecisionResponse> {
		validateProfile(this.profile);
		if (signal?.aborted) throw new ModelError("cancelled");
		const anonymous = this.pool.size === 0;
		const attempts = anonymous ? 1 : this.pool.size;
		let lastError: ModelError | null = null;
		for (let attempt = 0; attempt < attempts; attempt++) {
			const key = anonymous ? null : this.pool.take() ?? null;
			if (!anonymous && !key) break;
			const started = Date.now();
			try {
				const data = await this.sendOnce(body, key, signal);
				if (key) this.pool.record(key, "healthy", Date.now() - started, 200);
				if (signal?.aborted) throw new ModelError("cancelled");
				return data;
			} catch (error) {
				const failure = error instanceof ModelError ? error : new ModelError("network");
				// Transport level failures are not the key's fault, so they are not rotated.
				if (failure.code !== "http") throw failure;
				if (key) this.pool.record(key, classifyStatus(failure.status), Date.now() - started, failure.status);
				lastError = failure;
			} finally {
				if (key) this.pool.release(key);
			}
		}
		if (signal?.aborted) throw new ModelError("cancelled");
		throw lastError ?? new ModelError("quota");
	}

	/** Sends one question per enabled tag and returns the parsed decisions. */
	async evaluateNote(state: Record<string, unknown> | string, tags: TagDefinition[], signal?: AbortSignal): Promise<NoteEvaluationResult[]> {
		const enabled = tags.filter(t => t.enabled);
		if (!enabled.length) return [];
		const isNoul = isNoulProvider(this.profile);
		const formattedState = isNoul ? formatStateAsString(state) : state;
		const questions = Object.fromEntries(enabled.map(tag => [
			`q_${tag.name}`,
			isNoul ? {
				type: "noul",
				instructions: tag.instructions,
				criteria: { true: tag.matchCriteria, false: tag.otherCriteria },
			} : {
				type: "choice",
				instructions: tag.instructions,
				criteria: { match: tag.matchCriteria, other: tag.otherCriteria },
			}
		]));
		const data = await this.post({ ...this.modelField(), state: formattedState, questions }, signal);
		return parseResults(data, enabled);
	}

	/**
	 * Probes the service with a built-in question and reports the decision model
	 * that answered, so a profile only needs a base URL and an API key.
	 */
	async detect(signal?: AbortSignal): Promise<ModelDetection> {
		const isNoul = isNoulProvider(this.profile);
		const state = isNoul ? "This note describes a software connection test." : DETECTION_STATE;
		const questions = isNoul ? {
			q_detect: {
				type: "noul",
				instructions: "Is this note about software testing?",
				criteria: { true: "Software testing", false: "Other topics" },
			},
		} : {
			q_detect: DETECTION_QUESTION,
		};
		const data = await this.post({ ...this.modelField(), state, questions }, signal);
		const answer = data.answers?.q_detect;
		if (!answer) throw new ModelError("response");
		let probability = 0;
		if (typeof answer.choice === "string" && ["match", "other"].includes(answer.choice)) {
			probability = answer.probabilities?.match !== undefined
				? score(answer.probabilities.match)
				: answer.choice === "match" ? score(answer.confidence) : 1 - score(answer.confidence);
		} else if (answer.type === "noul" && typeof answer.noul === "number") {
			probability = score(answer.noul);
		} else {
			throw new ModelError("response");
		}
		const inputTokens = typeof data.usage?.input_tokens === "number"
			? data.usage.input_tokens
			: typeof data.usage?.total_tokens === "number"
			? data.usage.total_tokens
			: 0;
		return { model: servedModel(data, this.profile.model), probability, inputTokens };
	}
}
