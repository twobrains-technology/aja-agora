/**
 * O detector de "o agente pediu o nome" — e o buraco que ele tinha.
 *
 * ── O que este detector é, e o que ele NÃO é ────────────────────────────────
 *
 * Isto **não** é um guard sobre a fala do agente. Não suprime nada, não censura
 * frase, não decide o que o cliente lê. É um sinal de COORDENAÇÃO entre as duas
 * metades do mesmo turno: o texto que o modelo escreveu e o card que o servidor
 * vai (ou não vai) pendurar embaixo dele. Os dois consumidores:
 *
 *   `deveEmitirCardDeNome` (emit-card.ts) — o agente que pergunta o imóvel não
 *      pode receber embaixo um campo pedindo o nome;
 *   `captureAnswerNode` (capture.ts) — a resposta curta do cliente só é lida
 *      como nome se a pergunta anterior era sobre nome.
 *
 * ── O buraco, visto ao vivo em 31/08/2026 ───────────────────────────────────
 *
 * O agente perguntou, em produção local:
 *
 *   "Perfeito! R$ 80 mil é um bom orçamento para um carro legal.
 *    Qual é o seu PRIMEIRO nome, pra eu poder te chamar?"
 *
 * O cliente respondeu "Marina". O agente respondeu "Prazer, Marina!" — e o
 * servidor, embaixo, emitiu o card "Como posso te chamar?". Pedindo de novo o
 * que a pessoa acabava de dizer, no gate mais frágil do funil.
 *
 * A causa: os padrões exigiam `seu nome` ADJACENTE (`/(seu|teu)\s+nome/`), e
 * "seu primeiro nome" tem uma palavra no meio. `"Qual é o seu nome?"` passava;
 * a variação mais natural que o modelo escreve, não.
 *
 * ── Por que a correção é uma FOLGA e não mais um padrão ─────────────────────
 *
 * Acrescentar `/seu primeiro nome/` à lista resolveria este caso e falharia no
 * seguinte ("seu nome completo", "teu nome de batismo"). O CLAUDE.md nomeia
 * esse anti-padrão: não se fecha porta a porta, fecha-se a parede. A parede
 * aqui é aceitar até duas palavras entre o possessivo e "nome" — a forma da
 * pergunta, não uma de suas instâncias.
 *
 * O limite conhecido fica registrado nos casos negativos abaixo: o detector
 * continua sendo texto, e "vou te chamar quando as ofertas saírem" NÃO pode
 * virar pedido de nome — seria pior que o defeito que ele conserta.
 */

import { describe, expect, it } from "vitest";
import { pediuONomeExplicitamente, perguntouONome } from "./detect-name-turn";

describe("o agente pediu o nome", () => {
	it.each([
		"Qual é o seu primeiro nome, pra eu poder te chamar?",
		"Perfeito! R$ 80 mil é um bom orçamento. Qual é o seu primeiro nome, pra eu poder te chamar?",
		"Qual seu nome completo?",
		"Me diz teu primeiro nome?",
	])("reconhece a folga entre o possessivo e 'nome': %s", (fala) => {
		expect(perguntouONome(fala)).toBe(true);
	});

	it.each([
		"Qual é o seu nome?",
		"Como posso te chamar?",
		"Como prefere ser chamado?",
		"Como você se chama?",
	])("o que já funcionava continua funcionando: %s", (fala) => {
		expect(perguntouONome(fala)).toBe(true);
	});
});

describe("o agente NÃO pediu o nome", () => {
	it.each([
		"Prefere sedã ou SUV?",
		"Vou te chamar assim que as ofertas saírem.",
		"Esse grupo tem nome de fantasia diferente na administradora.",
		"Qual valor do bem você tem em mente?",
		"",
	])("não confunde com: %s", (fala) => {
		expect(perguntouONome(fala)).toBe(false);
	});

	// ── Os cinco que a revisão crítica levantou (31/08/2026) ────────────────
	//
	// Levantados quando este predicado deixou de decidir só a APARIÇÃO DE UM CARD
	// e passou a autorizar a ESCRITA de `contactName`. A observação é justa: com
	// falso positivo custando zero, a folga larga era aceitável; autorizando
	// escrita, cada um destes batizaria o lead com a próxima palavra curta.
	//
	// São todas frases plausíveis de consórcio, e nenhuma é pergunta de nome —
	// o que muda o predicado: ele deixou de procurar "seu … nome" em qualquer
	// posição e passou a exigir a FORMA INTERROGATIVA antes ("qual", "como",
	// "me diz"). É mais estreito que a versão anterior, não mais largo.
	it.each([
		"No seu caso o nome da administradora aparece no contrato.",
		"Vou deixar o seu plano no nome da Embracon, tudo bem?",
		"A carta sai no seu próprio nome, não no da administradora.",
		"Confirmando: o seu novo nome de usuário no portal.",
		"Esse é o seu grupo, o nome dele é 1042.",
	])("afirmação com 'seu … nome' não AUTORIZA escrita: %s", (fala) => {
		// Contra o predicado ESTREITO, que é o que autoriza `contactName`. O largo
		// pode reconhecê-las — ver a tabela dos dois predicados, no fim do arquivo.
		expect(pediuONomeExplicitamente(fala)).toBe(false);
	});

	it("a folga não atravessa a frase inteira", () => {
		// Sem limite de palavras, um "seu" no começo e um "nome" seis palavras
		// depois casariam — e aí qualquer fala com as duas palavras viraria pedido
		// de nome.
		expect(
			perguntouONome("Esse é o seu grupo, com a taxa mais baixa que achei em nome da Bevi"),
		).toBe(false);
	});
});

// ── DOIS predicados, porque são dois riscos assimétricos ────────────────────
//
// Levantado na revisão crítica de 31/08/2026, depois de eu ter colapsado os
// dois num só e trocado cinco falsos positivos por cinco falsos NEGATIVOS.
//
// O predicado tem três consumidores, e o custo do erro é oposto entre eles:
//
//   `deveEmitirCardDeNome` (emit-card)  — falso positivo custa ZERO; falso
//   `isLikelyNameResponse` (orchestr.)    negativo custa a pergunta de nome em
//                                         dobro, que é o caso do FIX-379;
//
//   `captureAnswerNode` (capture)       — falso positivo custa um LEAD com nome
//                                         errado chegando à mesa.
//
// Um predicado só não serve aos dois. O largo dirige a decisão de tela; o
// estreito autoriza a escrita. A tabela abaixo é a régua: nenhuma frase pode
// mudar de lado sem alguém ver.
describe("os dois predicados, lado a lado", () => {
	const PEDIDOS_CLAROS = [
		"Como posso te chamar?",
		"Qual é o seu primeiro nome, pra eu poder te chamar?",
		"Pode me dizer seu nome?",
	];

	// Pedidos SEM forma interrogativa antes do possessivo. O largo os reconhece;
	// o estreito não — e é justamente por isso que o estreito não decide tela.
	const PEDIDOS_SEM_INTERROGATIVO = [
		"Seu nome?",
		"Preciso do seu nome pra seguir com a busca",
		"Me passa seu nome?",
		"E o seu nome, qual é?",
		"Antes de buscar as ofertas: seu nome?",
	];

	// Afirmações de consórcio que contêm "seu … nome". Nenhum dos dois pode
	// tratá-las como pedido — no estreito porque autorizaria escrita, no largo
	// porque o card sumiria quando devia aparecer.
	const AFIRMACOES = [
		"No seu caso o nome da administradora aparece no contrato.",
		"Vou deixar o seu plano no nome da Embracon, tudo bem?",
		"A carta sai no seu próprio nome, não no da administradora.",
		"Confirmando: o seu novo nome de usuário no portal.",
		"Esse é o seu grupo, o nome dele é 1042.",
	];

	it.each(PEDIDOS_CLAROS)("os dois reconhecem o pedido claro: %s", (fala) => {
		expect(perguntouONome(fala)).toBe(true);
		expect(pediuONomeExplicitamente(fala)).toBe(true);
	});

	it.each(PEDIDOS_SEM_INTERROGATIVO)(
		"o LARGO reconhece, o estreito não — e a tela é do largo: %s",
		(fala) => {
			// Sem isto, o card não cede a vez e a pessoa lê duas perguntas de nome
			// no mesmo balão (FIX-379). Era a cobertura que a base tinha e o
			// estreitamento tirou.
			expect(perguntouONome(fala)).toBe(true);
			expect(pediuONomeExplicitamente(fala)).toBe(false);
		},
	);

	it.each(AFIRMACOES)("o ESTREITO recusa a afirmação — é ele que autoriza escrita: %s", (fala) => {
		expect(pediuONomeExplicitamente(fala)).toBe(false);
	});

	it("o largo reconhece algumas afirmações, e isso é aceito de propósito", () => {
		// A folga faz "Vou deixar o seu plano no nome da Embracon" casar no largo.
		// Fica assim porque o custo é desprezível: o largo só decide se o card do
		// nome sai JUNTO com a fala, e ele só é consultado quando o gate já é
		// `name` — situação em que o card apareceria de qualquer jeito
		// (`deveEmitirCardDeNome` devolve true quando o modelo não perguntou nada).
		//
		// O que NÃO pode acontecer é uma dessas autorizar escrita, e o caso acima
		// trava isso. Este aqui existe para o comportamento ficar declarado em vez
		// de descoberto: se um dia o largo passar a alimentar escrita, o teste de
		// subconjunto abaixo continua verde e ESTE é o que conta a história.
		expect(perguntouONome("Vou deixar o seu plano no nome da Embracon, tudo bem?")).toBe(true);
	});

	it("o estreito é subconjunto do largo — nunca autoriza o que a tela nem viu", () => {
		for (const fala of [...PEDIDOS_CLAROS, ...PEDIDOS_SEM_INTERROGATIVO, ...AFIRMACOES]) {
			if (pediuONomeExplicitamente(fala)) {
				expect(perguntouONome(fala), `"${fala}" autoriza escrita sem ser pedido`).toBe(true);
			}
		}
	});
});
