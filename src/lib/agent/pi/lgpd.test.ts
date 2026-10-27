// O QUE SOBROU DO LGPD: A REVOGAÇÃO. Nada de aviso, nada de "sim".
//
// Decisão do dono (27/10/2026, 13:12): PII e LGPD não barram nada. O portão da proposta saiu em
// `d7394727`, mas a TEXTA ficou viva em três lugares e foi isso que produziu o print de 15:32
// (`.orientacao/prints-kairo/1532-formulario-fixo.png`): a pessoa disse "você nem tem meu
// telefone, e se eu fechar a tela agora?" e o agente recitou o aviso da LGPD pedindo CPF.
//
//  1. `lgpd.ts` tinha `AVISO_LGPD` (a frase canônica) e o estágio de aceite;
//  2. a skill `proposta-com-dados-do-cliente` mandava recitar o aviso e esperar o "sim";
//  3. o formatter do WhatsApp colava o aviso antes de pedir o CPF.
//
// Este arquivo prova o contrato novo: nada disso existe mais, o balão do modelo não é reescrito,
// o CPF continua mascarado (encanamento, não conversa) e a ÚNICA coisa que barra a proposta é o
// cliente dizer que não autoriza.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PEDE_DADO_RE, revogouOsDados } from "./lgpd";
import { montarTrechoDeSaida } from "./turno-livre";

const skill = () =>
	readFileSync(
		new URL("./skills/proposta-com-dados-do-cliente/SKILL.md", import.meta.url).pathname,
		"utf8",
	);
const fonteLgpd = () => readFileSync(new URL("./lgpd.ts", import.meta.url).pathname, "utf8");

describe("o aviso da LGPD não existe mais — em lugar nenhum", () => {
	it("o módulo não exporta mais aviso nem aceite", () => {
		const fonte = fonteLgpd();
		expect(fonte).not.toMatch(/export const AVISO_LGPD/);
		expect(fonte).not.toMatch(/export function resolverAceiteLgpd/);
		expect(fonte).not.toMatch(/export function clienteAceitouLgpd/);
		// A frase canônica não pode voltar nem como comentário de instrução.
		expect(fonte).not.toMatch(/Posso seguir\?/);
	});

	it("a skill da proposta não manda avisar nem esperar o sim", () => {
		const texto = skill();
		expect(texto).not.toMatch(/avise com estas palavras/i);
		expect(texto).not.toMatch(/s[óo] continue depois de um sim/i);
		expect(texto).not.toMatch(/conforme a lgpd/i);
		// O que a skill passou a dizer: o dado vem de onde vier, e o contato é o ativo.
		expect(texto).toMatch(/em qualquer ordem e em qualquer turno/i);
		expect(texto).toMatch(/whatsapp_optin/);
	});

	it("o formatter do WhatsApp não recita o aviso antes de pedir o CPF", () => {
		const fonte = readFileSync(
			new URL("../../whatsapp/formatter.ts", import.meta.url).pathname,
			"utf8",
		);
		const corpo = fonte.slice(
			fonte.indexOf("export function contractFormToWhatsApp"),
			fonte.indexOf("export function realOfferToWhatsApp"),
		);
		expect(corpo).not.toMatch(/LGPD/);
		expect(corpo).not.toMatch(/bir[ôo]s?\s+de\s+cr[eé]dito/i);
	});

	it("a tool da proposta não manda explicar birô de crédito", () => {
		const fonte = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		expect(fonte).not.toMatch(/explique que a administradora consulta os bir[ôo]s/i);
	});
});

describe("o balão não é reescrito — LGPD não trava fala (decisão do dono, 27/10/2026)", () => {
	it("pedir CPF sem aviso anterior sai como o modelo escreveu", () => {
		const texto = "Você escolheu a Canopus. Me passa seu CPF pra eu gerar a proposta.";
		const r = montarTrechoDeSaida({ texto });
		expect(r.texto).toBe(texto);
		expect(r.texto).not.toContain("conforme a LGPD");
		expect(r.texto).not.toContain("Posso seguir");
	});

	it("pedir o celular não ganha aviso", () => {
		const r = montarTrechoDeSaida({ texto: "Qual é o seu celular com DDD?" });
		expect(r.texto).toBe("Qual é o seu celular com DDD?");
	});

	it("o CPF em claro continua mascarado na saída (encanamento fica)", () => {
		const r = montarTrechoDeSaida({ texto: "Anotado: 111.444.777-35, obrigado." });
		expect(r.texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
	});

	it("nenhum trecho do turno consulta aviso da LGPD", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toContain("montarTrechoDeSaida({");
		expect(corpo).not.toMatch(/aviso\s+d[ao]\s+LGPD|AVISO_LGPD|PEDE_DADO/);
		expect(fonte).not.toMatch(/avisoDado|garanteAvisoLgpd|avisoAplicado/);
	});

	it("o avaliador não tem regra de dado sem aviso", () => {
		const fonte = readFileSync(new URL("./eval/golden.ts", import.meta.url).pathname, "utf8");
		expect(fonte).not.toContain("dado-sem-aviso");
	});
});

describe("L32/N04 — só é pedido de dado quando há ato de pedir", () => {
	it("mencionar o canal ou o cadastro não é pedir dado", () => {
		for (const fala of [
			"Atendemos pelo WhatsApp, de segunda a sexta.",
			"Seu celular cadastrado recebe o contrato por WhatsApp.",
			"O telefone da administradora aparece no contrato.",
			"O contrato informa o telefone da administradora.",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(false);
			expect(montarTrechoDeSaida({ texto: fala }).texto, fala).toBe(fala);
		}
	});

	it("o pedido de dado de verdade continua sendo pedido", () => {
		for (const fala of [
			"Me passa seu CPF pra eu gerar a proposta.",
			"Qual é o seu celular com DDD?",
			"Preciso do seu CPF para simular.",
			"Envie o número do seu WhatsApp, por favor.",
			"Pode me passar seu CPF?",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(true);
		}
	});

	it("o balão não troca a fala sobre o canal por um aviso de consentimento", () => {
		const r = montarTrechoDeSaida({
			texto:
				"Atendemos pelo WhatsApp, de segunda a sexta. Seu celular cadastrado recebe o contrato por lá.",
		});
		expect(r.texto).not.toContain("conforme a LGPD");
	});
});

describe("a revogação é o único bloqueio que resta — e ela lê só a fala do CLIENTE", () => {
	it("o caso medido: 'não autorizo o uso dos meus dados' barra a proposta", () => {
		const r = revogouOsDados([
			{ role: "user", content: "meu cpf é 111.444.777-35" },
			{ role: "user", content: "não autorizo o uso dos meus dados" },
		]);
		expect(r?.fala).toContain("não autorizo");
	});

	it("as formas de revogação medidas continuam reconhecidas", () => {
		for (const fala of [
			"revogo a autorização",
			"não autorizo a consulta",
			"não permito",
			"não pode usar meu CPF",
			"não quero mais que vocês consultem",
			"não vou autorizar",
			"não aceito que consultem",
		])
			expect(revogouOsDados([{ role: "user", content: fala }]), fala).not.toBeNull();
	});

	it("recusar um detalhe da oferta NÃO é revogação", () => {
		for (const fala of [
			"não aceito o prazo de 80 meses",
			"não gostei dessa parcela",
			"prefiro o de 48 meses",
			"posso revogar isso depois?",
			"se eu não autorizar a consulta, o que acontece?",
		])
			expect(revogouOsDados([{ role: "user", content: fala }]), fala).toBeNull();
	});

	it("a fala do AGENTE nunca revoga o consentimento do cliente", () => {
		const r = revogouOsDados([
			{ role: "assistant", content: "Se você não autorizar, eu não sigo com a proposta." },
			{ role: "user", content: "quero essa mesma, bora fechar" },
		]);
		expect(r).toBeNull();
	});
});
