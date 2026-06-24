/**
 * E2E golden path — TRANSBORDO do kanban pra mesa de operação (QA noturno 2026-06-22).
 * Fluxo real (sem mock): login admin → kanban (pipeline) → abre o card do lead →
 * "Transbordar para a mesa" → escolhe um atendente de mesa ativo → "Transbordar" →
 * assertion de VALOR no DB (mesa_handoffs criado, administradora resolvida pela cota,
 * atendente certo, status 'aberto').
 *
 * Cobre o elo "via kanban" que faltava — e que estava QUEBRADO: o dialog lia a chave
 * errada da resposta da API (`attendants` em vez de `mesaAttendants`) e nunca listava
 * atendentes (regressão fina coberta também por mesa-transbordo-dialog.test.tsx).
 *
 * Pré-requisito: container da branch UP em PLAYWRIGHT_TEST_BASE_URL (HTTP .orb.local pra
 * casar trustedOrigins do better-auth) + admin seedado (ADMIN_EMAIL/ADMIN_PASSWORD) +
 * DATABASE_URL apontando pro Postgres do workspace.
 */
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const SUFFIX = Date.now().toString(36);
const ADM_NOME = `E2E Transbordo Adm ${SUFFIX}`;
const ADM_SLUG = `e2e-transbordo-adm-${SUFFIX}`;
const ATT_NOME = `E2E Transbordo Operador ${SUFFIX}`;
const ATT_WHATS = `5562${Math.floor(900000000 + Math.random() * 90000000)}`;
const LEAD_NOME = `E2E Transbordo Lead ${SUFFIX}`;

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
	// skip se a rota da mesa não existe no alvo (servidor sem a branch)
	const probe = await request.get("/api/admin/mesa-attendants", { failOnStatusCode: false });
	if (probe.status() === 404) test.skip(true, "Rotas da mesa ausentes no alvo.");

	await withDb(async (db) => {
		// limpeza idempotente
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
		await db.query(`DELETE FROM mesa_attendants WHERE nome=$1`, [ATT_NOME]);
		await db.query(`DELETE FROM administradoras WHERE nome=$1`, [ADM_NOME]);

		// seed: administradora + atendente + lead(kanban) + proposta apontando pra administradora
		await db.query(`INSERT INTO administradoras (nome, slug) VALUES ($1,$2)`, [ADM_NOME, ADM_SLUG]);
		await db.query(`INSERT INTO mesa_attendants (nome, whatsapp, is_active) VALUES ($1,$2,true)`, [
			ATT_NOME,
			ATT_WHATS,
		]);
		const conv = await db.query(
			`INSERT INTO conversations (channel, status) VALUES ('whatsapp','active') RETURNING id`,
		);
		const convId = conv.rows[0].id;
		const lead = await db.query(
			`INSERT INTO leads (conversation_id, name, phone, stage) VALUES ($1,$2,$3,'na_administradora') RETURNING id`,
			[convId, LEAD_NOME, "5562999990009"],
		);
		await db.query(
			`INSERT INTO bevi_proposals (conversation_id, lead_id, proposal_id, administradora, segmento, grupo, credit_value, monthly_payment, term_months)
			 VALUES ($1,$2,$3,$4,'imovel','4321','200000.00','1200.00',180)`,
			[convId, lead.rows[0].id, `PROP-${SUFFIX}`, ADM_NOME],
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
		await db.query(`DELETE FROM mesa_attendants WHERE nome=$1`, [ATT_NOME]);
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

test("transborda um lead do kanban pra um atendente de mesa (handoff no DB com administradora resolvida)", async ({
	page,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");
	await loginAdmin(page);

	await page.goto("/admin/pipeline");

	// abre o card do lead (a coluna "Na Administradora")
	await page.getByRole("button", { name: new RegExp(LEAD_NOME) }).click();

	// painel do lead → ação de transbordo
	await page.getByRole("button", { name: "Transbordar para a mesa" }).click();

	// dialog: escolhe o atendente de mesa ativo (Radix Select)
	await expect(page.getByRole("heading", { name: "Transbordar para a mesa" })).toBeVisible();
	// o atendente DEVE aparecer (regressão do bug de chave da API)
	await expect(page.getByText("Nenhum atendente de mesa ativo cadastrado")).toHaveCount(0);
	await page.getByRole("combobox", { name: "Atendente de mesa" }).click();
	await page.getByRole("option", { name: ATT_NOME }).click();

	// confirma o transbordo
	await page.getByRole("button", { name: "Transbordar", exact: true }).click();

	// dialog fecha no sucesso
	await expect(page.getByRole("heading", { name: "Transbordar para a mesa" })).toBeHidden({
		timeout: 15_000,
	});

	// assertion de VALOR no DB: handoff aberto, atendente certo, administradora resolvida pela cota
	await expect
		.poll(
			async () =>
				withDb(async (db) => {
					const { rows } = await db.query(
						`SELECT h.status, a.nome AS att_nome, adm.nome AS adm_nome
						 FROM mesa_handoffs h
						 JOIN mesa_attendants a ON a.id = h.mesa_attendant_id
						 LEFT JOIN administradoras adm ON adm.id = h.administradora_id
						 JOIN leads l ON l.id = h.lead_id
						 WHERE l.name = $1`,
						[LEAD_NOME],
					);
					return rows[0] ?? null;
				}),
			{ timeout: 10_000 },
		)
		.toEqual({ status: "aberto", att_nome: ATT_NOME, adm_nome: ADM_NOME });
});
