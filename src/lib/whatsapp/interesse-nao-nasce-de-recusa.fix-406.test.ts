// FIX-406 — a vírgula, de novo, e desta vez no canal de maior volume.
//
// A 8ª revisão independente achou `"Itaú, não obrigado"` ancorando o Itaú: uma
// exceção de vírgula que eu mesmo tinha introduzido fazia a recusa perder o
// vínculo com a marca ao lado. Corrigi ali e varri as irmãs DENTRO do grafo.
// Esta é a irmã que estava FORA dele.
//
// `isInterestExpression` (whatsapp/proxy.ts) fatia a frase por
// `[,;.!?]` e aceita se QUALQUER pedaço, sozinho, casar com a lista de
// interesse. Cada pedaço é testado com âncora (`^…$`), o que protege bem o caso
// colado — "não quero fechar" não casa, porque o "não" está dentro do mesmo
// segmento. Mas basta a vírgula para o "não" virar um segmento SEPARADO, e o que
// sobra é um "quero fechar" limpo:
//
//   "não, quero fechar"  →  ["não", "quero fechar"]  →  casa
//
// E o que este ramo faz não é registrar um flag: ele chama
// `buildAdvanceToContractDirective` direto, fora do grafo. O cliente que escreve
// uma recusa recebe o fluxo de contrato.
//
// ⚠️ Por que isto importa mais que os oito achados anteriores juntos: o WhatsApp
// é onde está o volume de vendas, este atalho NÃO passa pelo grafo (é
// determinístico de propósito) e portanto nenhuma das travas construídas lá
// dentro — o veto de recusa do FIX-405, a regra de rebaixamento do FIX-399d, o
// gate de decisão — chega até aqui. É a mesma classe de defeito, no lugar onde
// ela custa mais caro.
//
// A correção reusa o primitivo que já existe para isto (`detectYesNoText`, que
// carrega a regra de rebaixamento por oração) em vez de escrever uma nona regex:
// duas cópias da mesma heurística sempre divergem, e foi assim que o `yes-no`
// duplicado no grafo ficou para trás (ver `advance.ts:17`).
import { describe, expect, it } from "vitest";
import { isInterestExpression } from "./proxy";

describe("FIX-406 — recusa não vira expressão de interesse no WhatsApp", () => {
	it.each([
		// O achado: a vírgula isola o "não" e o resto passa limpo.
		"não, quero fechar",
		"não, bora fechar",
		"não, topo",
		"não obrigado, quero fechar",
		// Variações da mesma família, com a adversativa no lugar da vírgula.
		"não quero, mas quero fechar",
		// Recusa educada seguida do verbo — o padrão de chat mais comum.
		"agora não, quero fechar depois",
	])("recusa não dispara o fluxo de contrato: %s", (fala) => {
		expect(isInterestExpression(fala), fala).toBe(false);
	});

	it.each([
		// A metade que impede o fix de virar "nunca fecha". Cada uma destas é uma
		// frase real de fechamento — se alguma virar `false`, a venda morre no
		// canal de maior volume, que é um defeito PIOR que o que estamos corrigindo.
		"quero fechar",
		"bora fechar",
		"tenho interesse",
		"fechado",
		"topei",
		"vamos fechar",
		// Do dossiê de QA (FIX-336): interesse em segmento, não no começo da frase.
		"bora, tenho interesse",
		"tenho interesse, quero fechar",
	])("fechamento legítimo continua passando: %s", (fala) => {
		expect(isInterestExpression(fala), fala).toBe(true);
	});

	it("segue rejeitando o falso-positivo que a âncora sempre protegeu (FIX-336)", () => {
		// "tenho interesse em saber sobre lance" é curiosidade, não fechamento — é
		// o caso que motivou a âncora `^…$` por segmento. A correção da recusa não
		// pode custar esta proteção.
		expect(isInterestExpression("tenho interesse em saber sobre lance")).toBe(false);
	});
});
