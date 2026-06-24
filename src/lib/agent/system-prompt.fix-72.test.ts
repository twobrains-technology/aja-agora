import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

/**
 * Camada 1 (structural) — FIX-72.
 *
 * qa-noturno (2026-06-24) revalidando o FIX-71 ao vivo: pos-recomendacao o usuario
 * pediu "me mostra as outras opcoes dessa faixa pra eu comparar" e o agent fabricou
 * `auto-180k` (simulate_quota) e `auto-180k-kairo` (get_group_details, com o NOME do
 * usuario no id) — degradou gracioso ("esse grupo deu um problema") mas nao entregou.
 *
 * O FIX-68 cobriu re-busca por TROCA DE FAIXA; o FIX-71 cobriu a ESCOLHA de um grupo
 * ja apresentado — ambos focados em `simulate_quota`. Este consolida a regra UNICA:
 * o groupId vem SEMPRE literal da descoberta e vale pra SIMULAR **E DETALHAR**
 * (get_group_details); nunca componha `categoria-valor` nem acrescente o nome.
 */
describe("FIX-72 — regra única de groupId literal, válida pra simular E detalhar", () => {
	it("referencia o FIX-72 e cita os contra-exemplos reais (auto-180k / auto-180k-kairo)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/FIX-72/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/auto-180k/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/auto-180k-kairo/);
	});

	it("a regra cobre explicitamente get_group_details (detalhar), não só simular", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/get_group_details/);
	});

	it("manda usar o id LITERAL da descoberta e proíbe fabricar/derivar/compor", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/id\s+(literal|opaco)/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/nunca\s+(fabrique|derive|invente|componha)/i);
	});

	it("preserva a degradação graciosa: re-buscar OU perguntar, nunca travar em instabilidade", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/RE-?BUSQUE|pergunte/i);
	});

	it("não regride as referências do FIX-68 e FIX-71 que os cassettes acoplam", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/auto-130k-60m/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/bb-auto-200k-72m/);
	});
});
