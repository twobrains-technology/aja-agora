import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

/**
 * Camada 1 (estrutural) — funil canônico pós-reveal (FIX-34, 2026-06-12).
 *
 * Decisão de produto (docs/jornada/jornada-canonica.md passos 4-5): o sinal de
 * avanço pós-reveal ("Tenho interesse", "quero prosseguir") leva ao CARD DE
 * DECISÃO (present_decision_prompt, "Esse plano faz sentido?") e daí ao passo 5
 * self-service (present_contract_form via Bevi). NUNCA a present_lead_form nem
 * à promessa de "te conectar com nosso consultor" — o produto existe pra
 * ELIMINAR o corretor do meio (core value do projeto).
 *
 * Bug real (teste manual Kairo 2026-06-12, jornada Itaú real): clicar "Tenho
 * interesse" no recommendation_card respondia "vou reservar essa opção... te
 * conectar com nosso consultor" + present_lead_form. Regressão de proposta de
 * valor.
 *
 * Estes asserts INVERTEM o contrato legado (ex-"Bug A", pré-Bevi): antes o
 * prompt AMARRAVA sinal de avanço → present_lead_form. Agora isso é proibido.
 */

describe("FIX-34 — sinal de avanço pós-reveal NÃO vira present_lead_form/consultor", () => {
	const prompts = [
		["SPECIALIST_BASE_PROMPT", SPECIALIST_BASE_PROMPT],
		["SYSTEM_PROMPT", SYSTEM_PROMPT],
	] as const;

	// Gatilhos textuais de avanço que o prompt legado amarrava a present_lead_form.
	const SINAIS =
		"tenho interesse|quero prosseguir|vamos (prosseguir|fechar|seguir)|bora fechar|pode (prosseguir|fechar)|sinal.{0,25}avan[çc]o|interesse explicito|intencao de avancar";

	it("NENHUM prompt amarra gatilho textual de avanço a present_lead_form (proximidade < 400 chars)", () => {
		const gatilhoEntaoLead = new RegExp(`(${SINAIS})[\\s\\S]{0,400}present_lead_form`, "i");
		const leadEntaoGatilho = new RegExp(`present_lead_form[\\s\\S]{0,400}(${SINAIS})`, "i");
		for (const [name, p] of prompts) {
			expect(
				gatilhoEntaoLead.test(p),
				`${name}: sinal de avanço NÃO pode estar a <400 chars de present_lead_form (FIX-34 — o caminho é decision → contract_form).`,
			).toBe(false);
			expect(
				leadEntaoGatilho.test(p),
				`${name} (sentido inverso): present_lead_form NÃO pode estar a <400 chars de um sinal de avanço (FIX-34).`,
			).toBe(false);
		}
	});

	it("nenhum prompt promete 'consultor' como destino de 'tenho interesse'", () => {
		// A copy legada "te conectar com nosso consultor" como resposta ao interesse
		// contradiz o self-service. Handoff humano existe (suggest_handoff), mas o
		// gatilho é PEDIDO DE HUMANO explícito, nunca o clique "Tenho interesse".
		const interesseViraConsultor =
			/(tenho interesse|clic\w+.{0,30}interesse)[\s\S]{0,220}consultor/i;
		for (const [name, p] of prompts) {
			expect(
				interesseViraConsultor.test(p),
				`${name}: "tenho interesse" NÃO pode levar a "consultor" (FIX-34 — fecha self-service na plataforma).`,
			).toBe(false);
		}
	});

	it("o caminho canônico pós-reveal aponta pra decisão/contratação (âncora positiva)", () => {
		// O specialist precisa saber PRA ONDE o avanço vai: card de decisão
		// (passo 4 close) → passo 5 (present_contract_form). Sem essa âncora o
		// modelo improvisa de volta pro lead_form.
		const apontaDecisao = /present_decision_prompt/.test(SPECIALIST_BASE_PROMPT);
		const apontaContrato = /present_contract_form|passo 5|contratar agora/i.test(
			SPECIALIST_BASE_PROMPT,
		);
		expect(
			apontaDecisao && apontaContrato,
			"SPECIALIST_BASE_PROMPT precisa nomear present_decision_prompt E o passo de contratação como destino pós-reveal.",
		).toBe(true);
	});
});

/**
 * Bug B — frase canônica B9 'detalhamento completo / ajustar o valor do bem'
 * (mantida — não tem relação com o lead_form; é a transição pós-detalhamento).
 */
describe("B9 — fechamento pós-detalhamento SEM frase canônica (desamarra 2026-07-13)", () => {
	// O prompt exigia a frase "Aqui está o detalhamento completo da {admin}. Quer
	// ajustar o valor do bem?" IPSIS LITTERIS ("não improvise outras formulações").
	// Era a causa direta do "agente responde sempre a mesma coisa". ADR
	// 2026-07-13 (revoga-jornada-soberana): a fala é do modelo.
	it("não impõe frase canônica nem proíbe o modelo de improvisar", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/esta frase é canônica/i);
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/Não improvise outras formulações/i);
	});
});
