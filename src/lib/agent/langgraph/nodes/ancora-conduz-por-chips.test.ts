/**
 * A âncora também conduz por CHIPS, não só por texto.
 *
 * No turno em que as cartas aparecem, o funil suprime o gate de propósito: quem
 * fecha o turno é a âncora — a frase que convida o cliente a reagir ao que está
 * vendo. E existe uma rede: se a âncora NÃO entregar nada, o gate volta, para o
 * cliente não ficar diante dos cards sem nada a responder (sessão `ff8f2080`).
 *
 * O defeito é que "entregar" era medido só em caracteres de texto. Quando o
 * modelo ancora com um `quick_reply` — "Folga no bolso" / "Contemplar mais
 * rápido", que é condução perfeitamente boa e uma escolha comum dele —, o texto
 * não cresce, a rede conclui "âncora falhou" e reabre o gate. Resultado visto ao
 * vivo numa revisão adversarial:
 *
 *   [card] comparison_table — 4 cotas
 *   [card] quick_reply — "Folga no bolso" / "Contemplação mais rápida"
 *   [gate] chips — "Você já fez consórcio antes?"
 *
 * Duas perguntas, cinco botões, um turno — exatamente a classe FIX-424 que a
 * entrega dizia ter fechado para a tabela. E não é intermitente: dado que o
 * modelo escolha chips em vez de frase, acontece sempre.
 */
import { describe, expect, it } from "vitest";
import { ancoraEntregouAlgo } from "./converse";

describe("ancoraEntregouAlgo", () => {
	it("texto novo conta como condução", () => {
		expect(ancoraEntregouAlgo({ charsAntes: 10, charsDepois: 80, artifactsDoBeat: [] })).toBe(true);
	});

	it("CHIPS contam como condução, mesmo sem uma letra nova", () => {
		// O caso do defeito. O cliente tem o que responder — é o card que pergunta.
		expect(
			ancoraEntregouAlgo({ charsAntes: 40, charsDepois: 40, artifactsDoBeat: ["quick_reply"] }),
		).toBe(true);
	});

	it("silêncio TOTAL não conta — a rede tem que continuar existindo", () => {
		// Sem texto e sem card, o cliente fica olhando as cartas sem nada a fazer.
		// É por isso que a rede existe, e ela não pode ser desativada por engano.
		expect(ancoraEntregouAlgo({ charsAntes: 40, charsDepois: 40, artifactsDoBeat: [] })).toBe(
			false,
		);
	});

	it("card que NÃO pede resposta não substitui a condução", () => {
		// Um card informativo não é uma pergunta: o turno continua mudo do ponto de
		// vista de "o que o cliente faz agora?".
		expect(
			ancoraEntregouAlgo({
				charsAntes: 40,
				charsDepois: 40,
				artifactsDoBeat: ["comparison_table"],
			}),
		).toBe(false);
	});

	it("outros cards interativos também contam (opt-in, dial, embutido)", () => {
		for (const card of ["whatsapp_optin", "contemplation_dial", "embedded_bid"]) {
			expect(
				ancoraEntregouAlgo({ charsAntes: 40, charsDepois: 40, artifactsDoBeat: [card] }),
				`${card} pede resposta do cliente`,
			).toBe(true);
		}
	});

	it("cards INFORMATIVOS continuam não contando", () => {
		// O critério é interação, não presença de card. Se afrouxar aqui, a rede
		// deixa de cobrir o turno em que nada chega ao cliente.
		for (const card of [
			"comparison_table",
			"simulation_result",
			"recommendation_card",
			"scarcity",
		]) {
			expect(
				ancoraEntregouAlgo({ charsAntes: 40, charsDepois: 40, artifactsDoBeat: [card] }),
				`${card} é informativo`,
			).toBe(false);
		}
	});

	it("sem âncora tentada, não há falha a declarar", () => {
		expect(ancoraEntregouAlgo({ charsAntes: null, charsDepois: 0, artifactsDoBeat: [] })).toBe(
			true,
		);
	});
});
