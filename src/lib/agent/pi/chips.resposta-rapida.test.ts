// 09/11 (P11, bugs 5/6/9/10): O SERVIDOR NÃO ADIVINHA ATALHO. `garantirChip`/`chipDoTurno` só
// emitem a lista que o modelo ESCREVEU; a derivação por "momento" (`sugestoes.ts`) saiu do turno —
// ela respondia OUTRA pergunta (Carro/Moto/Imóvel depois de "para que o carro?"; "Pode seguir"
// depois de "qual é o valor?"). Ela segue viva só para os avisos do servidor (`chips-dos-avisos`),
// e os testes abaixo que usam `rotulos(...)` provam a derivação pura, não o turno. O contrato do
// turno está no bloco "(09/11)" no fim do arquivo.
//
// TODO TURNO TEM TOQUE — o histórico (derivação pura de `sugestoes.ts`).
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
) => sugestoesDaPergunta(texto, extra);

const GENERICO = ["Pode seguir", "Tenho uma dúvida"];

describe("(a) pergunta feita ⇒ opções de um toque, derivadas do momento", () => {
	it("oferta na tela: a pergunta aberta vira escolha da carta", () => {
		expect(rotulos("Qual dessas cartas fica melhor pra você?", { temCartaNaTela: true })).toEqual([
			"Quero essa",
			"Ver outra opção",
			"Como funciona o lance?",
		]);
	});

	it("valor, parcela, bem, CPF, lance e fecho têm as suas respostas", () => {
		// A faixa inventada saiu (drop invented chips, develop): sem categoria, a pergunta
		// de valor cai no toque do momento; com categoria, é o slider (`value_picker`).
		expect(rotulos("Quanto você pensa em gastar no carro?")).toEqual(GENERICO);
		expect(rotulos("Quanto cabe na parcela por mês?")).toEqual(GENERICO);
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

	it("o balão NÃO é reescrito (e não ganha atalho do servidor) numa pergunta aberta", () => {
		const texto = "Temos 4 cartas boas aqui. Qual delas combina com você?";
		const r = garantirChip({ texto, cardsDoTurno: [] });
		expect(r.texto).toBe(texto);
		expect(r.chip).toBeNull();
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
			// SAIDAS_DO_NOME esvaziado em develop: a pergunta de nome é resposta livre,
			// sem botão nenhum que empurre a pessoa a pular o contato.
			expect(sugestoesDaPergunta(fala), fala).toEqual([]);
			expect(rotulos(fala), fala).not.toContain("Pode seguir");
		}
	});

	it("pergunta do nome com carta na mesa: sem toque de abertura, toque que responde (finais 02 e 03)", () => {
		// final-02: depois do card de CPF/celular o agente perguntou o nome com "Vamos direto às
		// cartas" / "Depois eu te digo". final-03: a pergunta do nome vinha seguida de uma frase
		// afirmativa e o toque saía genérico ("Pode seguir" / "Tenho uma dúvida").
		for (const fala of [
			"Boa escolha, fechou! Pra gerar a proposta no seu nome, preciso do seu CPF e do seu celular com DDD.\n\nE como você se chama?",
			"Tentei duas vezes e a administradora não respondeu.\n\nQuer que eu tente de novo daqui a pouco?\n\nAh, e como você se chama? Assim eu já te chamo pelo nome.",
		]) {
			expect(rotulos(fala, { temCartaNaTela: true }), fala).toEqual([]);
			expect(rotulos(fala, { temCartaNaTela: true }), fala).not.toContain("Vamos direto às cartas");
			expect(rotulos(fala, { temCartaNaTela: true }), fala).not.toContain("Pode seguir");
		}
		// na abertura (sem carta): SAIDAS_DO_NOME esvaziado em develop — resposta livre.
		expect(rotulos("Antes de tudo, como você se chama?")).toEqual([]);
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

	it("a pergunta EXATA do print 13: envio pelo WhatsApp se responde 'Pode mandar' / 'Prefiro ver aqui'", () => {
		const fala = "Quer que eu te mande essas opções pelo WhatsApp para você ver com calma?";
		for (const temCartaNaTela of [true, false]) {
			expect(rotulos(fala, { temCartaNaTela }), String(temCartaNaTela)).toEqual([
				"Pode mandar",
				"Prefiro ver aqui",
			]);
		}
	});

	it("a alternativa de verdade continua sendo as duas escolhas (seguir × comparar)", () => {
		expect(
			rotulos("Quer seguir com essa, Kairo, ou prefere comparar outra opção?", {
				temCartaNaTela: true,
			}),
		).toEqual(["Quero seguir com essa", "Comparar outra opção"]);
	});

	it("a lista escrita no texto continua ganhando do momento (o balão fica INTEIRO — P11)", () => {
		const texto = "Pra quando você quer?\n1) Agora\n2) Nos próximos meses";
		const r = garantirChip({
			texto,
			cardsDoTurno: [],
		});
		// P11: a fala não é cortada; a lista fica no balão E no chip.
		expect(r.texto).toBe(texto);
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

	it("o turno entrega ao chip só os balões e os cards: o servidor não decide pelo momento (09/11)", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const fim = fonte.slice(
			fonte.indexOf("// O ÚNICO TOQUE DO TURNO"),
			fonte.indexOf('emitirCardsNovos("todos")'),
		);
		expect(fim).toContain("baloes: baloesDoTurno");
		expect(fim).not.toContain("categoriaDoBem");
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

	it("o TURNO de um balão só com pedido de dado NÃO ganha atalho do servidor (09/11)", () => {
		expect(chipDoTurno({ baloes: [BEAT_UNICO_COM_PERGUNTA], cardsDoTurno: [] })).toBeNull();
	});

	it("os VERBOS novos do pedido são reconhecidos em qualquer posição da frase", () => {
		for (const frase of [
			"Consegue me mandar o CPF aqui?",
			"Para seguir, vou precisar do seu CPF.",
			"Me confirma o CPF, por favor.",
		]) {
			const opcoes = rotulos(frase, { temCartaNaTela: true });
			expect(ehDoDado(opcoes[0] ?? ""), `${frase} → ${opcoes.join(" | ")}`).toBe(true);
		}
		// 04/11 (develop): o número se pede com o card `whatsapp_optin` — o toque do celular
		// é a escolha do modelo no card, não lista no código.
		// A fala que cita CPF E celular vem como pedido de CPF (o toque do CPF): o celular
		// entra pelo card `whatsapp_optin` na escolha do modelo.
		expect(
			rotulos("Pode mandar o CPF e o celular no chat.", { temCartaNaTela: true })[0],
		).toContain("CPF");
		expect(rotulos("Me envia o celular com DDD.", { temCartaNaTela: true })).toEqual(GENERICO);
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
			// O dado se pede com o card que coleta (`whatsapp_optin`/`contract_form`): o toque
			// do celular é escolha do modelo no card, não lista no código.
			expect(opcoes.length).toBeGreaterThanOrEqual(2);
			expect(opcoes).not.toContain("Quero essa");
			if (!ehDoDado(opcoes[0] ?? "")) expect(opcoes).toEqual(GENERICO);
			else expect(opcoes[0]).toContain("CPF");
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
			// O número se pede com o card `whatsapp_optin` (04/11): o toque fica por conta do
			// card que o modelo escolhe, não de lista no código.
			expect(r.opcoes).toEqual(GENERICO);
			expect(r.opcoes).not.toContain("Quero essa");
		}
	});

	it("'Se puder confirmar seu CPF e celular…' pede o CPF do cliente", () => {
		const r = sugestaoDoTurno(
			"Se puder confirmar seu CPF e celular, já gero a proposta pra você!",
			{
				temCartaNaTela: true,
				categoriaDoBem: "auto",
			},
		);
		expect(r.opcoes.join(" ").toLowerCase()).toContain("cpf");
	});

	it("mas 'me mostra os números do card' continua sendo o par de números", () => {
		const r = sugestaoDoTurno("Quer que eu te mostre os números do card?", {
			temCartaNaTela: true,
		});
		expect(r.opcoes).toEqual(["Quero ver os números", "Agora não"]);
	});
});

describe("(09/11) o servidor não adivinha atalho — só a opção escrita pelo modelo vira toque", () => {
	const aberta = [
		"Para que você está querendo trocar ou comprar esse carro?",
		"Qual é o valor do carro que você está pensando em comprar?",
		"Antes de eu te mostrar as opções, me passa seu WhatsApp?",
		"Qual é o seu CPF?",
		"Encontrei 4 opções na tela para um carro de R$ 90 mil.",
	];

	it("pergunta aberta, pedido de dado e turno sem pergunta ficam SEM atalho", () => {
		for (const texto of aberta) {
			expect(garantirChip({ texto, cardsDoTurno: [] }).chip, texto).toBeNull();
			expect(chipDoTurno({ baloes: [texto], cardsDoTurno: [] }), texto).toBeNull();
		}
	});

	it("a lista marcada e a alternativa escrita na fala continuam virando atalho", () => {
		const lista = "Para quando?\n1) Agora\n2) Nos próximos meses";
		expect(rotulosDoChip(garantirChip({ texto: lista, cardsDoTurno: [] }).chip)).toEqual([
			"Agora",
			"Nos próximos meses",
		]);
		expect(rotulosDoChip(chipDoTurno({ baloes: [lista], cardsDoTurno: [] }))).toEqual([
			"Agora",
			"Nos próximos meses",
		]);
	});
});
