/**
 * E2E de TELA real — QA autônomo FRENTE 2 (2026-07-01), Passos 5-7 (web).
 *
 * Régua nova da skill qa-autonomo (§5): determinístico (unit/cassette) é PISO,
 * mas o fluxo crítico de tela (recomendação → simulador → decisão → contratar)
 * EXIGE spec Playwright rodando de verdade contra o browser. Os cenários já
 * estavam "✅ verde (determinístico)" no ledger anterior — esta spec fecha o
 * gap de TELA.
 *
 * Funil upstream (Passo 1 nome / Passo 3 identidade) está bloqueado — território
 * da FRENTE 1 (ver docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md).
 * Em vez de tentar dirigir o funil do zero, SEMEIA o estado direto no ponto
 * crítico (scripts/seed-recomendacao.ts) — identidade + qualificação já
 * completos, searchDispatched=false — e deixa o PRÓXIMO turno do usuário
 * disparar a busca REAL na Bevi + reveal, exatamente como aconteceria num
 * usuário real que terminou a qualificação (§4.2.2 "provisione o estado",
 * estendido à TELA).
 *
 * Pré-requisito: container UP + chromium do sistema + seed rodado FORA da
 * spec (docker exec não existe dentro do container onde o Playwright roda —
 * ver local-dev-notes.md §"Seed do estado apto FORA da spec"). O runner
 * (scripts/run-e2e-recomendacao.sh) chama scripts/seed-recomendacao.ts DUAS
 * vezes no HOST via docker exec e injeta os resultados via env vars
 * SEED_CONVERSATION_ID(_2)/SEED_WEB_COOKIE(_2) — cada teste usa a SUA própria
 * conversa (2 testes independentes, cada um dispara sua própria busca real).
 *
 * IMPORTANTE (achado via TDD nesta rodada, não é bug — é FIX-49 por design):
 * uma vez que um NOVO turno acontece (ex.: abrir o simulador), o artifact do
 * turno ANTERIOR é SELADO (`artifact-renderer.tsx`: `pointer-events-none` +
 * `inert` + disabled) — não é clicável nunca mais. Por isso o cenário
 * "Tenho interesse → avanço direto" e o cenário "simulador" são dois TESTES
 * SEPARADOS, cada um com sua própria conversa: testar os dois em sequência na
 * MESMA conversa clicaria um botão intencionalmente selado (falso-bug).
 */
import { expect, type Page, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const BASE_URL =
	process.env.PLAYWRIGHT_TEST_BASE_URL || "http://aja-improving-web-conversation.orb.local";

type SeedResult = { conversationId: string; webCookie: string };

function loadSeedFromEnv(suffix: "" | "_2"): SeedResult {
	const conversationId = process.env[`SEED_CONVERSATION_ID${suffix}`];
	const webCookie = process.env[`SEED_WEB_COOKIE${suffix}`];
	if (!conversationId || !webCookie) {
		throw new Error(
			`SEED_CONVERSATION_ID${suffix}/SEED_WEB_COOKIE${suffix} ausentes — rode via scripts/run-e2e-recomendacao.sh (o seed roda FORA do container, docker exec não existe dentro dele).`,
		);
	}
	return { conversationId, webCookie };
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

/** Escopa TODAS as buscas de texto/role ao diálogo do chat — a landing por trás
 * do teatro tem uma seção de marketing ("Na prática") com um mockup ESTÁTICO do
 * chat (mesmas palavras: "Recomendação", "Tenho interesse" etc.) que colide com
 * locators soltos na página inteira. */
function chatDialog(page: Page) {
	return page.getByRole("dialog", { name: "Conversa com a Aja Agora" });
}

async function openTheaterAndResume(page: Page, webCookie: string): Promise<void> {
	await page.context().addCookies([{ name: "aja_uid", value: webCookie, url: BASE_URL }]);
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const start = page.getByRole("button", { name: "Começar", exact: true }).first();
	await start.waitFor({ state: "visible", timeout: 20_000 });
	await start.click();

	// meaningfulProgress=true (maxStageReached=qualificado) → popup de retomada.
	const voltar = page.getByRole("button", { name: /Voltar à conversa/i });
	await expect(voltar).toBeVisible({ timeout: 15_000 });
	await voltar.click();
}

async function sendMessage(page: Page, text: string): Promise<void> {
	const input = page.getByLabel("Digite sua mensagem");
	await input.waitFor({ state: "visible", timeout: 10_000 });
	await input.fill(text);
	await page.getByLabel("Enviar mensagem").click();
}

test.describe("FRENTE 2 — Passo 5-7 (web, E2E de tela real)", () => {
	test("recomendação real + outras opções + avanço DIRETO ao fechamento (sem card de decisão extra)", async ({
		page,
	}) => {
		test.setTimeout(280_000);
		const seed = loadSeedFromEnv("");
		try {
			await openTheaterAndResume(page, seed.webCookie);
			const dialog = chatDialog(page);

			// dispara o gate "search" (ready_to_proceed) — busca REAL na Bevi
			// (searchDispatched=false no seed) → reveal + recommendation_card.
			await sendMessage(page, "Bora, pode me mostrar as opções agora");

			await expect(dialog.getByText("Recomendação", { exact: true })).toBeVisible({
				timeout: 90_000,
			});
			await expect(dialog.getByText(/Parcela mensal/i).first()).toBeVisible();
			// Valor REAL em BRL (não mock) — assertion de valor.
			await expect(dialog.locator("p", { hasText: /^R\$\s?[\d.,]+\/mês$/ }).first()).toBeVisible();

			// "Outras opções" — comparison_table determinístico (P5, D22): carrossel
			// com as OUTRAS ofertas reais (exclui a recomendada, sem duplicar).
			const otherOptionButtons = dialog.getByRole("button", { name: /^Simular .+ por mês$/ });
			await expect(otherOptionButtons.first()).toBeVisible({ timeout: 15_000 });
			expect(await otherOptionButtons.count()).toBeGreaterThanOrEqual(2);

			await page.screenshot({ path: "test-results/frente2-01-recomendacao.png", fullPage: true });

			// ── "Tenho interesse" (CTA da RecommendationCard, turno ATIVO — ainda
			// não selado) → avanço DIRETO ao fechamento (FIX-38/D18), SEM card de
			// decisão extra no meio.
			const interesseCta = dialog.getByRole("button", { name: /Tenho interesse/i }).first();
			await expect(interesseCta).toBeEnabled({ timeout: 15_000 });
			await interesseCta.click();

			// Paridade D18: NUNCA deve aparecer um card de decisão extra
			// ("Esse plano faz sentido?") entre o clique e o formulário de contrato.
			await expect(dialog.getByTestId("decision-contratar")).toHaveCount(0);

			// Passo 6 "Contratar" — contract_form (identidade já on file → modo
			// confirmação, sem re-digitar CPF).
			await expect(
				dialog.getByTestId("contract-stored").or(dialog.getByTestId("contract-cpf")),
			).toBeVisible({ timeout: 45_000 });

			await page.screenshot({
				path: "test-results/frente2-03-avanco-direto-contract-form.png",
				fullPage: true,
			});

			// ── Confirma LGPD + envia — cria a proposta REAL na Bevi (Trilho A).
			await dialog.getByTestId("contract-lgpd").click();
			await expect(dialog.getByTestId("contract-submit")).toBeEnabled({ timeout: 5_000 });
			await dialog.getByTestId("contract-submit").click();

			// D10 (jornada-canonica.md, P0 CONHECIDO): Trilho A trava ao vivo (400
			// productId/AGX) — causa EXTERNA (conta Bevi/AGX), não corrigível no
			// código. O produto trata com DEGRADAÇÃO GRACIOSA (route.ts: catch
			// genérico → mensagem amigável + contractRetryPending=true), NUNCA
			// crash/trava. Esta spec observa a REALIDADE ao vivo — aceita os dois
			// desfechos possíveis e reporta qual ocorreu (nunca força um dos dois).
			const realOffer = dialog.getByTestId("offer-confirm");
			const gracefulError = dialog.getByText(
				/problema ao falar com a administradora|habilitação com a administradora|valor mínimo/i,
			);
			await expect(realOffer.or(gracefulError)).toBeVisible({ timeout: 60_000 });

			await page.screenshot({
				path: "test-results/frente2-04-contract-submit-resultado.png",
				fullPage: true,
			});

			if (await realOffer.isVisible()) {
				console.log(
					"=== D10 (Trilho A) OK ao vivo — proposta real criada, seguindo pro fechamento ===",
				);
				await realOffer.click();

				// closingPresentation bundla signature_handoff + document_upload +
				// "Parabéns" no MESMO turno (docx passo 5) — espera o desfecho final
				// (Parabéns) direto; doc-upload pode chegar sealado (turno anterior)
				// se render junto, não é ação necessária neste cenário (é opcional).
				const congrats = dialog.getByText(/Parabéns/i);
				await expect(congrats).toBeVisible({ timeout: 45_000 });

				// Passo 6 DES-1: NUNCA promete "assinatura" — só "Ver minha proposta" (PDF).
				await expect(dialog.getByText(/assinatura|assinar/i)).toHaveCount(0);
				const signatureLink = dialog.getByTestId("signature-link").first();
				if (await signatureLink.isVisible().catch(() => false)) {
					await expect(signatureLink).toContainText(/proposta/i);
				}

				await page.screenshot({
					path: "test-results/frente2-05-passo7-confirmacao.png",
					fullPage: true,
				});
			} else {
				console.log(
					"=== D10 (Trilho A) reproduzido ao vivo: erro gracioso confirmado, NÃO travou a tela ===",
				);
			}
		} finally {
			await cleanupSeed(seed.conversationId);
		}
	});

	test("simulador de contemplação recalcula ao vivo (3/6/12 meses) + ressalva CDC", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const seed = loadSeedFromEnv("_2");
		try {
			await openTheaterAndResume(page, seed.webCookie);
			const dialog = chatDialog(page);

			await sendMessage(page, "Bora, pode me mostrar as opções agora");
			await expect(dialog.getByText("Recomendação", { exact: true })).toBeVisible({
				timeout: 90_000,
			});

			// O reveal ofereceu o simulador via chips ("Quero ver!" / "Agora não").
			const simuladorSim = dialog.getByRole("button", { name: "Quero ver!" });
			await expect(simuladorSim).toBeVisible({ timeout: 20_000 });
			await simuladorSim.click();

			const slider = dialog.getByRole("slider", { name: "Mês alvo de contemplação" });
			await expect(slider).toBeVisible({ timeout: 45_000 });

			// Ressalva de estimativa (CDC art. 30/37) — disclaimer fixo do dial.
			await expect(dialog.getByTestId("dial-disclaimer")).toContainText(
				/estimativa|não é garantida/i,
			);

			// Lê o valor ANTES de arrastar (assertion de VALOR, não pixel).
			const receiptBefore = await dialog
				.locator("text=/Lance pra contemplar no mês/")
				.locator("..")
				.innerText();
			const before = await slider.getAttribute("aria-valuenow");

			await slider.focus();
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");

			const after = await slider.getAttribute("aria-valuenow");
			expect(Number(after)).not.toBe(Number(before));

			const receiptAfter = await dialog
				.locator("text=/Lance pra contemplar no mês/")
				.locator("..")
				.innerText();
			// Mudou o mês-alvo → o texto do "lance pra contemplar no mês N" tem que
			// citar o NOVO mês (assertion de valor: o recálculo aconteceu de verdade,
			// não é só o ponteiro visual andando).
			expect(receiptAfter).toContain(`mês ${after}`);
			expect(receiptAfter).not.toBe(receiptBefore);

			await page.screenshot({ path: "test-results/frente2-02-simulador-dial.png", fullPage: true });
		} finally {
			await cleanupSeed(seed.conversationId);
		}
	});
});
