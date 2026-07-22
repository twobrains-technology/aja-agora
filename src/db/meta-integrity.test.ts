import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regressão FIX-100 (bloco-rev-e / develop-quebrada-drizzle-meta):
// O meta do Drizzle estava corrompido — snapshots 0011-0013 com o MESMO id
// (colisão) e snapshots 0014-0028 AUSENTES → `drizzle-kit generate` quebrava
// com "are pointing to a parent snapshot ... which is a collision", forçando
// as migrations recentes a serem escritas À MÃO. Estes asserts garantem que a
// cadeia de snapshots permaneça íntegra (1 snapshot por entry do journal, ids
// únicos, prevId encadeado) — pré-condição para `db:generate` voltar a operar.

const META_DIR = join(process.cwd(), "drizzle", "meta");

type Snapshot = { id: string; prevId: string };
type JournalEntry = { idx: number; tag: string };

function readJournalEntries(): JournalEntry[] {
	const journal = JSON.parse(readFileSync(join(META_DIR, "_journal.json"), "utf-8"));
	return (journal.entries ?? []) as JournalEntry[];
}

function snapshotFileFor(idx: number): string {
	return `${String(idx).padStart(4, "0")}_snapshot.json`;
}

function readSnapshot(idx: number): Snapshot {
	return JSON.parse(readFileSync(join(META_DIR, snapshotFileFor(idx)), "utf-8")) as Snapshot;
}

describe("drizzle meta integrity", () => {
	const entries = readJournalEntries();

	it("tem ao menos a cadeia conhecida de migrations (0000-0028)", () => {
		expect(entries.length).toBeGreaterThanOrEqual(29);
	});

	it("toda entry do journal tem um snapshot correspondente em meta/", () => {
		const onDisk = new Set(readdirSync(META_DIR));
		const missing = entries.map((e) => snapshotFileFor(e.idx)).filter((f) => !onDisk.has(f));
		expect(missing).toEqual([]);
	});

	it("todos os ids de snapshot são únicos (sem colisão)", () => {
		const ids = entries.map((e) => readSnapshot(e.idx).id);
		const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
		expect(dupes).toEqual([]);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("a cadeia prevId→id está encadeada na ordem do journal", () => {
		let prev = "00000000-0000-0000-0000-000000000000";
		for (const entry of entries) {
			const snap = readSnapshot(entry.idx);
			expect(snap.prevId, `prevId quebrado em ${snapshotFileFor(entry.idx)}`).toBe(prev);
			prev = snap.id;
		}
	});
});
