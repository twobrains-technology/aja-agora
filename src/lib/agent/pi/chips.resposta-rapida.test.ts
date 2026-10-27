// TODO TURNO QUE ESPERA RESPOSTA TRAZ UM TOQUE — a garantia, e o que ela NÃO faz.
//
// Ordem do dono (27/10/2026, 13:35): *"sempre ter opcoes de responta automatica que facam sentido
// com a dinamica da conversa"*. Linha de base medida no banco do dev antes desta mudança: **408 de
// 3.073** turnos do agente (13,3 %) saíam com `quick_reply`, porque o detector só via lista marcada
// no texto ou "A ou B?". Estes testes provam o contrato novo pelo caminho mais firme — o turno
// (`montarTrechoDeSaida`), não o prompt.
//
// O que a garantia NÃO faz: picar a fala em botões (o balão do modelo sai inteiro) e empurrar
// botão onde já existe card com ação própria (proposta, formulário, opt-in do WhatsApp).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { garantirChip } from "./chips";
import { sugestoesDaPergunta } from "./sugestoes";

const rotulos = (texto: string, extra: { temCartaNaTela?: boolean } = {}) =>
	garantirChip({ texto, cardsDoTurno: [], ...extra }).chip?.payload.options.map((o) => o.label);

describe("(a) pergunta feita ⇒ opções de um toque, derivadas do momento", () => {
	it("oferta na tela: a pergunta aberta vira escolha da carta", () => {
		expect(rotulos("Qual dessas cartas fica melhor pra você?", { temCartaNaTela: true })).toEqual([
			"Quero essa",
			"Ver outra opção",
			"Como funciona o lance?",
		]);
	});

	it("valor, parcela, bem, CPF, lance, contemplação e fecho têm as suas respostas", () => {
		expect(rotulos("Quanto você pensa em gastar no carro?")).toEqual([
			"Até R$ 50 mil",
			"Uns R$ 80 mil",
			"R$ 100 mil ou mais",
		]);
		expect(rotulos("Quanto cabe na parcela por mês?")).toContain("Quero saber o mínimo");
		expect(rotulos("O bem é carro, moto ou imóvel?")).toEqual(["Carro", "Moto", "Imóvel"]);
		expect(rotulos("Posso usar seu CPF pra consultar?")).toContain("Pode usar meu CPF");
		expect(rotulos("Você quer dar lance pra antecipar?")).toContain("Quero dar lance");
		expect(rotulos("Sabe como funciona a contemplação?")).toContain("Como é o sorteio?");
		expect(rotulos("Posso gerar a proposta agora?")).toEqual([
			"Pode gerar a proposta",
			"Quero ver outra carta",
		]);
	});

	it("pergunta de sim/não: o toque é o sim e a dúvida", () => {
		expect(rotulos("Podemos seguir com essa?")).toEqual([
			"Sim, pode seguir",
			"Ainda tenho uma dúvida",
		]);
	});

	it("o balão NÃO é reescrito quando o chip vem do momento", () => {
		const texto = "Temos 4 cartas boas aqui. Qual delas combina com você?";
		const r = garantirChip({ texto, cardsDoTurno: [], temCartaNaTela: true });
		expect(r.texto).toBe(texto);
		expect(r.chip?.payload.options.length).toBeGreaterThanOrEqual(2);
	});

	it("turno que NÃO pergunta não ganha botão (não é menu por menu)", () => {
		expect(rotulos("Perfeito, já anotei seu nome e vou buscar as cartas.")).toBeUndefined();
	});
});

describe("(b) as exceções são deliberadas", () => {
	it("pergunta de resposta livre (o nome) não vira botão", () => {
		expect(sugestoesDaPergunta("Qual é o seu nome?")).toBeNull();
		expect(rotulos("Como você se chama?")).toBeUndefined();
	});

	it("card que já pede um toque dispensa o chip — nada se duplica", () => {
		for (const type of ["real_offer", "contract_form", "whatsapp_optin", "quick_reply"]) {
			const r = garantirChip({
				texto: "Podemos seguir com essa?",
				cardsDoTurno: [{ type }],
			});
			expect(r.chip, type).toBeNull();
		}
	});

	it("a lista escrita no texto continua ganhando do momento (o balão fica só com a pergunta)", () => {
		const r = garantirChip({
			texto: "Pra quando você quer?\n1) Agora\n2) Nos próximos meses",
			cardsDoTurno: [],
		});
		expect(r.texto).toBe("Pra quando você quer?");
		expect(r.chip?.payload.options.map((o) => o.label)).toEqual(["Agora", "Nos próximos meses"]);
	});
});

describe("(c) o turno aplica o contexto do momento", () => {
	it("`soltarTrecho` passa carta na tela e canal para o chip", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toContain("temCartaNaTela: ctx.cartasNaTela.length > 0");
		expect(corpo).toContain("canal: ctx.channel");
		expect(corpo).toContain("ctx.cards.push(saida.chip");
	});
});
