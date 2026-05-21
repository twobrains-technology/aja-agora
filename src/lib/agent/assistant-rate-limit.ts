/**
 * Rate limiter in-memory pra POST /api/admin/personas/[id]/assist.
 *
 * 10 requests por minuto por admin. In-memory porque o tráfego do backoffice
 * é baixo e o cluster ECS tem 1-2 tasks — distributed lock seria over-engineering.
 * Se escalar, trocar por redis sliding window.
 */

const WINDOW_MS = 60_000;
const MAX = 10;

const buckets = new Map<string, number[]>();

export function rateLimit(key: string): {
	allowed: boolean;
	retryAfterMs?: number;
} {
	const now = Date.now();
	const bucket = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (bucket.length >= MAX) {
		const oldest = bucket[0];
		return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
	}
	bucket.push(now);
	buckets.set(key, bucket);
	return { allowed: true };
}

export function _resetForTests() {
	buckets.clear();
}
