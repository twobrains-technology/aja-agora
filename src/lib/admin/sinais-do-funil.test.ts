import { type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { conversaIdentificada, ofertaRetidaPeloTelefone, viuOferta } from "./sinais-do-funil";

/** Drizzle 0.45 não expõe `.sql`; o texto mora em `queryChunks`. Renderizar é o que
 * permite o teste de ACOPLAGEM: a pergunta "esta pessoa viu número de oferta?" é a
 * MESMA no funil, no Percurso, na exportação e na régua. Se `viuOferta` deixar de
 * negar a oferta retida, cada tela volta a contar um número que o cliente nunca leu. */
function texto(c: unknown): string {
	if (typeof c === "string") return c;
	if (c && typeof c === "object" && "queryChunks" in c) {
		return (c as SQL).queryChunks.map(texto).join("");
	}
	if (c && typeof c === "object" && "value" in c) return String((c as { value: unknown }).value);
	return "";
}

describe("viu oferta — a oferta retida pelo telefone não conta", () => {
	it("negar a oferta retida faz parte da definição de viuOferta", () => {
		const q = texto(viuOferta(sql`c`));
		expect(q).toContain("NOT");
		expect(q).toContain("desbloqueadoEm");
		expect(q).toContain("EXISTS");
	});

	it("a retenção é só na WEB (no WhatsApp o telefone é o waId e não há card)", () => {
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		expect(q).toContain("channel = 'web'");
		expect(q).toContain("'A', 'B'");
		expect(q).toContain("telefoneDoDesbloqueio");
	});

	it("web livre não é retida: sem variante registrada o COALESCE cai em '' e o IN não casa", () => {
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		expect(q).toContain("COALESCE");
		expect(q).toContain("IS NULL");
	});

	// N01 — o vendedor livre (2026-10-20) mostra a carta antes de pedir qualquer
	// dado, e a fila do experimento continua sorteando o braço. Sem esta âncora, o
	// guard apagava do funil toda oferta legível do motor novo: variante A/B
	// registrada, nenhum `desbloqueadoEm`, e nada retido.
	it("só desconta quando a trava ESTAVA de pé — o card do telefone é a âncora", () => {
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		expect(q).toContain("telefone_do_desbloqueio");
		// O card é o ÚLTIMO termo da conjunção: sem ele nada foi retido.
		expect(q.trimEnd().endsWith(")")).toBe(true);
		expect(q.indexOf("telefone_do_desbloqueio")).toBeGreaterThan(q.indexOf("desbloqueadoEm"));
	});

	it("a conversa nova — braço sorteado, oferta legível — NÃO casa com a retenção", () => {
		// A forma da conversa que o motor livre produz: o card de oferta aparece, o
		// do telefone nunca sai. O SQL acima exige o card do telefone, então a
		// oferta conta. Garantia de expressão: o guard não pode voltar a depender
		// SÓ de variante + desbloqueadoEm.
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		const termos = q.split("AND").filter((termo) => termo.includes("EXISTS"));
		expect(termos).toHaveLength(1);
	});
});

describe("conversa identificada — a coleta da web em TODOS os caminhos", () => {
	// L05 — `attachContact` (identidade cifrada da conversa) NÃO escreve
	// `leads.phone`. Lendo só o lead, toda pessoa que se identificou pelo vendedor
	// livre contava como anônima no funil, no Percurso, na exportação e em Campanhas.
	it("conta o contato unificado da conversa e o fato de a identidade ter sido coletada", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).toContain("contact_id IS NOT NULL");
		expect(q).toContain("identityCollected");
	});

	it("o caminho antigo (telefone/e-mail no lead) continua contando", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).toContain("li.phone IS NOT NULL");
		expect(q).toContain("li.email IS NOT NULL");
	});

	it("WhatsApp continua identificado pelo canal", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).toContain("wa_id");
	});
});
