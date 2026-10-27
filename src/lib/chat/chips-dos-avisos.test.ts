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

describe("qualquer outro texto", () => {
	it("devolve null — fala do modelo não é aviso do servidor", () => {
		expect(chipsDoAviso("Qual dessas cartas fica melhor pra você?")).toBeNull();
		expect(chipsDoAviso("")).toBeNull();
		expect(chipsDoAviso("Recebi seus documentos ✅.")).toBeNull();
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
