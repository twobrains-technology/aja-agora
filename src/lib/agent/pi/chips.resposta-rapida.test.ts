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
import { type CardGerado, chipDoTurno, garantirChip } from "./chips";
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
		// Ordem do líder de 22:35: sim/não de envio pelo WhatsApp se responde "Pode mandar" /
		// "Prefiro ver aqui" — o texto do botão é a fala do cliente, não o nome do canal.
		expect(rotulos("Posso continuar pelo WhatsApp?")).toEqual(["Pode mandar", "Prefiro ver aqui"]);
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

	it("os outros cards saem ACOMPANHADOS da resposta ao pedido (prints 02 e 04 do dono)", () => {
		// Antes o opt-in do WhatsApp e a oferta real matavam o balão: o turno terminava sem
		// nada para tocar (ordem das 17:16). O turno continua com toque — e, desde a R20, o toque
		// é a resposta ao PEDIDO do balão (o WhatsApp que ele pediu), não um próximo passo
		// genérico.
		const pedidoDoWhatsApp =
			"Me passa seu WhatsApp no card aqui embaixo que eu te mando essa carta.";
		for (const type of ["real_offer", "signature_handoff", "document_upload"]) {
			const r = garantirChip({ texto: pedidoDoWhatsApp, cardsDoTurno: [{ type }] });
			expect(rotulosDoChip(r.chip), type).toEqual([
				"Mando meu celular",
				"Por que precisa do celular?",
			]);
		}
		// Com o card que COLETA o dado pedido, o card é a resposta: nada de chip do mesmo dado
		// por cima dele (ordem da R20 — antes saíam os próximos passos ao lado do opt-in).
		const comOptIn = garantirChip({
			texto: pedidoDoWhatsApp,
			cardsDoTurno: [{ type: "whatsapp_optin" }],
		});
		expect(comOptIn.chip).toBeNull();
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

describe("(print 10) a alternativa escrita na pergunta é a resposta — não o par de números", () => {
	it("«Quer seguir com ela ou prefere comparar outra?» → seguir · comparar", () => {
		// Defeito do print `.orientacao/prints-ux/10-conversa-picada-oferta.png` (ordem do líder,
		// 27/10/2026 19:40): o agente oferecia os dois caminhos e os toques saíam `Quero ver os
		// números` · `Agora não` — nenhum dos dois responde à pergunta. Causa: o ramo de sim/não
		// rodava antes de qualquer alternativa, e `PEDIDO_DE_NUMEROS` casa "compara" (de
		// "comparar").
		const opcoes = sugestaoDoTurno("Quer seguir com ela ou prefere comparar outra?", {
			temCartaNaTela: true,
			falaDoCliente: "quero um carro de uns 90 mil",
			categoriaDoBem: "auto",
		}).opcoes;
		expect(opcoes).toEqual(["Quero seguir com ela", "Comparar outra"]);
		const juntas = opcoes.join(" | ").toLowerCase();
		expect(juntas).toContain("seguir com ela");
		expect(juntas).toContain("comparar outra");
		expect(juntas).not.toContain("números");
		expect(juntas).not.toContain("agora não");
	});

	it("«Prefere uma parcela menor ou um prazo mais curto?» → um toque por lado", () => {
		expect(sugestaoDoTurno("Prefere uma parcela menor ou um prazo mais curto?").opcoes).toEqual([
			"Uma parcela menor",
			"Um prazo mais curto",
		]);
	});

	it("«Quer carro ou moto?» → um toque por lado, sem a voz do agente", () => {
		expect(sugestoesDaPergunta("Quer carro ou moto?")).toEqual(["Carro", "Moto"]);
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

	it("turno de transferência tem toque de transferência, não o do momento", () => {
		// Print 16 reprovado pelo líder (27/10): cliente pediu humano e o agente perguntou o
		// nome com os toques de abertura (`Vamos direto às cartas` / `Depois eu te digo`). Os
		// toques do momento não respondem a um pedido de gente — quem responde é por ONDE o
		// consultor chama.
		for (const fala of [
			"Claro, vou te passar pra um consultor.\n\nPra ele já te chamar pelo nome e no seu WhatsApp: como você se chama e qual o seu número?",
			"Pra esse caso, recomendo conversar direto com nosso consultor humano.",
			"Já abri o caso pra nossa mesa. Um atendente humano assume por aqui.",
		]) {
			expect(rotulos(fala), fala).toEqual(["Pode me ligar", "Prefiro pelo WhatsApp"]);
			expect(rotulos(fala), fala).not.toContain("Vamos direto às cartas");
			expect(rotulos(fala), fala).not.toContain("Pode seguir");
		}
	});

	it("pergunta aberta com 'ou' no fim não vira botão que repete a pergunta (visto ao vivo, 28/10)", () => {
		const fala = "Qual dessas opções mais te interessa ou prefere alguma outra característica?";
		const opcoes = rotulos(fala, { temCartaNaTela: true });
		// os botões são respostas do cliente à oferta, não pedaços da pergunta do agente
		expect(opcoes).toEqual(["Quero essa", "Ver outra opção", "Como funciona o lance?"]);
		expect(opcoes.join(" ")).not.toMatch(/qual dessas|te interessa|outra característica/i);
		// sem carta na tela, o fallback do momento — nunca o corte da pergunta
		const semCarta = rotulos(fala);
		expect(semCarta.join(" ")).not.toMatch(/qual dessas|te interessa|outra característica/i);
	});

	it("a alternativa de verdade continua sendo as duas escolhas (seguir × comparar)", () => {
		expect(
			rotulos("Quer seguir com essa, Kairo, ou prefere comparar outra opção?", {
				temCartaNaTela: true,
			}),
		).toEqual(["Quero seguir com essa", "Comparar outra opção"]);
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
		// ORDEM DO LÍDER, 27/10 18:08: o card é UM por turno e sai no ÚLTIMO balão —
		// não por trecho. O mesmo contexto (fala do cliente, categoria, carta na tela)
		// alimenta a decisão do fim do turno.
		const fim = fonte.slice(
			fonte.indexOf("// O ÚNICO TOQUE DO TURNO"),
			fonte.indexOf('emitirCardsNovos("todos")'),
		);
		expect(fim).toContain("baloes: baloesDoTurno");
		expect(fim).toContain("falaDoCliente: falaDoClienteDoTurno");
		expect(fim).toContain("categoriaDoBem: estado.funnel.currentCategory");
		expect(fim).toContain("ctx.cards.push(toqueDoTurno");
	});
});

describe("(print 12) o vocativo não estraga a alternativa", () => {
	it("'Quer seguir com essa, Kairo, ou prefere comparar outra opção?' vira seguir × comparar", () => {
		const r = sugestaoDoTurno("Quer seguir com essa, Kairo, ou prefere comparar outra opção?", {
			temCartaNaTela: true,
			falaDoCliente: "quero um carro de uns 90 mil",
			categoriaDoBem: "auto",
		});
		const juntas = r.opcoes.join(" | ").toLowerCase();
		expect(juntas).toContain("seguir");
		expect(juntas).toContain("comparar");
		expect(juntas).not.toContain("números");
	});
});

describe("(print 13) aviso de dado não vira saída de nome", () => {
	it("'no seu nome, preciso do seu CPF e do seu celular com DDD.' pede CPF, não o nome", () => {
		const r = sugestaoDoTurno(
			"Ótima escolha, Kairo. Para gerar a proposta no seu nome, preciso do seu CPF e do seu celular com DDD.",
			{ temCartaNaTela: true, categoriaDoBem: "auto" },
		);
		const juntas = r.opcoes.join(" | ").toLowerCase();
		expect(juntas).not.toContain("cartas");
		expect(juntas).toContain("cpf");
	});
});

describe("(R21) o pedido de dado no BEAT ÚNICO — a frase que pede, não só a última", () => {
	// Defeito medido no SHA `e2461a52` (auditoria independente, e visível no banco): com o pedido
	// de dado e o fecho na MESMA resposta, o toque saía genérico ou de oferta. Duas causas:
	//  · `PEDIDO_DIRETO` cobria "pode me passar" e não "pode me mandar"/"consegue me mandar";
	//  · `decidir` olhava o texto inteiro ou só a última frase, e o fecho afirmativo
	//    ("Se for a Canopus… eu já gero a proposta") escondia o pedido da frase anterior.
	const ehDoDado = (rotulo: string) => /\bcpf\b|celular|whats?\s?app/i.test(rotulo);

	const BEAT_UNICO_COM_PERGUNTA =
		"Pode me mandar o CPF e o celular escritos aqui mesmo? Se for a Canopus de 96 meses que eu recomendei, eu já gero a proposta no seu nome.";
	const BEAT_UNICO_SEM_PERGUNTA = "Pode me mandar o CPF e o celular. Vou gerar a proposta.";

	it("(a) pedido com '?' na primeira frase + fecho afirmativo → toque do dado", () => {
		for (const opcoes of [
			rotulos(BEAT_UNICO_COM_PERGUNTA, { temCartaNaTela: true, categoriaDoBem: "auto" }),
			sugestaoDoTurno(BEAT_UNICO_COM_PERGUNTA, { temCartaNaTela: true, categoriaDoBem: "auto" })
				.opcoes,
		]) {
			expect(opcoes.length, opcoes.join(" | ")).toBeGreaterThanOrEqual(2);
			expect(ehDoDado(opcoes[0] ?? ""), opcoes.join(" | ")).toBe(true);
			expect(opcoes).not.toContain("Pode seguir");
			expect(opcoes).not.toContain("Quero essa");
		}
	});

	it("(b) pedido + fecho sem '?' no MESMO beat → toque do dado, nunca 'Quero essa'", () => {
		const opcoes = rotulos(BEAT_UNICO_SEM_PERGUNTA, {
			temCartaNaTela: true,
			categoriaDoBem: "auto",
		});
		expect(opcoes.length).toBeGreaterThanOrEqual(2);
		expect(ehDoDado(opcoes[0] ?? ""), opcoes.join(" | ")).toBe(true);
		expect(opcoes).not.toContain("Quero essa");
		expect(opcoes).not.toContain("Ver outra opção");
	});

	it("o TURNO de um balão só entrega o card do dado, não o do fecho", () => {
		// O caminho real: `chipDoTurno` com um balão único. Antes o toque vinha do fecho.
		const chip = chipDoTurno({
			baloes: [BEAT_UNICO_COM_PERGUNTA],
			cardsDoTurno: [],
			temCartaNaTela: true,
			categoriaDoBem: "auto",
		});
		const labels = rotulosDoChip(chip);
		expect(labels.length).toBeGreaterThanOrEqual(2);
		expect(ehDoDado(labels[0] ?? ""), labels.join(" | ")).toBe(true);
	});

	it("os VERBOS novos do pedido são reconhecidos em qualquer posição da frase", () => {
		for (const frase of [
			"Consegue me mandar o CPF aqui?",
			"Pode mandar o CPF e o celular no chat.",
			"Para seguir, vou precisar do seu CPF.",
			"Me envia o celular com DDD.",
			"Me confirma o CPF, por favor.",
		]) {
			const opcoes = rotulos(frase, { temCartaNaTela: true });
			expect(ehDoDado(opcoes[0] ?? ""), `${frase} → ${opcoes.join(" | ")}`).toBe(true);
		}
	});

	it("(c) regressão: turno de oferta SEM pedido de dado continua nos próximos passos", () => {
		expect(
			rotulos("Encontrei 4 opções na tela para um carro de R$ 90 mil.", { temCartaNaTela: true }),
		).toEqual(["Quero essa", "Ver outra opção", "Falar do lance"]);
	});

	it("regressão: a OFERTA (quem oferece o dado, não pede) continua sim/não", () => {
		expect(rotulos("Posso usar seu CPF pra consultar?")).toEqual(["Sim, pode", "Agora não"]);
	});
});

describe("(R20) o pedido de dado no MEIO da frase ganha o toque do DADO", () => {
	// Defeito medido no SHA `3236f59f` (auditoria independente, janela da R20, 237 turnos do
	// agente): **24 turnos que pedem CPF/celular/WhatsApp** entregaram toque que não responde ao
	// pedido — em 6 deles sem NENHUM toque do dado. Causa: o ramo `(e0)` do `sugestoes.ts` só casava
	// o pedido ANCORADO NO INÍCIO da frase (`/^(?:me\s+(?:diz|manda…))/`), e "…, me manda seu CPF e
	// seu celular" tem o pedido no meio — caía em `PROXIMOS_COM_CARTA` (`Quero essa`). As cinco
	// frases abaixo são literais do banco; a primeira opção tem de ser DO DADO.
	const FRASES_DO_BANCO = [
		"Recebi seu CPF, Carla. Agora me manda seu celular com DDD.",
		"Perfeito, Carla! Só me manda seu CPF e seu celular que eu gero a proposta.",
		"Para fechar a proposta, me manda seu CPF e seu celular.",
		"Sem problema, pode mandar o CPF e o celular aqui mesmo, ou preencher no card.",
		"Boa, Beatriz! Para sair no seu nome, me manda seu CPF e seu celular.",
	];

	const ehDoDado = (rotulo: string) => /\bcpf\b|celular|whats?\s?app/i.test(rotulo);

	for (const frase of FRASES_DO_BANCO) {
		it(`«${frase}» → toque do dado, nunca "Quero essa"`, () => {
			const opcoes = rotulos(frase, { temCartaNaTela: true, categoriaDoBem: "auto" });
			expect(opcoes.length).toBeGreaterThanOrEqual(2);
			expect(opcoes).not.toContain("Quero essa");
			expect(ehDoDado(opcoes[0] ?? ""), opcoes.join(" | ")).toBe(true);
		});
	}

	it("«pode mandar o CPF e o celular aqui mesmo, ou preencher no card» → CPF no primeiro toque", () => {
		const opcoes = rotulos(
			"Sem problema, pode mandar o CPF e o celular aqui mesmo, ou preencher no card.",
			{ temCartaNaTela: true },
		);
		expect(opcoes[0] ?? "").toMatch(/cpf|celular/i);
	});

	it("pedido de WhatsApp com o card `whatsapp_optin` no turno não ganha chip redundante", () => {
		// O card É a resposta do pedido: um chip "Mando meu celular" ao lado convida a pessoa a
		// responder por fora do card que já coleta o dado.
		const r = garantirChip({
			texto: "Perfeito, Carla! Me manda seu WhatsApp aqui no card que eu te envio a carta.",
			cardsDoTurno: [{ type: "whatsapp_optin" }],
		});
		expect(r.chip).toBeNull();
	});

	it("regressão: turno de oferta sem pedido de dado continua com os próximos passos", () => {
		expect(
			rotulos("Encontrei 4 opções na tela para um carro de R$ 90 mil.", {
				temCartaNaTela: true,
			}),
		).toEqual(["Quero essa", "Ver outra opção", "Falar do lance"]);
	});
});

describe("(auditoria 28/10) o pedido de contato e o de nome no turno de handoff", () => {
	it("'Qual seu número?' e 'Me passa seu número' pedem o CELULAR, não próximo passo", () => {
		for (const fala of ["Qual seu número?", "Me passa seu número, por favor."]) {
			const r = sugestaoDoTurno(fala, { temCartaNaTela: true, categoriaDoBem: "auto" });
			expect(r.opcoes.join(" ").toLowerCase()).toContain("celular");
			expect(r.opcoes).not.toContain("Quero essa");
		}
	});

	it("'Se puder confirmar seu CPF e celular…' pede o CPF do cliente", () => {
		const r = sugestaoDoTurno("Se puder confirmar seu CPF e celular, já gero a proposta pra você!", {
			temCartaNaTela: true,
			categoriaDoBem: "auto",
		});
		expect(r.opcoes.join(" ").toLowerCase()).toContain("cpf");
	});

	it("mas 'me mostra os números do card' continua sendo o par de números", () => {
		const r = sugestaoDoTurno("Quer que eu te mostre os números do card?", { temCartaNaTela: true });
		expect(r.opcoes).toEqual(["Quero ver os números", "Agora não"]);
	});
});
