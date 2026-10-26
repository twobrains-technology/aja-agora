import { type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	conversaIdentificada,
	ofertaNoTurnoRetido,
	ofertaRetidaPeloTelefone,
	viuOferta,
} from "./sinais-do-funil";

/** Drizzle 0.45 não expõe `.sql`; o texto mora em `queryChunks`. Renderizar é o que
 * permite o teste de ACOPLAGEM: a pergunta "esta pessoa viu número de oferta?" é a
 * MESMA no funil, no Percurso, na exportação e na régua. Se `viuOferta` deixar de
 * negar a oferta retida, cada tela volta a contar um número que o cliente nunca leu.
 * A POPULAÇÃO resultante (quem entra e quem fica fora) é provada contra o banco em
 * `sinais-do-funil.populacao.test.ts`. */
function texto(c: unknown): string {
	if (typeof c === "string") return c;
	if (c && typeof c === "object" && "queryChunks" in c) {
		return (c as SQL).queryChunks.map(texto).join("");
	}
	if (c && typeof c === "object" && "value" in c) return String((c as { value: unknown }).value);
	return "";
}

describe("viu oferta — a oferta retida pelo telefone não conta", () => {
	it("a retenção é perguntada POR OFERTA dentro do EXISTS de viuOferta", () => {
		// P208/P280/P322 — com `EXISTS … AND NOT <retenção da conversa>` a conversa
		// antiga com card de telefone ficava retida para sempre, e a oferta legível
		// emitida depois não contava em tela nenhuma.
		const q = texto(viuOferta(sql`c`));
		expect(q).toContain(texto(ofertaNoTurnoRetido(sql`c`, sql`m`)));
		expect(q).toContain("NOT");
		expect(q).toContain("EXISTS");
	});

	it("a retenção é só na WEB (no WhatsApp o telefone é o waId e não há card)", () => {
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		expect(q).toContain("channel = 'web'");
		expect(q).toContain("'A', 'B'");
		// A âncora do card saiu daqui: ela é do TURNO da oferta, não da conversa.
		expect(q).not.toContain("telefone_do_desbloqueio");
	});

	it("web livre não é retida: sem variante registrada o COALESCE cai em '' e o IN não casa", () => {
		const q = texto(ofertaRetidaPeloTelefone(sql`c`));
		expect(q).toContain("COALESCE");
		expect(q).toContain("IS NULL");
	});

	// N01 — o vendedor livre (2026-10-20) mostra a carta antes de pedir qualquer
	// dado, e a fila do experimento continua sorteando o braço. Sem a âncora do
	// card, o guard apagava do funil toda oferta legível do motor novo.
	it("só desconta quando a trava ESTAVA de pé — o card do telefone é a âncora", () => {
		const q = texto(ofertaNoTurnoRetido(sql`c`, sql`m`));
		expect(q).toContain("telefone_do_desbloqueio");
		expect(q).toContain(texto(ofertaRetidaPeloTelefone(sql`c`)));
	});

	it("o turno é delimitado pela fala do CLIENTE, e a comparação é simétrica", () => {
		// O `persist` grava a oferta e o adapter grava o card DEPOIS, no mesmo turno.
		// Exigir "card antes da oferta" deixaria a oferta retida antiga contando.
		const q = texto(ofertaNoTurnoRetido(sql`c`, sql`m`));
		expect(q).toContain("LEAST");
		expect(q).toContain("GREATEST");
		expect(q).toContain("role = 'user'");
	});
});

describe("conversa identificada — a coleta da web em TODOS os caminhos", () => {
	// P048/P061/P206/L05 — "identificado" é contato ALCANÇÁVEL. `contact_id` e
	// `identityCollected` ligam com o CPF sozinho (o contato nasce e a flag sobe
	// antes do celular), e o degrau contava quem o time não consegue chamar.
	it("não conta contato unificado nem a flag de identidade: CPF isolado não é contato", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).not.toContain("contact_id");
		expect(q).not.toContain("identityCollected");
	});

	it("o telefone/e-mail do lead — o alcançável — continua contando", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).toContain("li.phone IS NOT NULL");
		expect(q).toContain("li.email IS NOT NULL");
	});

	it("WhatsApp continua identificado pelo canal", () => {
		const q = texto(conversaIdentificada(sql`c`));
		expect(q).toContain("wa_id");
	});
});
