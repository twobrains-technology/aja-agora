import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

/**
 * Anti-regressão estrutural do funil de fechamento — eval agent-flow cenário imovel/Helena.
 *
 * Bugs cobertos:
 *  - Bug A: agent dispara `present_whatsapp_optin` mas NUNCA dispara
 *    `present_lead_form`. Usuário diz "Tenho interesse, vamos prosseguir" e
 *    o funil quebra no opt-in WA. Lead não fecha.
 *  - Bug B: após `present_simulation_result` + `present_recommendation_card`
 *    o agent improvisa a frase de transição em vez de usar a canônica
 *    pedida pela Bruna: "Aqui está o detalhamento completo da {admin}.
 *    Quer ajustar o valor do bem?" (FIX-2: era 'a carta de crédito')
 *
 * Testes estruturais (não chamam LLM): leem o source do prompt e validam
 * que as instruções obrigatórias estão presentes na variante que de fato
 * vai pro modelo em runtime (`SPECIALIST_BASE_PROMPT`, injetado em
 * `buildSpecialistPrompt`).
 */

describe("Bug A — present_lead_form gatilho explícito no SPECIALIST_BASE_PROMPT", () => {
	it("menciona present_lead_form pelo menos uma vez", () => {
		expect(
			SPECIALIST_BASE_PROMPT,
			"SPECIALIST_BASE_PROMPT deve mencionar present_lead_form — é a tool que fecha o funil",
		).toMatch(/present_lead_form/);
	});

	it("tem instrução EXPLÍCITA de chamar present_lead_form após save_contact_whatsapp / opt-in WhatsApp aceito", () => {
		// O fluxo correto: usuário aceita WhatsApp (save_contact_whatsapp), agent
		// pede para fechar via present_lead_form. Sem esse encadeamento no prompt,
		// o agent para no opt-in e nunca avança pra captura final.
		// A instrução tem que conectar os dois conceitos no MESMO trecho.
		const haveLeadForm = /present_lead_form/;
		const afterOptIn =
			/(ap[óo]s|depois|em seguida).*(save_contact_whatsapp|opt-?in|whatsapp).*present_lead_form/is;
		const optInThenLead =
			/(save_contact_whatsapp|present_whatsapp_optin)[\s\S]{0,500}present_lead_form/i;

		expect(SPECIALIST_BASE_PROMPT).toMatch(haveLeadForm);
		expect(
			afterOptIn.test(SPECIALIST_BASE_PROMPT) || optInThenLead.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa instruir explicitamente a chamar present_lead_form após o opt-in WhatsApp (save_contact_whatsapp). Atualmente o prompt termina o fluxo no opt-in e o lead nunca fecha.",
		).toBe(true);
	});

	it("tem instrução EXPLÍCITA de chamar present_lead_form quando o usuário manifesta intenção de avançar em texto", () => {
		// Cenário do eval: user digitou "Tenho interesse, vamos prosseguir".
		// Sem gatilho textual no prompt, o LLM não converte sinal de avanço
		// em call de present_lead_form.
		const sinaisDeAvanco =
			/(tenho interesse|quero prosseguir|vamos (prosseguir|fechar|seguir)|quero fechar|quero (avan[çc]ar|seguir)|bora fechar|pode (prosseguir|fechar)|prosseguir)/i;
		const leadFormProximo =
			/(tenho interesse|quero prosseguir|vamos (prosseguir|fechar|seguir)|quero fechar|bora fechar|pode (prosseguir|fechar))[\s\S]{0,400}present_lead_form/i;

		expect(
			sinaisDeAvanco.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa listar pelo menos um sinal textual de avanço (ex: 'tenho interesse', 'quero prosseguir', 'bora fechar') como gatilho do funil.",
		).toBe(true);

		expect(
			leadFormProximo.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa amarrar sinal de avanço ('tenho interesse', 'quero prosseguir') à chamada de present_lead_form no MESMO bloco. Hoje o prompt menciona 'Tenho interesse' apenas como botão do card de simulação — sem dizer pro agent disparar present_lead_form quando o user repete em texto.",
		).toBe(true);
	});

	it("SYSTEM_PROMPT também aponta present_lead_form com gatilho claro (defesa em camadas)", () => {
		// SYSTEM_PROMPT é usado em outros pontos do produto. A regra do funil
		// é tão crítica que precisa estar nos dois lugares.
		expect(SYSTEM_PROMPT).toMatch(/present_lead_form/);
		const gatilhoConcreto =
			/(ap[óo]s|depois|quando).*(opt-?in|whatsapp|tenho interesse|quero prosseguir|interesse explicito)/i;
		expect(
			gatilhoConcreto.test(SYSTEM_PROMPT),
			"SYSTEM_PROMPT cita present_lead_form mas só com 'quando demonstrar interesse' — vago. Precisa de gatilho concreto: após opt-in WA OU sinal textual de avanço.",
		).toBe(true);
	});
});

describe("Bug B — frase canônica B9 'detalhamento completo / ajustar o valor do bem'", () => {
	it("SPECIALIST_BASE_PROMPT contém a substring 'detalhamento completo' como frase canônica", () => {
		expect(
			SPECIALIST_BASE_PROMPT,
			"Bruna pediu frase canônica B9: 'Aqui está o detalhamento completo da {admin}. Quer ajustar o valor do bem?' — substring 'detalhamento completo' precisa aparecer literal no prompt pro modelo ancorar.",
		).toMatch(/detalhamento completo/i);
	});

	it("SPECIALIST_BASE_PROMPT contém a substring 'ajustar o valor' como frase canônica", () => {
		expect(
			SPECIALIST_BASE_PROMPT,
			"Frase canônica B9 termina em pergunta de ajuste: 'Quer ajustar o valor do bem?'. Substring 'ajustar o valor' precisa estar literal no prompt.",
		).toMatch(/ajustar o valor/i);
	});

	it("frase canônica B9 está colocada no MESMO bloco que present_simulation_result OU present_recommendation_card", () => {
		// A frase só faz sentido onde o detalhamento aparece — logo após
		// present_simulation_result (ou present_recommendation_card no caso
		// de destaque). Sem essa proximidade, o LLM não associa.
		const blocoEsperado =
			/(present_simulation_result|present_recommendation_card)[\s\S]{0,800}detalhamento completo[\s\S]{0,200}ajustar o valor/i;
		const blocoEsperadoReverso =
			/detalhamento completo[\s\S]{0,200}ajustar o valor[\s\S]{0,800}(present_simulation_result|present_recommendation_card)/i;

		expect(
			blocoEsperado.test(SPECIALIST_BASE_PROMPT) ||
				blocoEsperadoReverso.test(SPECIALIST_BASE_PROMPT),
			"Frase canônica B9 ('detalhamento completo' + 'ajustar o valor') precisa estar a < 800 chars de present_simulation_result OU present_recommendation_card. Sem proximidade no prompt, o agent improvisa.",
		).toBe(true);
	});

	it("frase canônica B9 contém placeholder pro nome da administradora", () => {
		// "Aqui está o detalhamento completo da {admin}" — sem o placeholder
		// explicito, o LLM omite o nome OU inventa nome errado.
		const placeholder =
			/detalhamento completo[\s\S]{0,80}(\{admin\}|\{admin(istradora)?_name\}|\{group(_admin)?\}|da \{|do \{|<admin>|<administradora>)/i;
		const placeholderAlternativo =
			/detalhamento completo[\s\S]{0,80}(nome da admin|nome da administradora|administradora|admin)/i;

		expect(
			placeholder.test(SPECIALIST_BASE_PROMPT) ||
				placeholderAlternativo.test(SPECIALIST_BASE_PROMPT),
			"Frase canônica B9 deve incluir referência ao nome da administradora (placeholder {admin} ou indicação 'nome da administradora') pra forçar o LLM a usar o nome real do grupo.",
		).toBe(true);
	});
});
