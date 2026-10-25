import { type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ofertaRetidaPeloTelefone, viuOferta } from "./sinais-do-funil";

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
});
