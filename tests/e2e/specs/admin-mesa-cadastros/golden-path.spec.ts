/**
 * E2E golden path — backoffice da mesa de operação (bloco mesa-a).
 * Fluxo real (sem mock): login admin → cria administradora (slug auto) →
 * cria atendente de mesa (whatsapp normalizado E.164) → assertions de VALOR na UI.
 *
 * Validado ao vivo no QA noturno 2026-06-21 (browser real via MCP) — este spec é o
 * artefato re-rodável de regressão. Upload de doc PDF (storage+extração) é coberto
 * por src/app/api/admin/administradora-docs/route.integration.test.ts (DB real).
 *
 * Pré-requisito: container da branch UP em PLAYWRIGHT_TEST_BASE_URL (HTTP .orb.local,
 * pra casar trustedOrigins do better-auth) + admin seedado (ADMIN_EMAIL/ADMIN_PASSWORD).
 */
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const SUFFIX = Date.now().toString(36);
const ADM_NOME = `E2E Mesa Adm ${SUFFIX}`;
const ADM_SLUG = `e2e-mesa-adm-${SUFFIX}`;
const ATT_NOME = `E2E Mesa Atendente ${SUFFIX}`;
const ATT_WHATS_E164 = "5562988887777";

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

test.beforeAll(async ({ request }) => {
	// limpeza idempotente de execuções anteriores
	await withDb(async (db) => {
		await db.query("DELETE FROM administradoras WHERE nome LIKE 'E2E Mesa Adm %'");
		await db.query("DELETE FROM mesa_attendants WHERE nome LIKE 'E2E Mesa Atendente %'");
	});
	// skip se a rota não existe no alvo (servidor sem a branch)
	const probe = await request.get("/api/admin/administradoras", { failOnStatusCode: false });
	if (probe.status() === 404) test.skip(true, "Rotas da mesa-a ausentes no alvo.");
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query("DELETE FROM administradoras WHERE nome = $1", [ADM_NOME]);
		await db.query("DELETE FROM mesa_attendants WHERE nome = $1", [ATT_NOME]);
	});
});

async function loginAdmin(page: import("@playwright/test").Page) {
	await page.goto("/admin/login");
	await page.fill("#userEmail", ADMIN_EMAIL);
	await page.fill("#password", ADMIN_PASSWORD);
	await page.click('button[type="submit"]:has-text("Entrar")');
	await page.waitForURL("**/admin", { timeout: 15_000 });
}

test("cria administradora com slug auto e atendente de mesa com whatsapp E.164", async ({
	page,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");
	await loginAdmin(page);

	// ── Administradora ──
	await page.goto("/admin/administradoras");
	await page.getByRole("button", { name: "Adicionar administradora" }).click();
	await page.getByRole("textbox", { name: "Nome" }).fill(ADM_NOME);
	await page.getByRole("textbox", { name: "Código Bevi (opcional)" }).fill("E2ECODE");
	await page.getByRole("button", { name: "Adicionar" }).click();

	// assertion de valor na UI: nome + slug derivado aparecem
	await expect(page.getByRole("cell", { name: ADM_NOME })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole("cell", { name: ADM_SLUG })).toBeVisible();

	// assertion de valor no DB
	await withDb(async (db) => {
		const { rows } = await db.query(
			"SELECT slug, codigo_bevi, is_active FROM administradoras WHERE nome = $1",
			[ADM_NOME],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].slug).toBe(ADM_SLUG);
		expect(rows[0].codigo_bevi).toBe("E2ECODE");
		expect(rows[0].is_active).toBe(true);
	});

	// ── Atendente de mesa ──
	await page.goto("/admin/atendentes-mesa");
	await page.getByRole("button", { name: "Adicionar atendente" }).click();
	await page.getByRole("textbox", { name: "Nome" }).fill(ATT_NOME);
	await page.getByRole("textbox", { name: "WhatsApp (com DDI+DDD)" }).fill("(62) 98888-7777");
	await page.getByRole("button", { name: "Adicionar" }).click();

	await expect(page.getByRole("cell", { name: ATT_NOME })).toBeVisible({ timeout: 15_000 });
	// whatsapp exibido formatado a partir do E.164
	await expect(page.getByRole("cell", { name: "+55 (62) 98888-7777" })).toBeVisible();

	// assertion de valor no DB: whatsapp normalizado E.164 com DDI
	await withDb(async (db) => {
		const { rows } = await db.query("SELECT whatsapp FROM mesa_attendants WHERE nome = $1", [
			ATT_NOME,
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].whatsapp).toBe(ATT_WHATS_E164);
	});
});
