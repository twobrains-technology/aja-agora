import { describe, expect, it } from "vitest";
import {
	decideVisit,
	encodeVisitCookie,
	newVisitId,
	newVisitorId,
	parseVisitCookie,
	VISIT_WINDOW_MS,
} from "./visit-cookie";

const AGORA = 1_770_000_000_000;
const VISITA_ANTERIOR = "8f1c9c7e-4a2b-4d33-9f10-0f7d2a6b1c55";
const VISITA_NOVA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** A assinatura de um criativo qualquer — o que importa aqui é ela existir ou não. */
const CRIATIVO = "1abc23d";

function decidir(rawCookie: string | null, veioDeAnuncio: boolean, nowMs = AGORA) {
	return decideVisit({
		rawCookie,
		assinaturaDaCampanha: veioDeAnuncio ? CRIATIVO : null,
		nowMs,
		newId: () => VISITA_NOVA,
	});
}

describe("parseVisitCookie", () => {
	it("faz o ciclo completo de ida e volta", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA);

		expect(parseVisitCookie(cookie)).toEqual({
			visitId: VISITA_ANTERIOR,
			atMs: AGORA,
			assinatura: null,
		});
	});

	it("rejeita cookie corrompido, adulterado ou de formato antigo", () => {
		expect(parseVisitCookie(null)).toBeNull();
		expect(parseVisitCookie("")).toBeNull();
		expect(parseVisitCookie("sem-ponto")).toBeNull();
		expect(parseVisitCookie(`${VISITA_ANTERIOR}.abc`)).toBeNull();
		expect(parseVisitCookie("nao-e-uuid.1770000000000")).toBeNull();
		// Timestamp negativo ou fora de faixa não vira visita válida.
		expect(parseVisitCookie(`${VISITA_ANTERIOR}.-5`)).toBeNull();
	});
});

describe("decideVisit", () => {
	it("abre visita nova quando o visitante chega sem cookie", () => {
		expect(decidir(null, false)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("abre visita nova quando o cookie está corrompido", () => {
		expect(decidir("lixo", false)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("reaproveita a visita corrente num refresh dentro da janela", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 5 * 60 * 1000);

		expect(decidir(cookie, false)).toMatchObject({ visitId: VISITA_ANTERIOR, isNew: false });
	});

	it("desliza a janela a cada passagem — sessão longa não vira duas visitas", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 5 * 60 * 1000);

		const { cookieValue } = decidir(cookie, false);

		expect(parseVisitCookie(cookieValue)).toEqual({
			visitId: VISITA_ANTERIOR,
			atMs: AGORA,
			assinatura: null,
		});
	});

	it("abre visita nova quando a anterior passou da janela", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - VISIT_WINDOW_MS - 1);

		expect(decidir(cookie, false)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("abre visita nova quando o visitante volta por um anúncio, mesmo dentro da janela", () => {
		// Clicar num anúncio é chegada nova: se herdasse a visita anterior, o
		// criativo que trouxe a pessoa de volta ficaria sem crédito nenhum. Desde
		// 24/08/2026 o que se compara é QUAL criativo — aqui a visita corrente não
		// tem assinatura nenhuma, então o anúncio é sempre um criativo novo. O caso
		// do MESMO criativo repetido mora em `visita-por-criativo.test.ts`.
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000);

		expect(decidir(cookie, true)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("carimba o cookie com a visita decidida", () => {
		const { visitId, cookieValue } = decidir(null, true);

		expect(parseVisitCookie(cookieValue)).toEqual({
			visitId,
			atMs: AGORA,
			assinatura: CRIATIVO,
		});
	});
});

describe("geradores de identificador", () => {
	it("gera visitorId no formato aceito por identityFromCookie (32 hex)", () => {
		// identityFromCookie valida /^[a-f0-9]{16,64}$/ — sair desse formato
		// quebraria a memória do agente pra todo visitante novo.
		expect(newVisitorId()).toMatch(/^[a-f0-9]{32}$/);
	});

	it("gera visitorId diferente a cada chamada", () => {
		expect(newVisitorId()).not.toBe(newVisitorId());
	});

	it("gera visitId em formato UUID — a coluna do banco é uuid", () => {
		expect(newVisitId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});
});
