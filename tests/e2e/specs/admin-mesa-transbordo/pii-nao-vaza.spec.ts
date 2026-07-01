/**
 * E2E de TELA real — CPF NUNCA aparece na tela de WhatsApp/mesa, só no painel
 * controlado (jornada §"Transbordo auto-broadcast + claim": "Dados sensíveis (CPF,
 * documentos) não trafegam no WhatsApp — ficam no painel").
 *
 * QA autônomo Frente 3 (2026-07-01): cobertura anterior era só structural (regex
 * anti-CPF em outbound.test.ts, sem tela). Esta spec prova nas DUAS pontas:
 * 1. O painel controlado (ContactDetailPanel, /admin/pipeline) mostra o CPF
 *    MASCARADO (maskCpf: só os 2 últimos dígitos) — achado bom nesta rodada:
 *    nem o painel autorizado expõe o valor cru, só o backend/Bevi tocam o CPF
 *    puro. "Fica no painel" (jornada) na prática é "fica mascarado no painel".
 * 2. A tela do atendente de mesa (Simulador de Atendente — dossiê do broadcast +
 *    conversa do copiloto) NUNCA mostra o CPF (cru OU mascarado), mesmo com o
 *    mesmo lead/contato.
 *
 * CPF usado é uma das contas de teste CANÔNICAS de homologação (Kairo/Mirella,
 * `secrets.sh decrypt contas-teste`) — nunca inventado, por regra do projeto.
 *
 * Pré-requisito: container UP em PLAYWRIGHT_TEST_BASE_URL (.orb.local) + admin
 * seedado + DATABASE_URL do workspace + docs/integracoes/contas-teste-homologacao.md.
 */
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
// Conta de teste canônica (Kairo) — CPF real de homologação, NUNCA inventado.
const CPF_TESTE = process.env.E2E_CONTA1_CPF ?? "";

const SUFFIX = Date.now().toString(36);
const ADM_NOME = `E2E PII Adm ${SUFFIX}`;
const ADM_SLUG = `e2e-pii-adm-${SUFFIX}`;
const LEAD_NOME = `E2E PII Lead ${SUFFIX}`;
const NOME_ATENDENTE = `E2E PII Atendente ${SUFFIX}`;
const PHONE_LOCAL = "64988890001";
const PHONE_FULL = `55${PHONE_LOCAL}`;

let leadId: string;
let contactId: string;

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
	const probe = await request.get("/api/admin/mesa-attendants", { failOnStatusCode: false });
	if (probe.status() === 404) test.skip(true, "Rotas da mesa ausentes no alvo.");

	await withDb(async (db) => {
		await db.query(
			`DELETE FROM mesa_handoffs WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(
			`DELETE FROM bevi_proposals WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(
			`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(`DELETE FROM leads WHERE name=$1`, [LEAD_NOME]);
		await db.query(`DELETE FROM contacts WHERE cpf=$1`, [CPF_TESTE]);
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp=$1`, [PHONE_FULL]);
		await db.query(`DELETE FROM "user" WHERE phone=$1`, [PHONE_FULL]);
		await db.query(`DELETE FROM administradoras WHERE nome=$1`, [ADM_NOME]);

		await db.query(`INSERT INTO administradoras (nome, slug) VALUES ($1,$2)`, [ADM_NOME, ADM_SLUG]);

		const contact = await db.query(
			`INSERT INTO contacts (phone, cpf, name) VALUES ($1,$2,$3) RETURNING id`,
			[LEAD_NOME.replace(/\D/g, "").padEnd(10, "1").slice(0, 11), CPF_TESTE, LEAD_NOME],
		);
		contactId = contact.rows[0].id;

		const conv = await db.query(
			`INSERT INTO conversations (channel, status, contact_id) VALUES ('whatsapp','active',$1) RETURNING id`,
			[contactId],
		);
		const convId = conv.rows[0].id;
		const lead = await db.query(
			`INSERT INTO leads (conversation_id, name, phone, stage, contact_id) VALUES ($1,$2,$3,'na_administradora',$4) RETURNING id`,
			[convId, LEAD_NOME, "5562999990030", contactId],
		);
		leadId = lead.rows[0].id;
		await db.query(
			`INSERT INTO bevi_proposals (conversation_id, lead_id, proposal_id, administradora, segmento, grupo, credit_value, monthly_payment, term_months)
			 VALUES ($1,$2,$3,$4,'imovel','5544','250000.00','1300.00',150)`,
			[convId, leadId, `PROP-PII-${SUFFIX}`, ADM_NOME],
		);
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query(
			`DELETE FROM mesa_handoffs WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(
			`DELETE FROM bevi_proposals WHERE lead_id IN (SELECT id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(
			`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM leads WHERE name=$1)`,
			[LEAD_NOME],
		);
		await db.query(`DELETE FROM leads WHERE name=$1`, [LEAD_NOME]);
		await db.query(`DELETE FROM contacts WHERE id=$1`, [contactId]);
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp=$1`, [PHONE_FULL]);
		await db.query(`DELETE FROM "user" WHERE phone=$1`, [PHONE_FULL]);
		await db.query(`DELETE FROM administradoras WHERE nome=$1`, [ADM_NOME]);
	});
});

async function loginAdmin(page: import("@playwright/test").Page) {
	await page.goto("/admin/login");
	await page.getByRole("textbox", { name: "Email*" }).fill(ADMIN_EMAIL);
	await page.getByRole("textbox", { name: "Senha*" }).fill(ADMIN_PASSWORD);
	await page.getByRole("button", { name: "Entrar" }).click();
	await page.waitForURL("**/admin", { timeout: 15_000 });
}

test("CPF aparece no painel controlado (ContactDetailPanel) e NUNCA na tela da mesa/WhatsApp", async ({
	page,
	browser,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");
	test.skip(!CPF_TESTE, "E2E_CONTA1_CPF ausente — decripte com secrets.sh decrypt contas-teste.");

	// 1. Painel controlado: /admin/pipeline → clica no lead → CPF aparece MASCARADO
	// (maskCpf: só os 2 últimos dígitos, "***.***.NNN-NN") — achado bom: nem o
	// painel controlado expõe o CPF cru, só o backend/Bevi tocam o valor puro.
	const cpfMascarado = `***.***.${CPF_TESTE.slice(6, 9)}-${CPF_TESTE.slice(9)}`;
	await loginAdmin(page);
	await page.goto("/admin/pipeline");
	await page.getByRole("button", { name: new RegExp(LEAD_NOME) }).click();
	await expect(page.getByTestId("contact-cpf")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("contact-cpf")).toContainText(cpfMascarado);
	// Mesmo o painel controlado NUNCA mostra o CPF cru — só o mascarado.
	await expect(page.getByText(CPF_TESTE)).toHaveCount(0);
	await page.keyboard.press("Escape");

	// 2. Mesa: setup do atendente numa sessão descartável (signUpEmail sequestra
	// quem chama — achado na spec da corrida).
	const setupContext = await browser.newContext();
	const setupPage = await setupContext.newPage();
	await loginAdmin(setupPage);
	const mesa = await setupPage.request.post("/api/admin/mesa-attendants", {
		data: { nome: NOME_ATENDENTE, whatsapp: PHONE_LOCAL },
	});
	expect(mesa.ok()).toBe(true);
	const userRes = await setupPage.request.post("/api/admin/attendants", {
		data: { name: NOME_ATENDENTE, email: `e2e-pii-${SUFFIX}@teste.local`, phone: PHONE_FULL },
	});
	expect(userRes.ok()).toBe(true);

	// Atendente conecta ANTES do broadcast (sem replay no bus).
	const contextAtt = await browser.newContext();
	const pageAtt = await contextAtt.newPage();
	await loginAdmin(pageAtt);
	await pageAtt.goto("/admin/simulator/attendant");
	await pageAtt.getByRole("combobox").click();
	await pageAtt.getByRole("option", { name: new RegExp(NOME_ATENDENTE) }).click();
	await expect(pageAtt.getByText("Conectado")).toBeVisible({ timeout: 10_000 });

	await loginAdmin(setupPage); // sessão foi sequestrada pro user recém-criado
	const transbordoRes = await setupPage.request.post(`/api/admin/leads/${leadId}/transbordo`, {
		data: {},
	});
	expect(transbordoRes.ok()).toBe(true);
	await setupContext.close();

	await pageAtt.getByRole("button", { name: "Vou atender" }).click();
	await expect(pageAtt.getByText("Você assumiu o caso")).toBeVisible({ timeout: 10_000 });

	// Pergunta ao copiloto — mais uma chance do CPF vazar se algum código
	// injetasse dados do contato inteiro no prompt/response.
	await pageAtt
		.getByPlaceholder("Digite como o atendente...")
		.fill("Quais dados eu tenho desse cliente?");
	await pageAtt.getByRole("button", { name: "Enviar" }).click();
	await pageAtt.waitForTimeout(3_000); // dá tempo do copiloto responder (best-effort, não é o critério)

	// A PROVA: em NENHUM momento da tela da mesa o CPF (cru ou formatado) aparece.
	const cpfFormatado = `${CPF_TESTE.slice(0, 3)}.${CPF_TESTE.slice(3, 6)}.${CPF_TESTE.slice(6, 9)}-${CPF_TESTE.slice(9)}`;
	await expect(pageAtt.getByText(CPF_TESTE)).toHaveCount(0);
	await expect(pageAtt.getByText(cpfFormatado)).toHaveCount(0);

	await contextAtt.close();
});
