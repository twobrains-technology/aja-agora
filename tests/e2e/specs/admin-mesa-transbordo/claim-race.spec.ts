/**
 * E2E de TELA real — corrida do claim "Vou atender" (D16, FIX-125).
 *
 * QA autônomo Frente 3 (2026-07-01): o cenário de corrida só tinha prova por
 * integration (2 chamadas concorrentes a handleMesaClaim direto, sem tela). Esta
 * spec abre 2 SESSÕES DE ATENDENTE DIFERENTES de verdade — 2 browser contexts, cada
 * um logado, cada um na tela do Simulador de Atendente (/admin/simulator/attendant)
 * encarnando um atendente diferente — e clica "Vou atender" em ambas quase ao mesmo
 * tempo. Confirma visualmente: o vencedor vê "Você assumiu o caso", o perdedor vê
 * "já foi assumido" — nenhum erro feio, nenhuma tela quebrada.
 *
 * ⚠️ Setup dos atendentes via API (POST /api/admin/mesa-attendants + /api/admin/
 * attendants), NÃO via SQL cru: achamos aqui mesmo (FIX-175) que getMesaAttendantList()
 * cacheia 60s e o CRUD antigo nunca invalidava — semear via SQL direto deixa o
 * broadcast pegando a lista cacheada do teste ANTERIOR quando os runs se sucedem
 * rápido. Passar pela API real invalida o cache e prova o fix na prática.
 *
 * O broadcast (kanban → transbordo) já tem cobertura de tela própria em
 * golden-path.spec.ts — aqui disparamos via API (mesma rota, mesmo código de
 * produção) só pra chegar rápido no ESTADO crítico (2 atendentes já vendo o botão),
 * sem repetir o fluxo do admin. O que este teste prova de verdade é a TELA do
 * atendente durante a corrida, não o transbordo em si.
 *
 * Pré-requisito: container UP em PLAYWRIGHT_TEST_BASE_URL (.orb.local) + admin
 * seedado + DATABASE_URL do workspace.
 */
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const SUFFIX = Date.now().toString(36);
const ADM_NOME = `E2E Corrida Adm ${SUFFIX}`;
const ADM_SLUG = `e2e-corrida-adm-${SUFFIX}`;
const LEAD_NOME = `E2E Corrida Lead ${SUFFIX}`;
const NOME_A = `E2E Corrida A ${SUFFIX}`;
const NOME_B = `E2E Corrida B ${SUFFIX}`;
// DDD 64 + celular fake (não é o número de nenhum atendente real). Formato E.164
// BR válido pra passar nos validators reais das rotas (SIM- seria rejeitado por 400).
const PHONE_A_LOCAL = "64988870001"; // sem DDI — vira 5564988870001 no cadastro da mesa
const PHONE_B_LOCAL = "64988870002";
const PHONE_A_FULL = `55${PHONE_A_LOCAL}`;
const PHONE_B_FULL = `55${PHONE_B_LOCAL}`;

let leadId: string;

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
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp IN ($1,$2)`, [
			PHONE_A_FULL,
			PHONE_B_FULL,
		]);
		await db.query(`DELETE FROM "user" WHERE phone IN ($1,$2)`, [PHONE_A_FULL, PHONE_B_FULL]);
		await db.query(`DELETE FROM administradoras WHERE nome=$1`, [ADM_NOME]);

		await db.query(`INSERT INTO administradoras (nome, slug) VALUES ($1,$2)`, [ADM_NOME, ADM_SLUG]);

		const conv = await db.query(
			`INSERT INTO conversations (channel, status) VALUES ('whatsapp','active') RETURNING id`,
		);
		const convId = conv.rows[0].id;
		const lead = await db.query(
			`INSERT INTO leads (conversation_id, name, phone, stage) VALUES ($1,$2,$3,'na_administradora') RETURNING id`,
			[convId, LEAD_NOME, "5562999990010"],
		);
		leadId = lead.rows[0].id;
		await db.query(
			`INSERT INTO bevi_proposals (conversation_id, lead_id, proposal_id, administradora, segmento, grupo, credit_value, monthly_payment, term_months)
			 VALUES ($1,$2,$3,$4,'imovel','4321','200000.00','1200.00',180)`,
			[convId, leadId, `PROP-CORRIDA-${SUFFIX}`, ADM_NOME],
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
		await db.query(`DELETE FROM mesa_attendants WHERE whatsapp IN ($1,$2)`, [
			PHONE_A_FULL,
			PHONE_B_FULL,
		]);
		await db.query(`DELETE FROM "user" WHERE phone IN ($1,$2)`, [PHONE_A_FULL, PHONE_B_FULL]);
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

async function openAttendantSimulator(
	page: import("@playwright/test").Page,
	attendantNome: string,
) {
	await page.goto("/admin/simulator/attendant");
	await page.getByRole("combobox").click();
	await page.getByRole("option", { name: new RegExp(attendantNome) }).click();
	await expect(page.getByText("Conectado")).toBeVisible({ timeout: 10_000 });
}

test("corrida do 'Vou atender': 2 sessões de atendente reais, exatamente 1 assume — perdedor vê 'já foi assumido' sem erro", async ({
	browser,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");

	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();
	const setupContext = await browser.newContext();
	const setupPage = await setupContext.newPage();

	try {
		// Setup via API (não SQL cru) — numa sessão DESCARTÁVEL própria, não em pageA/
		// pageB. Achado nesta rodada (fora do escopo mesa, registrado no diário):
		// POST /api/admin/attendants chama auth.api.signUpEmail, e o plugin nextCookies
		// seta o Set-Cookie da SESSÃO RECÉM-CRIADA na resposta — sequestra quem chamou.
		// Criar A troca a sessão de quem chamou pra A; por isso cada criação de user
		// usa um relogin fresco, e pageA/pageB (que vão logar no simulador) nunca
		// tocam essas rotas.
		await loginAdmin(setupPage);
		const mesaA = await setupPage.request.post("/api/admin/mesa-attendants", {
			data: { nome: NOME_A, whatsapp: PHONE_A_LOCAL },
		});
		expect(mesaA.ok()).toBe(true);
		const userA = await setupPage.request.post("/api/admin/attendants", {
			data: { name: NOME_A, email: `e2e-corrida-a-${SUFFIX}@teste.local`, phone: PHONE_A_FULL },
		});
		expect(userA.ok()).toBe(true);

		await loginAdmin(setupPage); // sessão foi sequestrada pro user A — relogin como admin
		const mesaB = await setupPage.request.post("/api/admin/mesa-attendants", {
			data: { nome: NOME_B, whatsapp: PHONE_B_LOCAL },
		});
		expect(mesaB.ok()).toBe(true);
		const userB = await setupPage.request.post("/api/admin/attendants", {
			data: { name: NOME_B, email: `e2e-corrida-b-${SUFFIX}@teste.local`, phone: PHONE_B_FULL },
		});
		expect(userB.ok()).toBe(true);
		await setupContext.close();

		await loginAdmin(pageA);
		await loginAdmin(pageB);

		// Ambos os atendentes já conectados (SSE) ANTES do broadcast — o bus não tem
		// replay, então quem conecta depois do publish perde a mensagem.
		await openAttendantSimulator(pageA, NOME_A);
		await openAttendantSimulator(pageB, NOME_B);

		// Dispara o transbordo pela MESMA rota de produção que o golden-path usa via
		// clique — aqui via API (reusa a sessão admin já autenticada de pageA) só pra
		// chegar rápido no estado "2 atendentes vendo o botão", sem repetir a jornada
		// do admin (já coberta em golden-path.spec.ts).
		const transbordoRes = await pageA.request.post(`/api/admin/leads/${leadId}/transbordo`, {
			data: {},
		});
		expect(transbordoRes.ok()).toBe(true);

		// Ambas as telas devem mostrar o botão "Vou atender" (mesmo card de transbordo).
		const buttonA = pageA.getByRole("button", { name: "Vou atender" });
		const buttonB = pageB.getByRole("button", { name: "Vou atender" });
		await expect(buttonA).toBeVisible({ timeout: 10_000 });
		await expect(buttonB).toBeVisible({ timeout: 10_000 });

		// A CORRIDA: os 2 atendentes clicam quase ao mesmo tempo.
		await Promise.all([buttonA.click(), buttonB.click()]);

		// Exatamente 1 assume; o outro vê "já foi assumido" — sem tela quebrada.
		const assumedA = pageA.getByText("Você assumiu o caso");
		const assumedB = pageB.getByText("Você assumiu o caso");
		const jaAssumidoA = pageA.getByText("já foi assumido");
		const jaAssumidoB = pageB.getByText("já foi assumido");

		await expect(assumedA.or(jaAssumidoA)).toBeVisible({ timeout: 10_000 });
		await expect(assumedB.or(jaAssumidoB)).toBeVisible({ timeout: 10_000 });

		const aWon = await assumedA.isVisible();
		const bWon = await assumedB.isVisible();
		// XOR: exatamente 1 dos dois venceu (nunca os 2, nunca nenhum).
		expect(aWon !== bWon).toBe(true);
		if (aWon) {
			await expect(jaAssumidoB).toBeVisible();
		} else {
			await expect(jaAssumidoA).toBeVisible();
		}

		// Sem erro feio na tela (nenhuma bolha "[erro ao enviar" nem overlay de crash).
		await expect(pageA.getByText("[erro ao enviar", { exact: false })).toHaveCount(0);
		await expect(pageB.getByText("[erro ao enviar", { exact: false })).toHaveCount(0);

		// Assertion de VALOR no DB — a corrida da TELA bateu com o estado real.
		await expect
			.poll(async () =>
				withDb(async (db) => {
					const { rows } = await db.query(
						`SELECT status, mesa_attendant_id FROM mesa_handoffs WHERE lead_id=$1`,
						[leadId],
					);
					return rows[0] ?? null;
				}),
			)
			.toMatchObject({ status: "em_andamento" });
	} finally {
		await setupContext.close().catch(() => {});
		await contextA.close();
		await contextB.close();
	}
});
