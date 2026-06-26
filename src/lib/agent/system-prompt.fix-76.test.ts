import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-76 — Camada 1 (structural): regra anti-alucinação de falha de busca.
// ----------------------------------------------------------------------------
// Bug real (Kairo 2026-06-25, persona Maria, conversa retomada): o agente disse
// "estou com dificuldade em acessar os grupos" / "instabilidade nas buscas" SEM
// ter chamado search_groups (turn-trace: toolsCalled=[]) e ofereceu "a faixa de
// R$ 256.000 que já temos dados reais disponíveis" — número RESSUSCITADO do
// histórico, apresentado como dado real. Viola a regra inviolável Bevi fonte
// única (proibido número stale/fictício em runtime).
//
// A defesa primária é uma REGRA DURA no prompt do specialist (bloco `stable`,
// cacheado). Estes asserts travam a regra pra ela não sumir num refactor.
// ============================================================================

describe("FIX-76 — prompt veta alucinação de falha de busca + valor stale como dado real", () => {
	it("proíbe afirmar instabilidade/dificuldade de busca sem search_groups chamada no turno", () => {
		// A regra cita a frase tóxica observada em prod ("instabilidade nas buscas")
		// e a amarra à condição: só pode narrar falha se search_groups foi chamada
		// E retornou erro NESTE turno.
		const regra =
			/NUNCA[\s\S]{0,400}(instabilidade|dificuldade)[\s\S]{0,400}(busca|grupos)[\s\S]{0,400}search_groups[\s\S]{0,200}(turno|erro)/i;
		expect(
			regra.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir narrar falha/instabilidade de busca quando " +
				"search_groups NÃO foi chamada (e sem erro de tool) no turno. Sem essa regra o " +
				"agente volta a alucinar 'instabilidade nas buscas' (bug Maria 2026-06-25).",
		).toBe(true);
	});

	it("cita literalmente a frase do bug ('instabilidade nas buscas') como exemplo proibido", () => {
		const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
		const p = norm(SPECIALIST_BASE_PROMPT);
		expect(
			p.includes("instabilidade nas buscas") || p.includes("instabilidade na busca"),
			"Ancorar a frase literal do bug ajuda o modelo a reconhecer o padrão proibido.",
		).toBe(true);
	});

	it("proíbe reapresentar valor do histórico como 'dado real disponível' sem search_groups no turno", () => {
		// Cobre a regra Bevi fonte única: nenhum número exibido como real pode vir
		// do histórico — só de search_groups/recommend_groups chamado no turno.
		const regra =
			/NUNCA[\s\S]{0,400}hist[óo]rico[\s\S]{0,500}(dado|dados) reais?[\s\S]{0,400}search_groups/i;
		expect(
			regra.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir reapresentar valor do histórico como 'dado real " +
				"disponível' sem search_groups no mesmo turno (regra inviolável Bevi fonte única).",
		).toBe(true);
	});

	it("a regra menciona Bevi fonte única / FIX-76 como âncora de origem", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/FIX-76/);
	});
});
