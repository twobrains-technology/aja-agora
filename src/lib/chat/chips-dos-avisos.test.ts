// TODO TURNO QUE ESPERA RESPOSTA TRAZ UM TOQUE — inclusive os avisos do SERVIDOR.
//
// Medido no banco do dev (conversas simuladas, desde 17:14 de 27/10): **558** turnos do agente
// terminaram com pergunta, **456** (81,7 %) com opção de um toque e **102** sem nenhum toque. As
// duas maiores famílias restantes não eram fala do modelo — eram AVISOS escritos por
// `api/chat/route.ts` por `writeAndSaveText`, que só grava texto: 9× "Tive um problema ao gerar sua
// proposta. Pode tentar confirmar de novo?" e 7× "Não encontrei seus dados aqui — preenche o CPF e o
// celular no formulário pra eu seguir com a proposta?".
//
// Os textos abaixo são COPIADOS LITERALMENTE das linhas do route (1312 e 1531) — se um deles mudar
// lá, este teste deixa de provar o que promete.

import { describe, expect, it } from "vitest";
import { chipsDoAviso } from "./chips-dos-avisos";
import type { QuickReplyPayload } from "./types";

/** A linha 1531 de `src/app/api/chat/route.ts` (offer-confirm falhou). */
const AVISO_DE_PROPOSTA_QUE_FALHOU =
	"Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?";

/** A linha 1312 de `src/app/api/chat/route.ts` (contract-submit sem CPF/celular). */
const AVISO_DE_DADOS_FALTANDO =
	"Não encontrei seus dados aqui — preenche o CPF e o celular no formulário pra eu seguir com a proposta?";

/** Nenhuma opção pode ser pergunta nem convite a RECUSAR o dado que salva o lead (P6). */
const ehPerguntaOuRecusa = (label: string) =>
	label.trim().endsWith("?") ||
	/\bnão quero\b|\bdepois\b|\bagora não\b|\bprefiro não\b/i.test(label);

describe("aviso de proposta que falhou", () => {
	it("devolve as duas saídas que o cliente realmente tem", () => {
		expect(chipsDoAviso(AVISO_DE_PROPOSTA_QUE_FALHOU)).toEqual([
			{ label: "Tentar de novo" },
			{ label: "Antes quero falar do lance" },
		]);
	});

	it("toda opção tem rótulo utilizável como mensagem do cliente", () => {
		const opcoes = chipsDoAviso(AVISO_DE_PROPOSTA_QUE_FALHOU) ?? [];
		expect(opcoes).toHaveLength(2);
		for (const { label } of opcoes) {
			expect(label.trim().length).toBeGreaterThan(0);
			expect(ehPerguntaOuRecusa(label)).toBe(false);
		}
	});

	it("a outra forma do mesmo aviso (só o convite a tentar de novo) também casa", () => {
		expect(chipsDoAviso("Pode tentar confirmar de novo?")).not.toBeNull();
	});
});

describe("aviso de dados faltando", () => {
	it("devolve preencher agora ou seguir pelo WhatsApp", () => {
		expect(chipsDoAviso(AVISO_DE_DADOS_FALTANDO)).toEqual([
			{ label: "Vou preencher agora" },
			{ label: "Prefiro seguir pelo WhatsApp" },
		]);
	});

	it("toda opção tem rótulo utilizável como mensagem do cliente", () => {
		const opcoes = chipsDoAviso(AVISO_DE_DADOS_FALTANDO) ?? [];
		expect(opcoes).toHaveLength(2);
		for (const { label } of opcoes) {
			expect(label.trim().length).toBeGreaterThan(0);
			expect(ehPerguntaOuRecusa(label)).toBe(false);
		}
	});
});

describe("qualquer outro aviso", () => {
	it("aviso neutro, sem pergunta e sem pedido, devolve null — não inventa botão", () => {
		expect(chipsDoAviso("Tudo certo, já registrei.")).toBeNull();
		expect(chipsDoAviso("Recebi seus documentos ✅.")).toBeNull();
		expect(chipsDoAviso("")).toBeNull();
	});

	// Caso REAL da auditoria (sha `e2461a52`, R21 de 28/10 01:58:27Z, `route.ts:1245`): a pergunta
	// saiu por `writeAndSaveText` puro e o cliente ficou sem nenhum botão.
	it("o aviso do formulário (route.ts:1245) sai com 2+ opções, nunca null", () => {
		const opcoes = chipsDoAviso(
			"Antes de eu confirmar seu plano, deixa eu te mostrar o formulário rapidinho — me diz que quer seguir?",
		);
		expect(opcoes).not.toBeNull();
		expect(opcoes?.length).toBeGreaterThanOrEqual(2);
		// Pelo menos uma opção RESPONDE ao pedido do turno ("me diz que quer seguir?").
		expect(opcoes?.some((o) => /^(pode|quero|sim|mando|vou)/i.test(o.label.trim()))).toBe(true);
	});

	it("o aviso do número que não registrou (route.ts:858) também sai com opções", () => {
		const opcoes = chipsDoAviso(
			"Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
		);
		expect(opcoes).not.toBeNull();
		expect(opcoes?.length).toBeGreaterThanOrEqual(2);
	});

	it("o aviso de proposta já registrada (route.ts:1298) sai com opções", () => {
		const opcoes = chipsDoAviso(
			"Você já tem uma proposta registrada com a RODOBENS — não dá pra abrir uma segunda com outra administradora por aqui. Quer que eu confira o status dessa proposta pra você?",
		);
		expect(opcoes).not.toBeNull();
		expect(opcoes?.length).toBeGreaterThanOrEqual(2);
	});

	it("pedido de CPF/celular recebe as opções DO DADO, não as genéricas", () => {
		expect(
			chipsDoAviso("Preciso do celular completo, com DDD — dá uma conferida e me manda de novo?"),
		).toEqual([{ label: "Mando meu celular" }, { label: "Por que precisa do celular?" }]);

		const doCpf = chipsDoAviso("Pra seguir eu preciso do seu CPF, pode me passar?") ?? [];
		expect(doCpf.map((o) => o.label)).toEqual(["Pode usar meu CPF", "Por que precisa do CPF?"]);
		// Nenhuma das duas é o par genérico que não responde ao pedido.
		expect(doCpf.map((o) => o.label)).not.toContain("Pode seguir");
	});
});

describe("o payload emitido no ponto de uso", () => {
	it("o artifact montado casa com QuickReplyPayload e traz replyId do servidor", () => {
		const opcoes = chipsDoAviso(AVISO_DE_PROPOSTA_QUE_FALHOU) ?? [];
		// Mesmo formato que `route.ts` grava: { options: [{ label, replyId }] }.
		const payload = {
			options: opcoes.map((o) => ({ label: o.label, replyId: crypto.randomUUID() })),
		} satisfies QuickReplyPayload;

		expect(payload.options).toHaveLength(2);
		for (const opcao of payload.options) {
			expect(opcao.label.trim().length).toBeGreaterThan(0);
			expect(opcao.replyId).toMatch(/^[0-9a-f-]{36}$/);
		}
		// Ids distintos por opção: é por eles que o clique é consumido
		// (`click:<conversationId>:<replyId>`).
		expect(new Set(payload.options.map((o) => o.replyId)).size).toBe(2);
	});
});
