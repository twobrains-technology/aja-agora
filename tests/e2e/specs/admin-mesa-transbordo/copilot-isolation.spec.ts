/**
 * E2E de TELA real — copiloto da mesa + isolamento entre atendentes.
 *
 * QA autônomo Frente 3 (2026-07-01): jornada §"Copiloto da mesa" promete "responde
 * 'como faço X na tela da administradora?' com passo a passo" e "não vaza pra quem
 * não é o dono do handoff" — cobertura anterior era só cassette/integration (mock do
 * LLM), nunca a TELA real do painel (o pedido explícito desta rodada: "não só via
 * WhatsApp simulator"). Esta spec abre 2 sessões de atendente DIFERENTES, cada uma
 * já dona do SEU próprio caso (claim via tela, não SQL), e:
 *
 * 1. Atendente A pergunta "como faço X na administradora Y?" na tela → recebe
 *    orientação de verdade (LLM real, sem mock) renderizada como bolha na tela.
 * 2. Confirma isolamento do COPILOTO: a resposta de A nunca menciona o manual/
 *    administradora exclusivos do caso de B, e vice-versa. Isso NÃO é "a tela
 *    nunca mostra o outro cliente" — o broadcast (D15) mostra o dossiê a TODOS
 *    os atendentes ativos ANTES do claim, por design (é assim que a corrida
 *    funciona). O vazamento que a jornada proíbe é o copiloto de A responder
 *    com o dossiê/manual do caso de B (ou vice-versa) — isso sim nunca pode
 *    acontecer, e é o que esta spec prova via 2 manuais com termos exclusivos.
 *
 * Pré-requisito: container UP em PLAYWRIGHT_TEST_BASE_URL (.orb.local) + admin
 * seedado + DATABASE_URL do workspace + ANTHROPIC_API_KEY válida (LLM real).
 */
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const SUFFIX = Date.now().toString(36);
const ADM_A_NOME = `E2E Copiloto Adm A ${SUFFIX}`;
const ADM_B_NOME = `E2E Copiloto Adm B ${SUFFIX}`;
const ADM_A_SLUG = `e2e-copiloto-adm-a-${SUFFIX}`;
const ADM_B_SLUG = `e2e-copiloto-adm-b-${SUFFIX}`;
const LEAD_A_NOME = `E2E Copiloto Cliente A ${SUFFIX}`;
const LEAD_B_NOME = `E2E Copiloto Cliente B ${SUFFIX}`;
const NOME_A = `E2E Copiloto Atendente A ${SUFFIX}`;
const NOME_B = `E2E Copiloto Atendente B ${SUFFIX}`;
const PHONE_A_LOCAL = "64988880001";
const PHONE_B_LOCAL = "64988880002";
const PHONE_A_FULL = `55${PHONE_A_LOCAL}`;
const PHONE_B_FULL = `55${PHONE_B_LOCAL}`;

let leadAId: string;
let leadBId: string;
let admAId: string;
let admBId: string;

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

async function seedLeadWithProposal(
	db: Client,
	leadNome: string,
	phone: string,
	admNome: string,
	proposalId: string,
) {
	const conv = await db.query(
		`INSERT INTO conversations (channel, status) VALUES ('whatsapp','active') RETURNING id`,
	);
	const convId = conv.rows[0].id;
	const lead = await db.query(
		`INSERT INTO leads (conversation_id, name, phone, stage) VALUES ($1,$2,$3,'na_administradora') RETURNING id`,
		[convId, leadNome, phone],
	);
	const leadId = lead.rows[0].id;
	await db.query(
		`INSERT INTO bevi_proposals (conversation_id, lead_id, proposal_id, administradora, segmento, grupo, credit_value, monthly_payment, term_months)
		 VALUES ($1,$2,$3,$4,'imovel','9988','300000.00','1500.00',200)`,
		[convId, leadId, proposalId, admNome],
	);
	return leadId;
}

test.beforeAll(async ({ request }) => {
	const probe = await request.get("/api/admin/mesa-attendants", { failOnStatusCode: false });
	if (probe.status() === 404) test.skip(true, "Rotas da mesa ausentes no alvo.");

	await withDb(async (db) => {
		for (const nome of [LEAD_A_NOME, LEAD_B_NOME]) {
			await db.query(
				`DELETE FROM mesa_handoffs WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(
				`DELETE FROM bevi_proposals WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(
				`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(`DELETE FROM leads WHERE name=$1`, [nome]);
		}
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp IN ($1,$2)`, [
			PHONE_A_FULL,
			PHONE_B_FULL,
		]);
		await db.query(`DELETE FROM "user" WHERE phone IN ($1,$2)`, [PHONE_A_FULL, PHONE_B_FULL]);
		await db.query(
			`DELETE FROM administradora_docs WHERE administradora_id IN (SELECT id FROM administradoras WHERE nome IN ($1,$2))`,
			[ADM_A_NOME, ADM_B_NOME],
		);
		await db.query(`DELETE FROM administradoras WHERE nome IN ($1,$2)`, [ADM_A_NOME, ADM_B_NOME]);

		const admA = await db.query(
			`INSERT INTO administradoras (nome, slug) VALUES ($1,$2) RETURNING id`,
			[ADM_A_NOME, ADM_A_SLUG],
		);
		admAId = admA.rows[0].id;
		const admB = await db.query(
			`INSERT INTO administradoras (nome, slug) VALUES ($1,$2) RETURNING id`,
			[ADM_B_NOME, ADM_B_SLUG],
		);
		admBId = admB.rows[0].id;

		await db.query(
			`INSERT INTO administradora_docs (administradora_id, titulo, tipo, storage_key, texto_extraido, is_active)
			 VALUES ($1, 'Manual de teste', 'manual', 'e2e/manual-a.pdf', 'Para emitir o boleto, acesse o Portal Kappa e clique em Gerar 2a via.', true)`,
			[admAId],
		);
		await db.query(
			`INSERT INTO administradora_docs (administradora_id, titulo, tipo, storage_key, texto_extraido, is_active)
			 VALUES ($1, 'Manual de teste', 'manual', 'e2e/manual-b.pdf', 'Para emitir o boleto, acesse o Portal Zeta e clique em Emitir cobranca.', true)`,
			[admBId],
		);

		leadAId = await seedLeadWithProposal(
			db,
			LEAD_A_NOME,
			"5562999990020",
			ADM_A_NOME,
			`PROP-COP-A-${SUFFIX}`,
		);
		leadBId = await seedLeadWithProposal(
			db,
			LEAD_B_NOME,
			"5562999990021",
			ADM_B_NOME,
			`PROP-COP-B-${SUFFIX}`,
		);
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		for (const nome of [LEAD_A_NOME, LEAD_B_NOME]) {
			await db.query(
				`DELETE FROM mesa_handoffs WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(
				`DELETE FROM bevi_proposals WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(
				`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM leads WHERE name=$1)`,
				[nome],
			);
			await db.query(`DELETE FROM leads WHERE name=$1`, [nome]);
		}
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp IN ($1,$2)`, [
			PHONE_A_FULL,
			PHONE_B_FULL,
		]);
		await db.query(`DELETE FROM "user" WHERE phone IN ($1,$2)`, [PHONE_A_FULL, PHONE_B_FULL]);
		await db.query(`DELETE FROM administradora_docs WHERE administradora_id IN ($1,$2)`, [
			admAId,
			admBId,
		]);
		await db.query(`DELETE FROM administradoras WHERE nome IN ($1,$2)`, [ADM_A_NOME, ADM_B_NOME]);
	});
});

async function loginAdmin(page: import("@playwright/test").Page) {
	await page.goto("/admin/login");
	await page.getByRole("textbox", { name: "Email*" }).fill(ADMIN_EMAIL);
	await page.getByRole("textbox", { name: "Senha*" }).fill(ADMIN_PASSWORD);
	await page.getByRole("button", { name: "Entrar" }).click();
	await page.waitForURL("**/admin", { timeout: 15_000 });
}

async function openAttendantSimulator(
	page: import("@playwright/test").Page,
	attendantNome: string,
) {
	await page.goto("/admin/simulator/attendant");
	await page.getByRole("combobox").click();
	await page.getByRole("option", { name: new RegExp(attendantNome) }).click();
	await expect(page.getByText("Conectado")).toBeVisible({ timeout: 10_000 });
}

test("copiloto responde passo a passo na TELA e nunca vaza pro atendente que não é dono do caso", async ({
	browser,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");
	test.skip(!process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY ausente — copiloto usa LLM real.");
	test.setTimeout(120_000);

	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();
	const setupContext = await browser.newContext();
	const setupPage = await setupContext.newPage();

	try {
		// Setup via API numa sessão descartável própria (FIX achado na spec da
		// corrida: signUpEmail sequestra a sessão de quem chama — relogin entre
		// cada criação de user, pageA/pageB nunca tocam essas rotas).
		await loginAdmin(setupPage);
		const mesaA = await setupPage.request.post("/api/admin/mesa-attendants", {
			data: { nome: NOME_A, whatsapp: PHONE_A_LOCAL },
		});
		expect(mesaA.ok()).toBe(true);
		const userA = await setupPage.request.post("/api/admin/attendants", {
			data: { name: NOME_A, email: `e2e-copiloto-a-${SUFFIX}@teste.local`, phone: PHONE_A_FULL },
		});
		expect(userA.ok()).toBe(true);

		await loginAdmin(setupPage);
		const mesaB = await setupPage.request.post("/api/admin/mesa-attendants", {
			data: { nome: NOME_B, whatsapp: PHONE_B_LOCAL },
		});
		expect(mesaB.ok()).toBe(true);
		const userB = await setupPage.request.post("/api/admin/attendants", {
			data: { name: NOME_B, email: `e2e-copiloto-b-${SUFFIX}@teste.local`, phone: PHONE_B_FULL },
		});
		expect(userB.ok()).toBe(true);

		await loginAdmin(pageA);
		await loginAdmin(pageB);
		await openAttendantSimulator(pageA, NOME_A);
		await openAttendantSimulator(pageB, NOME_B);

		await loginAdmin(setupPage); // sessão foi sequestrada pro user B — relogin como admin
		// Transborda os 2 leads (broadcast a todos os atendentes ativos) — SÓ AGORA,
		// com os 2 atendentes JÁ conectados via SSE (o bus não tem replay).
		const transbordoA = await setupPage.request.post(`/api/admin/leads/${leadAId}/transbordo`, {
			data: {},
		});
		expect(transbordoA.ok()).toBe(true);
		const transbordoB = await setupPage.request.post(`/api/admin/leads/${leadBId}/transbordo`, {
			data: {},
		});
		expect(transbordoB.ok()).toBe(true);
		await setupContext.close();

		// O broadcast vai a TODOS os atendentes ativos (D15) — cada tela mostra os 2
		// cards (caso A e caso B). Cada atendente assume o SEU PRÓPRIO caso: acha o
		// card pelo nome do cliente no dossiê, não só pelo rótulo "Vou atender".
		await pageA
			.locator("div.rounded-lg", { hasText: LEAD_A_NOME })
			.getByRole("button", { name: "Vou atender" })
			.click();
		await pageB
			.locator("div.rounded-lg", { hasText: LEAD_B_NOME })
			.getByRole("button", { name: "Vou atender" })
			.click();
		await expect(pageA.getByText("Você assumiu o caso")).toBeVisible({ timeout: 10_000 });
		await expect(pageB.getByText("Você assumiu o caso")).toBeVisible({ timeout: 10_000 });

		// Conta as bolhas ANTES de perguntar (dossiê + confirmação de claim já estão
		// lá) — a prova de "passo a passo entregue" é uma bolha NOVA, não qualquer
		// bolha comprida já existente (dossiê/claim também passam de 40 chars).
		const countBeforeA = await pageA.locator("div.whitespace-pre-wrap").count();
		const countBeforeB = await pageB.locator("div.whitespace-pre-wrap").count();

		// Atendente A pergunta como emitir o boleto — copiloto real (LLM), sem mock.
		const inputA = pageA.getByPlaceholder("Digite como o atendente...");
		await inputA.fill(`Como faço para emitir o boleto na ${ADM_A_NOME}?`);
		await pageA.getByRole("button", { name: "Enviar" }).click();

		// Atendente B também pergunta (caso DIFERENTE, dossiê DIFERENTE).
		const inputB = pageB.getByPlaceholder("Digite como o atendente...");
		await inputB.fill(`Como faço para emitir o boleto na ${ADM_B_NOME}?`);
		await pageB.getByRole("button", { name: "Enviar" }).click();

		// Resposta de verdade (LLM real) — passo a passo renderizado na tela.
		// countBefore+2: a bolha outbound otimista da própria pergunta + a bolha
		// inbound com a orientação do copiloto (timeout generoso p/ LLM real).
		await expect
			.poll(async () => pageA.locator("div.whitespace-pre-wrap").count(), {
				timeout: 60_000,
				intervals: [1000],
			})
			.toBeGreaterThanOrEqual(countBeforeA + 2);
		await expect
			.poll(async () => pageB.locator("div.whitespace-pre-wrap").count(), {
				timeout: 60_000,
				intervals: [1000],
			})
			.toBeGreaterThanOrEqual(countBeforeB + 2);

		const bubblesA = await pageA.locator("div.whitespace-pre-wrap").allTextContents();
		const bubblesB = await pageB.locator("div.whitespace-pre-wrap").allTextContents();
		const copilotReplyA = bubblesA[bubblesA.length - 1];
		const copilotReplyB = bubblesB[bubblesB.length - 1];
		// Passo a passo de verdade: resposta não-trivial, não é eco vazio/erro.
		expect(copilotReplyA.length).toBeGreaterThan(40);
		expect(copilotReplyB.length).toBeGreaterThan(40);

		// ISOLAMENTO (o que a jornada promete: copiloto nunca vaza pra quem não é
		// dono do handoff) — NÃO é "a tela nunca mostra o nome do outro cliente":
		// o broadcast (D15) mostra o dossiê a TODOS os atendentes ativos ANTES do
		// claim, por design (quem primeiro clicar assume). A prova real de
		// isolamento é a RESPOSTA DO COPILOTO: A só pode ter vindo do manual/dossiê
		// de A (nunca menciona o termo exclusivo do manual de B, e vice-versa) —
		// prova que cada copiloto respondeu com o dossiê do PRÓPRIO caso, não o
		// do outro atendente.
		expect(copilotReplyA).not.toContain("Portal Zeta");
		expect(copilotReplyB).not.toContain("Portal Kappa");
		expect(copilotReplyA).not.toContain(ADM_B_NOME);
		expect(copilotReplyB).not.toContain(ADM_A_NOME);

		// Sem erro feio na tela.
		await expect(pageA.getByText("[erro ao enviar", { exact: false })).toHaveCount(0);
		await expect(pageB.getByText("[erro ao enviar", { exact: false })).toHaveCount(0);
	} finally {
		await setupContext.close().catch(() => {});
		await contextA.close();
		await contextB.close();
	}
});
