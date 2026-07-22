import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { type PersonaExample, personas } from "@/db/schema";
import type { Category } from "./personas";
import type { PersonaRow } from "./system-prompt";

const TTL_MS = 30_000;

type CacheEntry = { row: PersonaRow; expiresAt: number };
const cache = new Map<string, CacheEntry>();

type ResolveCacheEntry = { id: string; expiresAt: number };
const resolveCache = new Map<string, ResolveCacheEntry>();

let expertisesByCategoryCache: { value: Record<Category, string[]>; expiresAt: number } | null =
	null;

function resolveCacheKey(category: Category, expertise: string | null): string {
	return `${category}::${expertise ?? "*"}`;
}

export async function getPersona(id: string): Promise<PersonaRow> {
	const now = Date.now();
	const cached = cache.get(id);
	if (cached && cached.expiresAt > now) return cached.row;

	const row = await db.query.personas.findFirst({
		where: eq(personas.id, id),
	});
	if (!row) throw new Error(`persona "${id}" not found`);
	if (!row.isActive) throw new Error(`persona "${id}" is inactive`);

	cache.set(id, { row, expiresAt: now + TTL_MS });
	return row;
}

export async function listPersonas(): Promise<PersonaRow[]> {
	return db.query.personas.findMany({
		orderBy: (p, { asc }) => [asc(p.id)],
	});
}

// Admin-only read: bypasses cache + isActive guard so admins can edit inactive personas.
export async function getPersonaForAdmin(id: string): Promise<PersonaRow> {
	const row = await db.query.personas.findFirst({
		where: eq(personas.id, id),
	});
	if (!row) throw new Error(`persona "${id}" not found`);
	return row;
}

// Picks the active specialist persona for a category. If `expertiseHint` is given,
// tries an exact match first; falls back to the generalist (expertise IS NULL).
// Throws if neither exists — caller is expected to handle gracefully.
export async function pickPersonaForCategory(
	category: Category,
	expertiseHint?: string | null,
): Promise<PersonaRow> {
	const now = Date.now();
	const hint = expertiseHint && expertiseHint.length > 0 ? expertiseHint : null;
	const key = resolveCacheKey(category, hint);
	const cached = resolveCache.get(key);
	if (cached && cached.expiresAt > now) {
		return getPersona(cached.id);
	}

	if (hint) {
		const match = await db.query.personas.findFirst({
			where: and(
				eq(personas.category, category),
				eq(personas.role, "specialist"),
				eq(personas.isActive, true),
				eq(personas.expertise, hint),
			),
			orderBy: [asc(personas.id)],
		});
		if (match) {
			resolveCache.set(key, { id: match.id, expiresAt: now + TTL_MS });
			cache.set(match.id, { row: match, expiresAt: now + TTL_MS });
			return match;
		}
	}

	const generalist = await db.query.personas.findFirst({
		where: and(
			eq(personas.category, category),
			eq(personas.role, "specialist"),
			eq(personas.isActive, true),
			isNull(personas.expertise),
		),
		orderBy: [asc(personas.id)],
	});
	if (generalist) {
		resolveCache.set(key, { id: generalist.id, expiresAt: now + TTL_MS });
		cache.set(generalist.id, { row: generalist, expiresAt: now + TTL_MS });
		return generalist;
	}

	// Last resort: any active specialist of the category. Avoids fully breaking
	// the conversation if admin forgot a generalist.
	const fallback = await db.query.personas.findFirst({
		where: and(
			eq(personas.category, category),
			eq(personas.role, "specialist"),
			eq(personas.isActive, true),
		),
		orderBy: [desc(personas.expertise), asc(personas.id)],
	});
	if (!fallback) throw new Error(`no active specialist persona for category "${category}"`);
	resolveCache.set(key, { id: fallback.id, expiresAt: now + TTL_MS });
	cache.set(fallback.id, { row: fallback, expiresAt: now + TTL_MS });
	return fallback;
}

// Returns active expertise tags grouped by category. Used by the analyzer
// to anchor sub-topic detection ("only pick from the listed values").
export async function listExpertisesByCategory(): Promise<Record<Category, string[]>> {
	const now = Date.now();
	if (expertisesByCategoryCache && expertisesByCategoryCache.expiresAt > now) {
		return expertisesByCategoryCache.value;
	}

	const rows = await db
		.select({ category: personas.category, expertise: personas.expertise })
		.from(personas)
		.where(
			and(
				eq(personas.role, "specialist"),
				eq(personas.isActive, true),
				sql`${personas.expertise} IS NOT NULL`,
			),
		);

	const out: Record<Category, string[]> = { imovel: [], auto: [], moto: [] };
	for (const r of rows) {
		if (!r.category || !r.expertise) continue;
		const cat = r.category as Category;
		if (!out[cat].includes(r.expertise)) out[cat].push(r.expertise);
	}
	for (const list of Object.values(out)) list.sort();

	expertisesByCategoryCache = { value: out, expiresAt: now + TTL_MS };
	return out;
}

export async function createPersona(input: {
	id: string;
	displayName: string;
	role: "concierge" | "specialist";
	category: Category | null;
	expertise?: string | null;
	voiceTone: string;
	temperature?: number;
	examples?: PersonaExample[];
	activeTools?: string[];
	isActive?: boolean;
}): Promise<PersonaRow> {
	const [created] = await db
		.insert(personas)
		.values({
			id: input.id,
			displayName: input.displayName,
			role: input.role,
			category: input.category,
			expertise: input.expertise ?? null,
			voiceTone: input.voiceTone,
			temperature: input.temperature ?? 0.7,
			examples: input.examples ?? [],
			activeTools: input.activeTools ?? [],
			isActive: input.isActive ?? true,
		})
		.returning();

	invalidateAll();
	return created;
}

export class PersonaVersionConflictError extends Error {
	constructor(
		public readonly expectedVersion: number,
		public readonly currentVersion: number,
	) {
		super(
			`Persona version conflict: client viu version=${expectedVersion} mas servidor está em version=${currentVersion}. Outro admin editou a persona enquanto você estava trabalhando.`,
		);
		this.name = "PersonaVersionConflictError";
	}
}

export async function updatePersona(
	id: string,
	patch: Partial<Omit<PersonaRow, "id" | "version" | "createdAt" | "updatedAt">> & {
		expectedVersion?: number;
	},
): Promise<PersonaRow> {
	const { expectedVersion, ...fields } = patch;
	const previous = await db.query.personas.findFirst({
		where: eq(personas.id, id),
	});
	if (!previous) throw new Error(`persona "${id}" not found`);

	// Optimistic concurrency: se cliente disse a versão que viu, exigir match.
	if (typeof expectedVersion === "number" && previous.version !== expectedVersion) {
		throw new PersonaVersionConflictError(expectedVersion, previous.version);
	}

	// Bump version pra invalidar o cache de agentes (cacheKey usa version).
	const nextVersion = previous.version + 1;
	const [updated] = await db
		.update(personas)
		.set({ ...fields, version: nextVersion })
		.where(eq(personas.id, id))
		.returning();

	cache.delete(id);
	resolveCache.clear();
	expertisesByCategoryCache = null;
	return updated;
}

export function invalidatePersona(id: string): void {
	cache.delete(id);
	resolveCache.clear();
	expertisesByCategoryCache = null;
}

export function invalidateAll(): void {
	cache.clear();
	resolveCache.clear();
	expertisesByCategoryCache = null;
}
