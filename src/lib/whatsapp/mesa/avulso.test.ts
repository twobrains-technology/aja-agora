import { afterEach, describe, expect, it } from "vitest";
import {
	type AdministradoraRef,
	clearAvulsoSessions,
	getAvulsoSession,
	resolveAdministradora,
	setAvulsoSession,
} from "./avulso";

const ADMINS: AdministradoraRef[] = [
	{ id: "a1", nome: "Canopus", slug: "canopus" },
	{ id: "a2", nome: "Embracon", slug: "embracon" },
	{ id: "a3", nome: "Porto Seguro", slug: "porto-seguro" },
	{ id: "a4", nome: "Canopus Prime", slug: "canopus-prime" },
];

afterEach(() => clearAvulsoSessions());

describe("resolveAdministradora — ancora no allowlist (nunca inventa)", () => {
	it("casa pelo nome citado no texto, ignorando caixa e acento", () => {
		expect(resolveAdministradora("como faço o boleto na EMBRACON?", ADMINS)?.id).toBe("a2");
		expect(resolveAdministradora("procedimento da pôrto seguro aí", ADMINS)?.id).toBe("a3");
	});

	it("havendo dois matches, vence o de nome mais LONGO (desambigua)", () => {
		// "Canopus Prime" contém "Canopus" — o texto que cita o nome completo casa o mais longo.
		expect(resolveAdministradora("como emito na Canopus Prime?", ADMINS)?.id).toBe("a4");
		// texto que só cita "Canopus" casa a curta.
		expect(resolveAdministradora("dúvida na Canopus", ADMINS)?.id).toBe("a1");
	});

	it("texto sem nenhuma administradora citada → null (não chuta)", () => {
		expect(resolveAdministradora("como faço o cadastro do cliente?", ADMINS)).toBeNull();
		expect(resolveAdministradora("qual administradora devo usar?", ADMINS)).toBeNull();
	});

	it("nome curto (< 4 chars) não dispara falso positivo", () => {
		expect(resolveAdministradora("oi tudo bem", [{ id: "x", nome: "AB", slug: "ab" }])).toBeNull();
	});
});

describe("sessão avulsa in-memory — continuidade + TTL", () => {
	it("grava e recupera a sessão do atendente", () => {
		setAvulsoSession("5562999990000", {
			administradoraId: "a2",
			administradoraNome: "Embracon",
			history: [{ role: "attendant", content: "como faço?" }],
		});
		const s = getAvulsoSession("5562999990000");
		expect(s?.administradoraId).toBe("a2");
		expect(s?.history).toHaveLength(1);
	});

	it("telefone sem sessão → null", () => {
		expect(getAvulsoSession("5562000000000")).toBeNull();
	});

	it("clearAvulsoSessions zera tudo (isolamento de teste)", () => {
		setAvulsoSession("p", { administradoraId: "a1", administradoraNome: "Canopus", history: [] });
		clearAvulsoSessions();
		expect(getAvulsoSession("p")).toBeNull();
	});
});
