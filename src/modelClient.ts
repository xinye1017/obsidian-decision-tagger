import { requestUrl } from "obsidian";
import type { NoteEvaluationResult, TagDefinition } from "./jevClient";

/**
 * Every profile speaks the decision model protocol (System-1 / Decisions API):
 * POST {model?, state, questions} -> {answers, model, usage}.
 */
export interface ModelProfile {
	id: string;
	name: string;
	/** Base URL of the service, or a full decision endpoint. */
	endpoint: string;
	/** Optional: the model that answered is detected and stored when empty. */
	model: string;
	apiKey: string;
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

export function formatStateAsString(state: unknown): string {
	if (typeof state === "string") return state;
	if (!state || typeof state !== "object") return "";
	const record = state as Record<string, any>;
	const parts: string[] = [];
	if (record.title) parts.push(`Title: ${record.title}`);
	if (Array.isArray(record.headings) && record.headings.length) {
		parts.push(`Headings: ${record.headings.join(" > ")}`);
	}
	if (record.folder_context) parts.push(String(record.folder_context));
	if (record.content_start) parts.push(String(record.content_start));
	if (record.content_excerpt) parts.push(String(record.content_excerpt));
	return parts.join("\n\n");
}

export function defaultProfile(): ModelProfile {
	return { id: "typesafe", name: "TypeSafe", endpoint: PROVIDERS.typesafe.endpoint, model: PROVIDERS.typesafe.model, apiKey: "" };
}

function readProfile(value: any, fallback: ModelProfile): ModelProfile {
	return {
		id: typeof value?.id === "string" && value.id ? value.id : fallback.id,
		name: typeof value?.name === "string" && value.name ? value.name : fallback.name,
		endpoint: typeof value?.endpoint === "string" ? value.endpoint : fallback.endpoint,
		model: typeof value?.model === "string" ? value.model : fallback.model,
		apiKey: typeof value?.apiKey === "string" ? value.apiKey : fallback.apiKey,
	};
}

/** Legacy profiles may still carry the removed `protocol` field; it is dropped here. */
export function migrateModels(saved: any): {
	models: ModelProfile[];
	activeModelId: string;
	provider?: ModelProvider;
	apiKeys?: Record<ModelProvider, string>;
} {
	const defaultTs = defaultProfile();
	const defaultOr: ModelProfile = {
		id: "openrouter",
		name: "OpenRouter",
		endpoint: PROVIDERS.openrouter.endpoint,
		model: PROVIDERS.openrouter.model,
		apiKey: "",
	};

	let provider: ModelProvider = saved?.provider === "openrouter" || saved?.activeModelId === "openrouter" ? "openrouter" : "typesafe";
	const apiKeys: Record<ModelProvider, string> = {
		typesafe: saved?.apiKeys?.typesafe || (provider === "typesafe" ? (saved?.apiKey || "") : ""),
		openrouter: saved?.apiKeys?.openrouter || (provider === "openrouter" ? (saved?.apiKey || "") : ""),
	};

	let models: ModelProfile[];
	if (Array.isArray(saved?.models) && saved.models.length) {
		models = saved.models.map((p: any) => readProfile(p, defaultTs));
		const tsModel = models.find(m => m.id === "typesafe" || m.id === "jev");
		if (tsModel?.apiKey && !apiKeys.typesafe) apiKeys.typesafe = tsModel.apiKey;
		const orModel = models.find(m => m.id === "openrouter");
		if (orModel?.apiKey && !apiKeys.openrouter) apiKeys.openrouter = orModel.apiKey;
	} else {
		const ts = readProfile({ ...defaultTs, apiKey: saved?.apiKey || apiKeys.typesafe, endpoint: saved?.endpoint }, defaultTs);
		if (saved?.endpoint) {
			models = [ts];
		} else {
			const or = readProfile({ ...defaultOr, apiKey: apiKeys.openrouter }, defaultOr);
			models = [ts, or];
		}
	}

	const activeModelId = models.some(p => p.id === saved?.activeModelId)
		? saved.activeModelId
		: (models.some(p => p.id === provider) ? provider : models[0].id);

	return { models, activeModelId, provider, apiKeys };
}

export class ModelError extends Error {
	constructor(public code: "config" | "network" | "timeout" | "response" | "http" | "cancelled", public status = 0) {
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

export function servedModel(data: any, fallback: string): string {
	return typeof data?.model === "string" && data.model ? data.model : fallback;
}

/**
 * Reads one `choice` answer per enabled tag from the decision response.
 * Answers must be present exactly once; anything else fails closed.
 */
export function parseResults(data: any, tags: TagDefinition[]): NoteEvaluationResult[] {
	return tags.filter(t => t.enabled).map(tag => {
		const answer = data?.answers?.[`q_${tag.name}`];
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
	constructor(profile: ModelProfile) { this.profile = { ...profile }; }

	private modelField(): Record<string, string> {
		const model = this.profile.model.trim();
		return model ? { model } : {};
	}

	// requestUrl cannot abort its transport. Cancellation/timeout discard late responses.
	private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
		validateProfile(this.profile);
		if (signal?.aborted) throw new ModelError("cancelled");
		const data = await new Promise<any>((resolve, reject) => {
			let settled = false;
			const timer = setTimeout(() => finish(new ModelError("timeout")), 60_000);
			const abort = () => finish(new ModelError("cancelled"));
			const finish = (error?: ModelError, value?: unknown) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				if (error) reject(error); else resolve(value);
			};
			signal?.addEventListener("abort", abort, { once: true });
			Promise.resolve().then(() => {
				if (signal?.aborted) throw new ModelError("cancelled");
				return requestUrl({
				url: resolveEndpoint(this.profile), method: "POST", throw: false,
				headers: { "Content-Type": "application/json", ...(this.profile.apiKey ? { Authorization: `Bearer ${this.profile.apiKey}` } : {}) },
				body: JSON.stringify(body),
				});
			}).then(response => {
				if (settled) return;
				if (response.status < 200 || response.status >= 300) return finish(new ModelError("http", response.status));
				try { finish(undefined, response.json); } catch { finish(new ModelError("response")); }
			}, error => finish(error instanceof ModelError ? error : new ModelError("network")));
		});
		if (signal?.aborted) throw new ModelError("cancelled");
		return data;
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
		const answer = data?.answers?.q_detect;
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
		return { model: servedModel(data, this.profile.model), probability, inputTokens: Number(data?.usage?.input_tokens ?? data?.usage?.total_tokens) || 0 };
	}
}
