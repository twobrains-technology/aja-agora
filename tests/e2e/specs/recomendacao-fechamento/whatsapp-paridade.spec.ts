/**
 * E2E de TELA real — QA autônomo FRENTE 2 (2026-07-01), paridade WhatsApp.
 *
 * Reconfirma ao vivo (via /admin/simulator/whatsapp — mesmo processTextMessage
 * do webhook real, só a saída pra Meta API é interceptada) as correções da
 * onda `divergencias-jornada` que o ledger anterior só validou por
 * cassette+code-review:
 *   - FIX-116/D11: WhatsApp NUNCA promete "assinatura" (DES-1)
 *   - FIX-117/D18: "Tenho interesse" avança DIRETO ao fechamento (paridade)
 *
 * Semeia a conversa (channel=whatsapp) já no ponto do Passo 5 — mesma técnica
 * do spec web (scripts/seed-recomendacao.ts com SEED_CHANNEL=whatsapp).
 *
 * FORA de escopo desta spec (documentado, não é lacuna escondida): upload de
 * documento inbound (FIX-122/D13) não tem afordance de UI no simulador
 * (whatsapp-stage.tsx só manda texto/interactive — sem input de arquivo). Ver
 * observação no ledger — validado via webhook direto, não é E2E de TELA.
 */
import { expect, type Page, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

type SeedResult = { conversationId: string };

function loadSeedFromEnv(): SeedResult {
	const conversationId = process.env.SEED_WA_CONVERSATION_ID;
	if (!conversationId) {
		throw new Error(
			"SEED_WA_CONVERSATION_ID ausente — rode via scripts/run-e2e-whatsapp.sh (seed fora do container).",
		);
	}
	return { conversationId };
}

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

async function cleanupSeed(conversationId: string) {
	await withDb(async (db) => {
		await db.query("DELETE FROM bevi_proposals WHERE conversation_id = $1", [conversationId]);
		await db.query(
			"DELETE FROM lead_events WHERE lead_id IN (SELECT id FROM leads WHERE conversation_id = $1)",
			[conversationId],
		);
		await db.query("DELETE FROM leads WHERE conversation_id = $1", [conversationId]);
		await db.query("DELETE FROM messages WHERE conversation_id = $1", [conversationId]);
		await db.query("DELETE FROM conversations WHERE id = $1", [conversationId]);
	});
}

async function loginAdmin(page: Page): Promise<void> {
	await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
	await page.getByLabel("Email*").fill(ADMIN_EMAIL);
	await page.getByLabel("Senha*").fill(ADMIN_PASSWORD);
	await page.getByRole("button", { name: "Entrar" }).click();
	// Regex ANTERIOR (/\/admin(\/|$)/) casava com a PRÓPRIA /admin/login — o
	// waitForURL resolvia na hora, sem esperar o redirect pós-login de verdade.
	await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

test.describe("FRENTE 2 — paridade WhatsApp (E2E de tela real via simulador)", () => {
	test("reveal real + Tenho interesse avança direto + NUNCA promete assinatura", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const seed = loadSeedFromEnv();
		try {
			await loginAdmin(page);
			await page.goto("/admin/simulator/whatsapp", { waitUntil: "domcontentloaded" });

			// Seleciona a conversa semeada na lista (contactName único).
			const item = page.getByRole("button", { name: /QA-E2E-WA/ });
			await expect(item).toBeVisible({ timeout: 15_000 });
			await item.click();

			const input = page.getByPlaceholder(/mensagem/i);
			await expect(input).toBeVisible({ timeout: 15_000 });
			await input.fill("Bora, pode me mostrar as opções agora");
			await page.keyboard.press("Enter");

			// Reveal ao vivo — assertion de valor real (BRL), não mock.
			await expect(page.getByText(/^R\$\s?[\d.,]+/).first()).toBeVisible({ timeout: 90_000 });

			// DES-1 (FIX-116): NUNCA promete "assinatura" em nenhuma bolha.
			await expect(page.getByText(/assinatura|assinar/i)).toHaveCount(0);

			await page.screenshot({
				path: "test-results/frente2-wa-01-reveal.png",
				fullPage: true,
			});

			// "Tenho interesse" — botão interactive do WhatsApp (reply button).
			const interesse = page.getByRole("button", { name: /Tenho interesse/i }).first();
			await expect(interesse).toBeVisible({ timeout: 30_000 });
			await interesse.click();

			// Paridade D18/FIX-117: avanço DIRETO — NUNCA o card "Esse plano faz
			// sentido?" (decision_prompt) aparece entre o clique e o contrato.
			await expect(page.getByText(/Esse plano faz sentido/i)).toHaveCount(0);

			// Passo 6 (contratar) — algum indício de coleta de dados/proposta.
			await expect(page.getByText(/CPF|celular|proposta|dados/i).first()).toBeVisible({
				timeout: 45_000,
			});

			// Reconfirma DES-1 no transcript INTEIRO pós-avanço.
			await expect(page.getByText(/assinatura|assinar/i)).toHaveCount(0);

			await page.screenshot({
				path: "test-results/frente2-wa-02-avanco-direto.png",
				fullPage: true,
			});
		} finally {
			await cleanupSeed(seed.conversationId);
		}
	});
});
