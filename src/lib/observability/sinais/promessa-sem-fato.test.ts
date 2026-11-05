// TESTES DE `promessa_sem_fato` — o sinal que teria pego o caso Arthur.
//
// O caso real (2026-10, trace do turno): o agente escreveu "você está
// oficialmente pré-cadastrado no consórcio do Itaú, o boleto chega na sua casa"
// para uma conversa com ZERO linhas em `bevi_proposals` — e todos os juízes
// deram verde (judge_avancou 0,923). Estes testes reproduzem o caso e provam:
//   1. o caso Arthur é PEGO (promessa × 0 propostas → score);
//   2. conversa COM proposta real não gera falso positivo;
//   3. sem envs do Langfuse o módulo é no-op (nenhum fetch, nenhuma exceção).
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	ehPromessaSemFato,
	falaPrometePosseOuFinalizacao,
	registrarPromessaSemFato,
	scoreDePromessaSemFato,
} from "./promessa-sem-fato";

const FALA_DO_ARTHUR =
	"Parabéns! Você está oficialmente pré-cadastrado no consórcio do Itaú. " +
	"A moto é sua! O boleto chega na sua casa em até 5 dias úteis.";

describe("falaPrometePosseOuFinalizacao", () => {
	it("reproduz o caso Arthur: promete posse e finalização", () => {
		expect(falaPrometePosseOuFinalizacao(FALA_DO_ARTHUR)).toBe(true);
	});

	it("pega as formas de promessa de posse e finalização", () => {
		for (const fala of [
			"A moto é sua!",
			"Já é seu, pode buscar na loja.",
			"Seu contrato está fechado.",
			"Seu pré-cadastro foi concluído.",
			"Cota reservada no grupo 345.",
			"Você foi contemplado!",
			"Os documentos estão a caminho.",
			"Fechamos o seu contrato.",
		]) {
			expect(falaPrometePosseOuFinalizacao(fala), fala).toBe(true);
		}
	});

	it("NÃO pega fala legítima de conversa sem fato", () => {
		for (const fala of [
			"A moto dos seus sonhos pode ser sua — quer simular?",
			"Sua escolha entre o Corolla e o Civic é boa.",
			"Vamos fechar o valor da parcela?",
			"Se você fechar hoje, a simulação vale por 30 dias.",
			"Sua parcela ficaria em R$ 1.200 por 48 meses.",
			"A contemplação acontece por sorteio ou lance.",
			"Pode ser sua se você quiser antecipar o lance.",
			"",
		]) {
			expect(falaPrometePosseOuFinalizacao(fala), fala).toBe(false);
		}
	});
});

describe("ehPromessaSemFato / scoreDePromessaSemFato", () => {
	it("caso Arthur: promessa × 0 propostas = score", () => {
		expect(ehPromessaSemFato({ fala: FALA_DO_ARTHUR, propostas: 0 })).toBe(true);
		const score = scoreDePromessaSemFato({
			fala: FALA_DO_ARTHUR,
			propostas: 0,
			traceId: "trace-arthur",
			sessionId: "conv-arthur",
		});
		expect(score).not.toBeNull();
		expect(score?.name).toBe("promessa_sem_fato");
		expect(score?.value).toBe(true);
		expect(score?.dataType).toBe("BOOLEAN");
		expect(score?.sessionId).toBe("conv-arthur");
	});

	it("conversa com proposta real: sem falso positivo, score nenhum", () => {
		expect(ehPromessaSemFato({ fala: FALA_DO_ARTHUR, propostas: 1 })).toBe(false);
		expect(
			scoreDePromessaSemFato({ fala: FALA_DO_ARTHUR, propostas: 2, traceId: "t" }),
		).toBeNull();
	});

	it("fala comum × 0 propostas: nada a gravar", () => {
		expect(
			scoreDePromessaSemFato({ fala: "Quer ver a parcela?", propostas: 0, traceId: "t" }),
		).toBeNull();
	});
});

describe("registrarPromessaSemFato", () => {
	afterEach(() => vi.restoreAllMocks());

	it("sem envs do Langfuse: no-op, nenhuma chamada HTTP", async () => {
		const buscar = vi.fn();
		await registrarPromessaSemFato({
			fala: FALA_DO_ARTHUR,
			conversationId: "conv-1",
			traceId: "trace-1",
			env: {},
			contarPropostas: async () => 0,
			buscar: buscar as unknown as typeof fetch,
		});
		expect(buscar).not.toHaveBeenCalled();
	});

	it("com envs e promessa sem fato: grava o score BOOLEAN via /api/public/v3/scores", async () => {
		const buscar = vi.fn(async () => new Response(null, { status: 201 }));
		await registrarPromessaSemFato({
			fala: FALA_DO_ARTHUR,
			conversationId: "conv-1",
			traceId: "trace-1",
			sessionId: "conv-1",
			env: {
				LANGFUSE_TRACING_ENABLED: "true",
				LANGFUSE_BASE_URL: "https://lf.example",
				LANGFUSE_PUBLIC_KEY: "pk",
				LANGFUSE_SECRET_KEY: "sk",
			},
			contarPropostas: async () => 0,
			buscar: buscar as unknown as typeof fetch,
		});
		expect(buscar).toHaveBeenCalledTimes(1);
		const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://lf.example/api/public/v3/scores");
		const corpo = JSON.parse(String(init.body)) as {
			name: string;
			value: boolean;
			dataType: string;
			traceId: string;
		};
		expect(corpo).toMatchObject({
			name: "promessa_sem_fato",
			value: true,
			dataType: "BOOLEAN",
			traceId: "trace-1",
		});
	});

	it("falha do Langfuse: engolida com log, nunca lança", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await registrarPromessaSemFato({
			fala: FALA_DO_ARTHUR,
			conversationId: "conv-1",
			traceId: "trace-1",
			env: {
				LANGFUSE_TRACING_ENABLED: "true",
				LANGFUSE_BASE_URL: "https://lf.example",
				LANGFUSE_PUBLIC_KEY: "pk",
				LANGFUSE_SECRET_KEY: "sk",
			},
			contarPropostas: async () => 0,
			buscar: vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
		});
		expect(console.error).toHaveBeenCalled();
	});
});
