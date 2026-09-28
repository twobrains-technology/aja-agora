// A FORMA DO ENVIO — como o último toque saiu (FIX-380).
//
// Teste PURO, sem banco e sem rede: a evidência entra montada (é o que a
// `remarketing-queries.ts` extrai) e a derivação sai daqui. Os três estados da
// pergunta do dono — "turno de retomada" (texto livre), "template aguardando" e
// "template aprovado" — mais o caso sem rastro, que NUNCA pode virar "texto
// livre" por omissão.

import { describe, expect, it } from "vitest";
import { type EvidenciaDaForma, formaDoEnvio, type LinhaBruta } from "./remarketing-tela";

const TOQUE = new Date("2026-09-10T13:00:00Z");

function linha(parcial: Partial<LinhaBruta> = {}): LinhaBruta {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		nome: "Marina",
		telefoneMascarado: null,
		objetivo: "carro",
		step: 1,
		status: "ATIVO",
		motivoSaida: null,
		nextTouchAt: null,
		ultimoToqueEm: TOQUE,
		touches30d: 1,
		criadoEm: new Date("2026-09-09T13:00:00Z"),
		ultimoInboundEm: null,
		optoutDaPessoaEm: null,
		converteuEm: null,
		rastro: null,
		evidenciaDaForma: semRastro(),
		...parcial,
	};
}

function semRastro(parcial: Partial<EvidenciaDaForma> = {}): EvidenciaDaForma {
	return {
		houveFalaDoAgente: false,
		nomeDoTemplateNaMensagem: null,
		naFila: null,
		templateAprovado: null,
		...parcial,
	};
}

describe("formaDoEnvio — os três estados da pergunta 'e como que foi?'", () => {
	it("turno de retomada (o agente falou) é texto livre", () => {
		const forma = formaDoEnvio(linha({ evidenciaDaForma: semRastro({ houveFalaDoAgente: true }) }));

		expect(forma?.tipo).toBe("texto_livre");
		expect(forma?.rotulo).toBe("Texto livre");
		expect(forma?.nomeDoTemplate).toBeNull();
	});

	it("toque que entrou na fila é template aguardando, com o nome quando houver", () => {
		const forma = formaDoEnvio(
			linha({
				evidenciaDaForma: semRastro({
					naFila: { status: "pending", nomeDoTemplate: "aja_remarketing_oportunidade_carro" },
				}),
			}),
		);

		expect(forma?.tipo).toBe("template_aguardando");
		expect(forma?.rotulo).toBe("Template aguardando");
		expect(forma?.nomeDoTemplate).toBe("aja_remarketing_oportunidade_carro");
	});

	it("fila já despachada é template, com o nome", () => {
		const forma = formaDoEnvio(
			linha({
				evidenciaDaForma: semRastro({
					naFila: { status: "sent", nomeDoTemplate: "aja_remarketing_oportunidade_moto" },
				}),
			}),
		);

		expect(forma?.tipo).toBe("template");
		expect(forma?.nomeDoTemplate).toBe("aja_remarketing_oportunidade_moto");
	});

	it("template aprovado do bem, sem fila e sem fala do agente, é template com o nome", () => {
		const forma = formaDoEnvio(
			linha({
				evidenciaDaForma: semRastro({ templateAprovado: "aja_remarketing_oportunidade_imovel" }),
			}),
		);

		expect(forma?.tipo).toBe("template");
		expect(forma?.nomeDoTemplate).toBe("aja_remarketing_oportunidade_imovel");
	});

	it("o template_name da mensagem nomeia o template mesmo sem fila", () => {
		const forma = formaDoEnvio(
			linha({
				evidenciaDaForma: semRastro({
					houveFalaDoAgente: true,
					nomeDoTemplateNaMensagem: "aja_agora_atendente_retomada",
				}),
			}),
		);

		expect(forma?.tipo).toBe("template");
		expect(forma?.nomeDoTemplate).toBe("aja_agora_atendente_retomada");
	});
});

describe("formaDoEnvio — o que NÃO pode ser inventado", () => {
	it("passo 0 não tem forma: nenhum toque saiu ainda", () => {
		expect(formaDoEnvio(linha({ step: 0 }))).toBeNull();
	});

	it("sem rastro no banco a forma é 'não registrado' — nunca 'texto livre' por omissão", () => {
		expect(formaDoEnvio(linha())?.tipo).toBe("nao_registrado");
		expect(formaDoEnvio(linha())?.rotulo).toBe("Não registrado");
	});

	it("linha sem evidência nenhuma (histórico) também não vira texto livre", () => {
		expect(formaDoEnvio(linha({ evidenciaDaForma: null }))?.tipo).toBe("nao_registrado");
	});

	it("a fila vence a fala: um toque que ficou na fila não saiu como texto livre", () => {
		const forma = formaDoEnvio(
			linha({
				evidenciaDaForma: semRastro({
					houveFalaDoAgente: true,
					naFila: { status: "pending", nomeDoTemplate: null },
				}),
			}),
		);

		expect(forma?.tipo).toBe("template_aguardando");
		expect(forma?.nomeDoTemplate).toBeNull();
	});

	it("toda forma traz a explicação em português, para o operador", () => {
		expect(formaDoEnvio(linha())?.explicacao).toMatch(/sem rastro/i);
		expect(
			formaDoEnvio(linha({ evidenciaDaForma: semRastro({ houveFalaDoAgente: true }) }))?.explicacao,
		).toMatch(/janela/i);
	});
});
