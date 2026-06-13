/**
 * E2E — AI Assistant structural shape (sem chamar Anthropic real).
 *
 * Valida que o endpoint responde dentro do contrato esperado mesmo quando
 * o request body chega malformado. Não testa happy path do LLM (que custa
 * tokens e está coberto em Camada 3 eval `assistant-flow.eval.test.ts`).
 *
 * Cenários:
 * - JSON malformado → 400 ou 401 (NUNCA 500)
 * - body sem messages → 401 (auth dispara) ou 400/200 stream vazio
 * - Headers de SSE corretos no caso de auth válida (testado por integration mock)
 */
import { expect, test } from "@playwright/test";

const ENDPOINT = (id: string) => `/api/admin/personas/${id}/assist`;

test.beforeAll(async ({ request }, testInfo) => {
	const res = await request.post(ENDPOINT("probe"), {
		data: {},
		failOnStatusCode: false,
	});
	if (res.status() === 404) {
		testInfo.skip(
			true,
			`Endpoint não existe — servidor não está na branch feat/ai-assistant-persona-edit`,
		);
	}
});

test.describe("AI Assistant API — shape estrutural (endpoint real)", () => {
	test("JSON malformado retorna 400 ou 401 (nunca 500)", async ({ request }) => {
		const res = await request.post(ENDPOINT("p1"), {
			data: "not json at all",
			headers: { "Content-Type": "application/json" },
		});
		expect(
			[400, 401].includes(res.status()),
			`status=${res.status()} pra JSON inválido — não pode ser 500`,
		).toBe(true);
	});

	test("body vazio {} sem session retorna 401 (auth dispara antes do parse)", async ({
		request,
	}) => {
		const res = await request.post(ENDPOINT("p1"), {
			data: {},
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status()).toBe(401);
	});

	test("response NÃO inclui ANTHROPIC_API_KEY no payload (CA-19/S-03)", async ({ request }) => {
		const res = await request.post(ENDPOINT("p1"), {
			data: { messages: [] },
			headers: { "Content-Type": "application/json" },
		});
		const body = await res.text();
		expect(body.toLowerCase()).not.toContain("sk-ant-");
		expect(body.toLowerCase()).not.toContain("anthropic_api_key");
		expect(body.toLowerCase()).not.toContain("x-api-key");
	});
});
