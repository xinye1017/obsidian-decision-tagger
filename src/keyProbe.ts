import { ModelClient, ModelError, ModelProfile } from "./modelClient";
import { classifyStatus, KeyPool } from "./keyPool";

/**
 * Probes every key in the pool with the built-in detection question and records
 * the outcome, so the settings screen can show how many accounts are usable,
 * what share of the pool that is, and how fast they answer.
 *
 * Keys are probed one at a time on purpose: a burst of parallel probes would
 * trip the very rate limits the pool exists to work around. Returns the model
 * that answered, or an empty string when no key responded.
 */
export async function probeKeys(profile: ModelProfile, pool: KeyPool, signal?: AbortSignal): Promise<string> {
	let servedModel = "";
	for (const key of pool.keys) {
		if (signal?.aborted) break;
		// A single key pool keeps a failing probe from rotating onto its neighbours.
		const started = Date.now();
		try {
			const detected = await new ModelClient(profile, new KeyPool([key])).detect(signal);
			pool.record(key, "healthy", Date.now() - started, 200);
			servedModel = servedModel || detected.model;
		} catch (error) {
			const failure = error instanceof ModelError ? error : new ModelError("network");
			const status = failure.code === "http" ? classifyStatus(failure.status) : "unknown";
			pool.record(key, status, Date.now() - started, failure.status);
			if (failure.code === "cancelled") break;
		}
	}
	return servedModel;
}
