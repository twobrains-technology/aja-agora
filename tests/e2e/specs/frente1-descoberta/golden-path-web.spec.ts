import { expect, test } from "@playwright/test";
import { cleanupConversation, closeDb, getConversation, getMessages } from "../../utils/db";

// Golden path E2E de TELA REAL — Passos 1→4 da jornada canônica, canal WEB.
// Régua da skill qa-autonomo (2026-07-01): fluxo crítico de tela exige spec
// Playwright rodando de verdade (não MCP manual) até o reveal do Passo 5.
//
// Cobre: welcome (3 categorias) → nome (Passo 1) → experience/consent (Passo 2)
// → identidade CPF+celular ANTES do valor (Passo 3, FIX-53) → valor do bem
// (agulha, Passo 2) → lance/lance-embutido (Passo 2) → busca REAL na Bevi +
// reveal (Passo 4, sem mock — P7).
//
// Credenciais: `.env.test` (E2E_TEST_CPF/E2E_TEST_CELULAR), fonte
// `secrets.sh decrypt contas-teste` — NUNCA hardcoded (conta Kairo, homologação).

const CPF = process.env.E2E_TEST_CPF;
const CELULAR = process.env.E2E_TEST_CELULAR;

test.describe("Frente 1 — golden path web (Passos 1-4 até o reveal)", () => {
	test.skip(!CPF || !CELULAR, "faltam E2E_TEST_CPF/E2E_TEST_CELULAR em .env.test");

	let conversationId: string | null = null;

	test.afterEach(async () => {
		if (conversationId) await cleanupConversation(conversationId);
		await closeDb();
	});

	test("percorre welcome → nome → qualificação → identidade → reveal com carta REAL da Bevi", async ({
		page,
	}) => {
		test.setTimeout(120_000);

		// Captura o conversationId do primeiro POST /api/chat (gerado client-side).
		const firstChatRequest = page.waitForRequest(
			(req) => req.url().includes("/api/chat") && req.method() === "POST",
		);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		// Passo 1 — welcome com 3 categorias (Imóvel/Carro/Moto, sem "Outros").
		const composer = page.locator("form").first();
		await expect(composer.getByRole("button", { name: "Imóvel" })).toBeVisible();
		await expect(composer.getByRole("button", { name: "Carro" })).toBeVisible();
		await expect(composer.getByRole("button", { name: "Moto" })).toBeVisible();
		await expect(composer.getByRole("button", { name: "Outros" })).toHaveCount(0);

		await composer.getByRole("button", { name: "Carro" }).click();

		const req = await firstChatRequest;
		const body = req.postDataJSON() as { conversationId?: string };
		conversationId = body.conversationId ?? null;
		expect(conversationId, "conversationId deveria vir no POST /api/chat").toBeTruthy();

		const dialog = page.getByRole("dialog", { name: /conversa com a aja agora/i });
		await expect(dialog).toBeVisible();

		// Passo 1 — pergunta o nome, captura em 1 turno (card dedicado, FIX-17).
		await expect(dialog.getByTestId("name-input")).toBeVisible({ timeout: 20_000 });
		await dialog.getByTestId("name-input").fill("Kairo");
		await dialog.getByTestId("name-submit").click();

		// Passo 2 — "já fez consórcio antes?"
		await expect(dialog.getByRole("button", { name: "Já conheço" })).toBeVisible({
			timeout: 20_000,
		});
		await dialog.getByRole("button", { name: "Já conheço" }).click();

		// Consent — "Posso te fazer 3 perguntinhas rápidas?"
		await expect(dialog.getByRole("button", { name: "Bora!" })).toBeVisible({ timeout: 20_000 });
		await dialog.getByRole("button", { name: "Bora!" }).click();

		// Passo 3 — identidade ANTES do valor (FIX-53, decisão do stakeholder:
		// identity sobe pra antes do credit). CPF/celular reais de homologação.
		await expect(dialog.getByTestId("identify-cpf")).toBeVisible({ timeout: 20_000 });
		await dialog.getByTestId("identify-cpf").fill(CPF as string);
		await dialog.getByTestId("identify-phone").fill(CELULAR as string);
		await dialog.getByTestId("identify-lgpd").click();
		await expect(dialog.getByTestId("identify-submit")).toBeEnabled();
		await dialog.getByTestId("identify-submit").click();

		// Passo 2 — valor do bem, agulha simples (FIX-115), sem prazo/parcela/intents.
		await expect(dialog.getByTestId("value-input-credit")).toBeVisible({ timeout: 20_000 });
		await dialog.getByTestId("value-input-credit").fill("95000");
		await dialog.getByRole("button", { name: "Buscar opções" }).click();

		// Passo 2 — intenção de lance + educação de lance embutido embutida (FIX-118).
		await expect(dialog.getByRole("button", { name: "Por enquanto não" })).toBeVisible({
			timeout: 20_000,
		});
		await dialog.getByRole("button", { name: "Por enquanto não" }).click();

		await expect(
			dialog.getByRole("button", { name: "Não, prefiro sem lance embutido" }),
		).toBeVisible({ timeout: 20_000 });
		await dialog.getByRole("button", { name: "Não, prefiro sem lance embutido" }).click();

		// Passo 4 — busca REAL na Bevi (P7: nunca mock) + reveal do Passo 5.
		await expect(dialog.getByText("Recomendação", { exact: true })).toBeVisible({
			timeout: 45_000,
		});
		await expect(dialog.getByRole("button", { name: "Tenho interesse" }).first()).toBeVisible();

		// Assertion de VALOR (não pixel): parcela mensal é um valor monetário real.
		const parcelaText = await dialog.getByText("Parcela mensal").locator("..").innerText();
		expect(parcelaText).toMatch(/R\$\s?[\d.,]+\/mês/);

		await page.screenshot({
			path: "tests/e2e/artifacts/golden-path-web-passo1-4-reveal-spec.png",
			fullPage: false,
		});

		// ─── Assertions de DB (comportamento, não só render) ───────────────────
		const conv = await getConversation(conversationId as string);
		expect(conv, "conversation deveria existir no DB").toBeTruthy();
		expect(conv.contact_name).toBe("Kairo");

		const meta = conv.metadata as Record<string, unknown>;
		expect(meta.identityCollected, "identidade tem que estar marcada coletada").toBe(true);
		expect(meta.currentCategory).toBe("auto");
		expect(meta.searchDispatched, "busca tem que ter disparado (Passo 4)").toBe(true);

		// Meta-narrativa PROIBIDA (P4 da jornada): o agente nunca narra o mecanismo
		// ("vou buscar", "usando a ferramenta") nem inventa "dificuldade técnica"
		// pra mascarar o gate de identidade.
		const messages = await getMessages(conversationId as string);
		const assistantText = messages
			.filter((m) => m.role === "assistant")
			.map((m) => m.content)
			.join("\n");
		const metaNarrativeLeak =
			/vou (buscar|usar a ferramenta)|usando a ferramenta|dificuldade (em acessar|t[ée]cnica)/i;
		expect(
			assistantText,
			`meta-narrativa vazou no histórico:\n${assistantText}`,
		).not.toMatch(metaNarrativeLeak);
	});
});
