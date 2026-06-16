/**
 * E2E — FIX-46 + FIX-49 + FIX-51: retomada same-device pelo TEATRO.
 *
 * A rota /chat foi removida (refactor: entradas apontam pro teatro). O resume
 * acontece ao abrir o painel teatro pela landing. Cobre:
 *  - FIX-51: conversa com progresso real → POPUP "voltar / começar nova".
 *      • "Voltar à conversa" → histórico reaparece + âncora FIX-49.
 *      • "Começar nova" → thread limpa (histórico NÃO aparece).
 *  - primeira vez (sem cookie) → sem popup, sem histórico (zero atrito).
 *
 * Determinístico: seed direto no DB (não invoca o agente) + entrada "Começar"
 * (seed VAZIO → não dispara /api/chat) + reduced-motion (pula o morph).
 *
 * Pré-requisito: container UP em PLAYWRIGHT_TEST_BASE_URL + DATABASE_URL.
 *
 * ⚠️ NÃO confirmado verde na sessão de implementação (2026-06-16): a máquina
 * estava saturada por carga concorrente (outro worktree Superset), e o E2E
 * estourou o timeout. A lógica do popup está coberta por component tests
 * determinísticos (resume.meaningful, resume-prompt, theater-chat.resume-prompt)
 * e o endpoint /api/chat/resume foi verificado servindo meaningfulProgress.
 * Rodar este spec numa máquina ociosa pra fechar a cobertura de browser real.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://aja-polir-funil-retorno.orb.local";

const COOKIE = `e2e-fix51-${randomUUID()}`;
const convId = randomUUID();
const TAG = COOKIE.slice(0, 8);
const MSG_USER = `quero um apartamento — ${TAG}`;
const MSG_ASSISTANT = `legal, vamos planejar isso — ${TAG}`;

// reduced-motion → pula o morph do teatro (determinístico, sem WAAPI).
test.use({ reducedMotion: "reduce" });

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

async function openTheater(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	// "Começar" da navbar abre o teatro com seed VAZIO (não dispara /api/chat).
	// Espera a hidratação tornar o botão acionável antes de clicar (evita o
	// click ficar pendurado no actionTimeout infinito padrão).
	const start = page.getByRole("button", { name: "Começar", exact: true }).first();
	await start.waitFor({ state: "visible", timeout: 20_000 });
	await start.click();
}

test.beforeAll(async ({ request }, testInfo) => {
	const probe = await request.get("/api/chat/resume", { failOnStatusCode: false });
	if (probe.status() === 404) {
		testInfo.skip(true, "Rota /api/chat/resume não existe no servidor alvo.");
	}
	// 4 mensagens → acima do limiar (meaningfulProgress) → popup aparece (FIX-51).
	await withDb(async (db) => {
		await db.query(
			`INSERT INTO conversations (id, channel, status, metadata) VALUES ($1,'web','active',$2)`,
			[convId, JSON.stringify({ webCookie: COOKIE })],
		);
		const seed = [
			["user", MSG_USER],
			["assistant", MSG_ASSISTANT],
			["user", `e quanto fica por mês — ${TAG}`],
			["assistant", `dá pra caber no seu orçamento — ${TAG}`],
		];
		for (const [role, content] of seed) {
			await db.query(
				`INSERT INTO messages (conversation_id, role, content, channel) VALUES ($1,$2,$3,'web')`,
				[convId, role, content],
			);
		}
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query("DELETE FROM conversations WHERE id = $1", [convId]);
	});
});

test("FIX-51: progresso real → popup; 'Voltar à conversa' restaura histórico + âncora (FIX-49)", async ({
	context,
	page,
}) => {
	await context.addCookies([{ name: "aja_uid", value: COOKIE, url: BASE_URL, httpOnly: true }]);
	await openTheater(page);

	// Popup de escolha aparece (não hidrata direto).
	await expect(page.getByText(/Continuar de onde você parou/i)).toBeVisible({ timeout: 15_000 });

	await page.getByRole("button", { name: /Voltar à conversa/i }).click();

	// Histórico reaparece + âncora FIX-49.
	await expect(page.getByText(MSG_USER)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText(MSG_ASSISTANT)).toBeVisible();
	await expect(page.getByTestId("resume-anchor")).toBeVisible();
	await page.screenshot({ path: "test-results/fix51-voltar.png", fullPage: true });
});

test("FIX-51: 'Começar nova' abre thread limpa (histórico NÃO aparece)", async ({
	context,
	page,
}) => {
	await context.addCookies([{ name: "aja_uid", value: COOKIE, url: BASE_URL, httpOnly: true }]);
	await openTheater(page);

	await expect(page.getByText(/Continuar de onde você parou/i)).toBeVisible({ timeout: 15_000 });
	await page.getByRole("button", { name: /Começar nova/i }).click();

	// Thread limpa: o histórico antigo NÃO pode aparecer.
	await page.waitForTimeout(800);
	await expect(page.getByText(MSG_USER)).toHaveCount(0);
	await expect(page.getByTestId("resume-anchor")).toHaveCount(0);
	await page.screenshot({ path: "test-results/fix51-nova.png", fullPage: true });
});

test("primeira vez (sem cookie) → sem popup, sem histórico", async ({ context, page }) => {
	await context.clearCookies();
	await openTheater(page);
	// dá tempo de resolver o resume; nada de popup nem histórico anterior
	await page.waitForTimeout(1500);
	await expect(page.getByText(/Continuar de onde você parou/i)).toHaveCount(0);
	await expect(page.getByText(MSG_USER)).toHaveCount(0);
});
