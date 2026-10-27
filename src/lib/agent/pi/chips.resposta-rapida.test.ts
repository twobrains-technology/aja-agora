// TODO TURNO TEM TOQUE — a garantia, e o que ela NÃO faz.
//
// Ordem do dono (27/10/2026, 13:35): *"sempre ter opcoes de responta automatica que facam sentido
// com a dinamica da conversa"*. Linha de base medida no banco do dev antes desta mudança: **408 de
// 3.073** turnos do agente (13,3 %) saíam com `quick_reply`, porque o detector só via lista marcada
// no texto ou "A ou B?". Estes testes provam o contrato novo pelo caminho mais firme — o turno
// (`montarTrechoDeSaida`), não o prompt.
//
// DUAS ORDENS INVERTERAM O CRITÉRIO (27/10/2026):
// · 17:15 — o toque é a RESPOSTA do cliente ao que ESTE turno do agente acabou de dizer. O toque
//   por PALAVRA-TEMA saiu (`Quero dar lance` · `Prefiro só sorteio` voltavam depois de o agente
//   pedir "quer ver os números?") e a fala do cliente entra como filtro anti-eco.
// · 17:16 — os balões aparecem em TODO turno, pergunte o agente ou não. "Turno sem '?' não ganha
//   botão" deixou de valer; o que vale é o card que já É a escolha.
//
// O que a garantia NÃO faz: picar a fala em botões (o balão do modelo sai inteiro) e duplicar a
// escolha onde já existe card de escolha na tela.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type CardGerado, garantirChip } from "./chips";
import { sugestaoDoTurno, sugestoesDaPergunta } from "./sugestoes";

/** Os rótulos do card — só `quick_reply` os tem (o `value_picker` é o slider do valor). */
const rotulosDoChip = (chip: CardGerado | null) =>
	chip?.type === "quick_reply" ? chip.payload.options.map((o) => o.label) : [];

const rotulos = (
	texto: string,
	extra: {
		temCartaNaTela?: boolean;
		falaDoCliente?: string;
		categoriaDoBem?: "auto" | "moto" | "imovel";
		canal?: "web" | "whatsapp";
	} = {},
) => rotulosDoChip(garantirChip({ texto, cardsDoTurno: [], ...extra }).chip);

describe("(a) pergunta feita ⇒ opções de um toque, derivadas do momento", () => {
	it("oferta na tela: a pergunta aberta vira escolha da carta", () => {
		expect(rotulos("Qual dessas cartas fica melhor pra você?", { temCartaNaTela: true })).toEqual([
			"Quero essa",
			"Ver outra opção",
			"Como funciona o lance?",
		]);
	});

	it("valor, parcela, bem, CPF, lance e fecho têm as suas respostas", () => {
		expect(rotulos("Quanto você pensa em gastar no carro?")).toEqual([
			"Até R$ 50 mil",
			"Uns R$ 80 mil",
			"R$ 100 mil ou mais",
		]);
		expect(rotulos("Quanto cabe na parcela por mês?")).toContain("Quero saber o mínimo");
		expect(rotulos("O bem é carro, moto ou imóvel?")).toEqual(["Carro", "Moto", "Imóvel"]);
		expect(rotulos("Qual é o seu CPF?")).toContain("Pode usar meu CPF");
		// Inversão de critério (ordem do dono, 27/10 17:15): "Posso usar seu CPF?" e "Posso gerar
		// a proposta agora?" são perguntas de SIM/NÃO — a resposta é sim/não casado com o verbo do
		// pedido, não a lista de tema do dado. O dado concreto continua respondendo quando o
		// agente o PEDE ("Qual é o seu CPF?", acima).
		expect(rotulos("Posso usar seu CPF pra consultar?")).toEqual(["Sim, pode", "Agora não"]);
		expect(rotulos("Posso gerar a proposta agora?")).toEqual(["Pode seguir", "Agora não"]);
		// "Você quer dar lance pra antecipar?" também é sim/não: o verbo não é nem mostrar
		// números, nem seguir, nem WhatsApp — resposta de sim/não genérica.
		expect(rotulos("Você quer dar lance pra antecipar?")).toEqual(["Sim, pode", "Agora não"]);
		expect(rotulos("Posso continuar pelo WhatsApp?")).toEqual([
			"Sigo pelo WhatsApp",
			"Prefiro aqui",
		]);
	});

	it("pergunta de sim/não casa a resposta com o VERBO do pedido", () => {
		expect(rotulos("Quer que eu mostre as parcelas para comparar?")).toEqual([
			"Quero ver os números",
			"Agora não",
		]);
		expect(rotulos("Podemos seguir com essa?")).toEqual(["Pode seguir", "Agora não"]);
		expect(rotulos("Faz sentido pra você?")).toEqual(["Sim, pode", "Agora não"]);
	});

	it("o balão NÃO é reescrito quando o chip vem do momento", () => {
		const texto = "Temos 4 cartas boas aqui. Qual delas combina com você?";
		const r = garantirChip({ texto, cardsDoTurno: [], temCartaNaTela: true });
		expect(r.texto).toBe(texto);
		expect(rotulosDoChip(r.chip).length).toBeGreaterThanOrEqual(2);
	});

	it("card que já É a escolha não ganha outro por cima", () => {
		for (const type of ["quick_reply", "value_picker", "topic_picker"]) {
			const r = garantirChip({
				texto: "Perfeito, já anotei seu nome e vou buscar as cartas.",
				cardsDoTurno: [{ type }],
			});
			expect(r.chip, type).toBeNull();
		}
	});

	it("turno SEM pergunta também tem toque (ordem das 17:16)", () => {
		// Antes: `null` — o cliente lia "Encontrei 4 opções na tela" e não tinha o que tocar.
		expect(
			rotulos("Encontrei 4 opções na tela para um carro de R$ 90 mil.", {
				temCartaNaTela: true,
			}),
		).toEqual(["Quero essa", "Ver outra opção", "Falar do lance"]);
		expect(rotulos("Perfeito, já anotei tudo e vou buscar as cartas.")).toEqual([
			"Quero ver as opções",
			"Tenho uma dúvida",
		]);
	});

	it("card que COLETA o dado é a resposta do pedido de digitar — nada de balão ao lado", () => {
		// A exceção existe para o pedido explícito ("digite o CPF"), que o card já atende.
		const r = garantirChip({
			texto: "Digite seu CPF aqui no formulário que eu já consulto.",
			cardsDoTurno: [{ type: "contract_form" }],
		});
		expect(r.chip).toBeNull();
	});

	it("os outros cards saem ACOMPANHADOS dos próximos passos (prints 02 e 04 do dono)", () => {
		// Antes o opt-in do WhatsApp e a oferta real matavam o balão: o turno terminava sem
		// nada para tocar (ordem das 17:16).
		for (const type of ["whatsapp_optin", "real_offer", "signature_handoff", "document_upload"]) {
			const r = garantirChip({
				texto: "Me passa seu WhatsApp no card aqui embaixo que eu te mando essa carta.",
				cardsDoTurno: [{ type }],
			});
			expect(rotulosDoChip(r.chip), type).toEqual(["Quero ver as opções", "Tenho uma dúvida"]);
		}
	});

	it("a pergunta de valor sai no SLIDER quando a categoria do bem está no contexto", () => {
		// Ordem da auditoria ("4 turnos pedindo valor saíram em texto puro") + ordem do dono das
		// 13:50: a pergunta de valor tem card. Os números são os de `CREDIT_BOUNDS` (auto) — nada
		// inventado aqui.
		const r = garantirChip({
			texto: "Quanto você pensa em gastar no carro?",
			cardsDoTurno: [],
			categoriaDoBem: "auto",
		});
		expect(r.chip).toEqual({
			type: "value_picker",
			payload: {
				category: "auto",
				fields: [
					{
						id: "valor-do-bem",
						label: "Valor do bem",
						min: 20_000,
						max: 500_000,
						step: 10_000,
						default: 80_000,
						format: "currency",
					},
				],
			},
		});
		// Sem a categoria não há faixa real para o slider: as faixas viram botão — e no
		// WhatsApp o `value_picker` não sai de jeito nenhum (FIX-109: lá o valor é conversa).
		const faixas = ["Até R$ 50 mil", "Uns R$ 80 mil", "R$ 100 mil ou mais"];
		expect(rotulos("Quanto você pensa em gastar no carro?")).toEqual(faixas);
		expect(
			rotulos("Quanto você pensa em gastar no carro?", {
				categoriaDoBem: "auto",
				canal: "whatsapp",
			}),
		).toEqual(faixas);
	});
});

describe("(print 06) o card responde a pergunta que o agente FEZ", () => {
	it("pedido de lance/valor guardado sai em quick_reply, nunca no slider do valor do bem", () => {
		// Defeito medido na produção `a02d8ead` (print
		// `.orientacao/prints-ux/06-quick-reply-responde-a-pergunta.png`): o agente perguntou "Você
		// tem algum valor guardado para oferecer?" e o servidor respondeu com o card
		// `value_picker` "Valor do bem" (slider de 80.000) — card que responde OUTRA pergunta.
		// Causa: `DADO_DE_VALOR` (`/valor/`) casava "algum valor guardado".
		const lance = sugestaoDoTurno("Você tem algum valor guardado para oferecer?", {
			temCartaNaTela: true,
			categoriaDoBem: "auto",
			canal: "web",
		});
		expect(lance.tipoDoCard).toBe("quick_reply");
		expect(lance.opcoes).toContain("Tenho pouco");
		expect(lance.opcoes).toEqual([
			"Tenho sim, consigo dar lance",
			"Tenho pouco",
			"Agora não tenho",
		]);
	});

	it("controle: a pergunta do valor do BEM continua no slider", () => {
		// A correção é de ESCOPO: só o valor que o cliente JÁ TEM sai do `value_picker`. Quem
		// pergunta quanto custa o bem que ele quer continua com o slider da faixa da categoria.
		const bem = sugestaoDoTurno("Qual valor de carro você tem em mente?", {
			categoriaDoBem: "auto",
			canal: "web",
		});
		expect(bem.tipoDoCard).toBe("value_picker");
	});
});

describe("(b) as exceções são deliberadas", () => {
	it("pergunta de resposta livre (o nome) não tem botão que diga o nome — tem saída", () => {
		// O auditor da bateria cobrou o requisito LITERAL do dono ("sempre ter opções de
		// resposta automática"): 43 de 186 perguntas ficavam sem nenhum toque, quase todas
		// a do nome. Agora a pergunta de nome traz duas saídas que não recusam o dado.
		for (const fala of [
			"Qual é o seu nome?",
			"Como você se chama?",
			"Antes de eu te ajudar, como posso te chamar?",
			"Show, carro novo abre portas! Como posso te chamar?",
			"Prazer! Qual é o seu primeiro nome?",
			"Antes de eu confirmar, me diz seu nome?",
			"Claro, vou abrir o caso para você. Antes, qual o nome?",
		]) {
			expect(sugestoesDaPergunta(fala), fala).toEqual([
				"Vamos direto às cartas",
				"Depois eu te digo",
			]);
			// Nunca um botão que empurre a pessoa a pular o contato nem "Pode seguir" solto.
			expect(rotulos(fala), fala).not.toContain("Pode seguir");
		}
	});

	it("a lista escrita no texto continua ganhando do momento (o balão fica só com a pergunta)", () => {
		const r = garantirChip({
			texto: "Pra quando você quer?\n1) Agora\n2) Nos próximos meses",
			cardsDoTurno: [],
		});
		expect(r.texto).toBe("Pra quando você quer?");
		expect(rotulosDoChip(r.chip)).toEqual(["Agora", "Nos próximos meses"]);
	});
});

describe("(c) a ORDEM das 17:15: o toque responde a ESTE turno, não ao tema", () => {
	it("print 05: o pedido de mostrar os números não vira toque de lance nem eco do cliente", () => {
		const perguntas = sugestoesDaPergunta(
			"Quer que eu mostre os números exatos do lance na carta de R$ 230 mil, para você comparar?",
			{
				temCartaNaTela: true,
				falaDoCliente: "e como funciona esse lance? vale a pena dar lance?",
			},
		);
		expect(perguntas).not.toContain("Como funciona o lance?");
		expect(perguntas).not.toContain("Quero dar lance");
		expect(perguntas).not.toContain("Prefiro só sorteio");
		expect(perguntas).toEqual(["Quero ver os números", "Agora não"]);
	});

	it("turno sem pergunta devolve próximo passo — nunca `null` (ordem das 17:16)", () => {
		const opcoes = sugestoesDaPergunta("Encontrei 4 opções na tela para um carro de R$ 90 mil.", {
			temCartaNaTela: true,
			falaDoCliente: "quero um carro",
		});
		expect(opcoes.length).toBeGreaterThanOrEqual(2);
		expect(opcoes).toEqual(["Quero essa", "Ver outra opção", "Falar do lance"]);
	});

	it("anti-eco: opção igual (ou toda feita de palavras) da fala do cliente é descartada", () => {
		expect(
			sugestoesDaPergunta("Como você está vendo isso hoje?", {
				falaDoCliente: "pode seguir",
			}),
		).not.toContain("Pode seguir");
		// A repetição não precisa ser literal: "como funciona ESSE lance" × "como funciona O lance".
		expect(
			sugestoesDaPergunta("E agora, qual dessas fica melhor pra você?", {
				temCartaNaTela: true,
				falaDoCliente: "como funciona o lance?",
			}),
		).not.toContain("Como funciona o lance?");
	});

	it("o turno passa fala do cliente e categoria do bem para o chip", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toContain("temCartaNaTela: ctx.cartasNaTela.length > 0");
		expect(corpo).toContain("canal: ctx.channel");
		expect(corpo).toContain("falaDoCliente: falaDoClienteDoTurno");
		expect(corpo).toContain("categoriaDoBem: estado.funnel.currentCategory");
		expect(corpo).toContain("ctx.cards.push(saida.chip");
	});
});
