/**
 * One key per account, rotated round-robin. The pool is pure state: it holds no
 * network code and no secrets of its own, so rotation can be reasoned about and
 * tested on its own. Secrets live in plugin settings; this only remembers what
 * each key last did.
 */

export type KeyStatus = "unknown" | "healthy" | "limited" | "invalid" | "banned" | "exhausted";

/** Statuses a key never recovers from on its own; only a fresh probe brings it back. */
const PERMANENT: readonly KeyStatus[] = ["invalid", "banned", "exhausted"];

/** How long a 429 (or any unclassified failure) keeps a key parked before it is retried. */
export const DEFAULT_COOLDOWN_MS = 60_000;

export interface KeyState {
	status: KeyStatus;
	/** HTTP status of the last response, 0 when the key was never used. */
	lastStatus: number;
	/** Round trip of the last successful response, 0 when the key is not healthy. */
	latencyMs: number;
	/** When the key was last used or probed, 0 when it never was. */
	checkedAt: number;
	/** Timestamp until which the key is skipped after a transient failure. */
	cooldownUntil: number;
}

export function freshKeyState(): KeyState {
	return { status: "unknown", lastStatus: 0, latencyMs: 0, checkedAt: 0, cooldownUntil: 0 };
}

/**
 * 2xx is healthy, 429 is a rate limit worth keeping around, 401/402/403 mean the
 * account itself is finished, and anything else says nothing about the key and
 * is treated as a transient failure.
 */
export function classifyStatus(status: number): KeyStatus {
	if (status >= 200 && status < 300) return "healthy";
	if (status === 401) return "invalid";
	if (status === 402) return "exhausted";
	if (status === 403) return "banned";
	if (status === 429) return "limited";
	return "unknown";
}

export interface PoolSummary {
	total: number;
	healthy: number;
	/** 429 keys, kept in the pool but parked until the cooldown ends. */
	limited: number;
	/** 401 / 402 / 403 keys that rotation will not touch again. */
	dead: number;
	unchecked: number;
	/** Keys that can serve a request right now. */
	usable: number;
	/** usable / total, 0 when the pool is empty. */
	percent: number;
	/** Mean latency across the healthy keys, 0 when none answered yet. */
	avgLatencyMs: number;
}

export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Keeps a secret readable in settings and logs without printing it in full. */
export function maskKey(secret: string): string {
	if (secret.length <= 8) return secret;
	return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

export class KeyPool {
	private readonly states = new Map<string, KeyState>();
	private readonly clock: () => number;
	private cursor = 0;
	readonly cooldownMs: number;

	constructor(readonly keys: readonly string[] = [], options: { cooldownMs?: number; now?: () => number } = {}) {
		this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
		this.clock = options.now ?? Date.now;
		for (const key of this.keys) if (key) this.states.set(key, freshKeyState());
	}

	get size(): number {
		return this.states.size;
	}

	state(key: string): KeyState {
		return this.states.get(key) ?? freshKeyState();
	}

	/** A key serves requests while it is neither parked nor permanently finished. */
	selectable(key: string): boolean {
		const state = this.state(key);
		return state.cooldownUntil <= this.clock() && !PERMANENT.includes(state.status);
	}

	available(): string[] {
		return this.keys.filter(key => this.selectable(key));
	}

	/** Next key in rotation order, or undefined when the pool has nothing left to offer. */
	take(): string | undefined {
		for (let step = 0; step < this.keys.length; step++) {
			const index = (this.cursor + step) % this.keys.length;
			const key = this.keys[index];
			if (this.selectable(key)) {
				this.cursor = (index + 1) % this.keys.length;
				return key;
			}
		}
		return undefined;
	}

	record(key: string, status: KeyStatus, latencyMs = 0, httpStatus = 0): void {
		const state = this.state(key);
		state.status = status;
		state.lastStatus = httpStatus;
		state.checkedAt = this.clock();
		if (status === "healthy") {
			state.latencyMs = latencyMs;
			state.cooldownUntil = 0;
		} else {
			state.latencyMs = 0;
			state.cooldownUntil = PERMANENT.includes(status) ? 0 : this.clock() + this.cooldownMs;
		}
	}

	summary(): PoolSummary {
		const states = this.keys.map(key => this.state(key));
		const healthy = states.filter(state => state.status === "healthy");
		const measured = healthy.filter(state => state.latencyMs > 0);
		const usable = this.available().length;
		return {
			total: this.size,
			healthy: healthy.length,
			limited: states.filter(state => state.status === "limited").length,
			dead: states.filter(state => PERMANENT.includes(state.status)).length,
			unchecked: states.filter(state => state.checkedAt === 0).length,
			usable,
			percent: this.size ? usable / this.size : 0,
			avgLatencyMs: measured.length
				? Math.round(measured.reduce((sum, state) => sum + state.latencyMs, 0) / measured.length)
				: 0,
		};
	}
}
