/**
 * E2E golden path — TRANSBORDO do kanban pra mesa de operação.
 *
 * Fluxo real (sem mock), pós-FIX-124/125 (broadcast + claim): login admin → kanban
 * (pipeline) → abre o card do lead em "Na Administradora" → "Transbordar para a mesa" →
 * confirma (SEM escolher atendente — o broadcast decide) → assertion de VALOR no DB:
 * mesa_handoffs criado SEM dono (`mesa_attendant_id IS NULL`, status 'aberto'), com a
 * administradora resolvida pela cota. O 1º atendente que clicar "Vou atender" no WhatsApp
 * é quem assume (claim atômico — coberto por integration, não pelo browser).
 *
 * ⚠️ ATUALIZADO na onda divergencias-jornada (QA F3, FIX-171): a versão anterior desta spec
 * testava o SINGLE-SELECT de atendente (combobox "Atendente de mesa") que o FIX-124 REMOVEU
 * — ficou stale e iria vermelha. O transbordo agora é broadcast a TODOS; o handoff nasce sem
 * dono. Contrato dialog↔API também coberto por mesa-transbordo-dialog.test.tsx (component) e
 * pela integration da rota.
 *
 * Pré-requisito: container da branch UP em PLAYWRIGHT_TEST_BASE_URL (HTTP .orb.local pra
 * casar trustedOrigins do better-auth) + admin seedado (ADMIN_EMAIL/ADMIN_PASSWORD, role
 * admin) + DATABASE_URL apontando pro Postgres do workspace.
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

		// seed: administradora + atendente ativo (destinatário do broadcast) + lead(kanban em
		// na_administradora) + proposta apontando pra administradora (pra resolver adm pela cota)
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

test("transborda um lead do kanban pra a mesa por BROADCAST (handoff SEM dono no DB, administradora resolvida)", async ({
	page,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente de teste.");
	await loginAdmin(page);

	await page.goto("/admin/pipeline");

	// abre o card do lead (a coluna "Na Administradora")
	await page.getByRole("button", { name: new RegExp(LEAD_NOME) }).click();

	// painel do lead → ação de transbordo (abre o dialog)
	await page.getByRole("button", { name: "Transbordar para a mesa" }).click();

	// dialog do broadcast: NÃO há mais single-select de atendente (FIX-124). Escopado pelo
	// nome acessível — o painel do lead também é role=dialog (evita strict-mode violation).
	const dialog = page.getByRole("dialog", { name: "Transbordar para a mesa" });
	await expect(dialog.getByRole("heading", { name: "Transbordar para a mesa" })).toBeVisible();
	await expect(dialog.getByText("todos os atendentes de mesa")).toBeVisible();
	// regressão: NÃO deve existir combobox de escolha de atendente (broadcast decide o dono)
	await expect(dialog.getByRole("combobox")).toHaveCount(0);

	// confirma o transbordo (botão do rodapé, escopado ao dialog)
	await dialog.getByRole("button", { name: "Transbordar para a mesa" }).click();

	// dialog fecha no sucesso
	await expect(dialog).toBeHidden({ timeout: 15_000 });

	// assertion de VALOR no DB: handoff aberto, SEM dono (broadcast decide via claim),
	// administradora resolvida pela cota.
	await expect
		.poll(
			async () =>
				withDb(async (db) => {
					const { rows } = await db.query(
						`SELECT h.status, h.mesa_attendant_id, adm.nome AS adm_nome
						 FROM mesa_handoffs h
						 LEFT JOIN administradoras adm ON adm.id = h.administradora_id
						 JOIN leads l ON l.id = h.lead_id
						 WHERE l.name = $1`,
						[LEAD_NOME],
					);
					return rows[0] ?? null;
				}),
			{ timeout: 10_000 },
		)
		.toEqual({ status: "aberto", mesa_attendant_id: null, adm_nome: ADM_NOME });
});
