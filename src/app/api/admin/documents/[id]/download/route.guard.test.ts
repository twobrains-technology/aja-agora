// Camada 1 (structural) — FIX-83: download de documento de cliente (PII de
// identidade) exige sessão de ADMIN, mais restrito que a listagem (viewer/attendant).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FIX-83 — guard estrutural do download de documento de cliente", () => {
	it('exige requireRole("admin") — mais restrito que a listagem (viewer/attendant)', () => {
		const src = readFileSync(
			resolve(process.cwd(), "src/app/api/admin/documents/[id]/download/route.ts"),
			"utf8",
		);
		expect(src).toContain('requireRole("admin")');
	});

	it("registra audit (recordClientDocumentDownload) antes de responder a URL", () => {
		const src = readFileSync(
			resolve(process.cwd(), "src/app/api/admin/documents/[id]/download/route.ts"),
			"utf8",
		);
		expect(src).toContain("recordClientDocumentDownload");
	});
});
