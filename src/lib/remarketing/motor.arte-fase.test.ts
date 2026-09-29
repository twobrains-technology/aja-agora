// FIX-389 — a ARTE acompanha a COMUNICAÇÃO (chave e arte, a mesma entrada).
//
// A regra combinada é "arte só quando o bem é conhecido" (AJA-14, já coberto em
// `motor.test.ts`). O que o FIX-389 acrescenta é a LIGAÇÃO com a fase: com a
// comunicação por macro-fase, uma chave GENÉRICA (sem bem) não pode receber a
// arte do bem de ninguém. Aqui a chave e a arte nascem de `comunicacaoDoToque`,
// a mesma entrada — então não têm como divergir.

import { describe, expect, it } from "vitest";
import { ARTE_POR_OBJETIVO, comunicacaoDoToque, decidir, OBJETIVO_DESCONHECIDO } from "./motor";
import { type EstadoRegua, estadoInicial } from "./regua";

const INBOUND = new Date("2026-09-14T14:00:00Z");
/** 12h30 em Brasília — o instante exato do toque 01 (90 min de silêncio). */
const TOQUE_1 = new Date("2026-09-14T15:30:00Z");

function ativo(opcoes: Partial<Omit<EstadoRegua, "objetivo">> & { objetivo?: string } = {}) {
	return estadoInicial({ objetivo: "carro", ultimoInboundEm: INBOUND, ...opcoes });
}

const FASES = ["inicio", "viu_oferta", "fechamento"] as const;

describe("FIX-389 — a arte sai da MESMA comunicação que a chave", () => {
	it("nos três estados de fase, com bem conhecido: arte do bem e 1ª chave com o bem", () => {
		for (const fase of FASES) {
			const comunicacao = comunicacaoDoToque(fase, "moto");
			expect(comunicacao.fase).toBe(fase);
			expect(comunicacao.chaves[0]).toBe(`remarketing_${fase}_moto`);
			expect(comunicacao.arte).toBe("/kv/remarketing/oportunidade-moto.png");
		}
	});

	it("chave genérica NUNCA recebe arte de bem — nem por omissão", () => {
		for (const fase of FASES) {
			for (const semBem of [null, undefined, "", "  ", OBJETIVO_DESCONHECIDO, "caminhao"]) {
				const comunicacao = comunicacaoDoToque(fase, semBem);
				expect(comunicacao.chaves).toEqual([`remarketing_${fase}_generico`]);
				expect(comunicacao.arte).toBeNull();
			}
		}
	});

	it("a arte e a chave são o MESMO bem (o de moto não pega a arte do carro)", () => {
		expect(comunicacaoDoToque("inicio", "moto").arte).toBe(ARTE_POR_OBJETIVO.moto);
		expect(comunicacaoDoToque("inicio", "imovel").arte).toBe(ARTE_POR_OBJETIVO.imovel);
	});

	it("o turno de retomada usa a arte da comunicação (a fase não muda a arte)", () => {
		const estado = ativo({ objetivo: "moto" });
		for (const fase of FASES) {
			const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase });
			expect(decisao.acao).toEqual({
				tipo: "turno_de_retomada",
				passo: 1,
				arte: "/kv/remarketing/oportunidade-moto.png",
			});
		}
	});
});
