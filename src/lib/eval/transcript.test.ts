import { describe, expect, it } from "vitest";
import {
	buildTranscript,
	type TranscriptArtifact,
	type TranscriptInput,
	type TranscriptMessage,
} from "./transcript";

const at = (iso: string) => new Date(iso);

const baseInput = (overrides: Partial<TranscriptInput> = {}): TranscriptInput => ({
	status: "active",
	channel: "web",
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	messages: [],
	artifacts: [],
	...overrides,
});

describe("buildTranscript — janela 5+35", () => {
	it("renderiza tudo quando ≤ 40 turnos", () => {
		const messages: TranscriptMessage[] = Array.from({ length: 10 }, (_, i) => ({
			id: `m${i + 1}`,
			role: "user",
			content: `mensagem ${i + 1}`,
			createdAt: at("2026-05-08T10:00:00Z"),
		}));
		const out = buildTranscript(baseInput({ messages }));
		expect(out).toContain("mensagem 10");
		expect(out).not.toContain("turnos omitidos");
	});

	it("aplica janela 5+35 e preserva números originais de turn na cauda", () => {
		const messages: TranscriptMessage[] = Array.from({ length: 50 }, (_, i) => ({
			id: `m${i + 1}`,
			role: "user",
			content: `mensagem ${i + 1}`,
			createdAt: at("2026-05-08T10:00:00Z"),
		}));
		const out = buildTranscript(baseInput({ messages }));
		expect(out).toContain("mensagem 1");
		expect(out).toContain("mensagem 5");
		expect(out).not.toContain("mensagem 10"); // miolo omitido
		expect(out).toContain("10 turnos omitidos");
		expect(out).toContain("[Turn 16 · USER"); // número original preservado
		expect(out).toContain("[Turn 50 · USER");
	});
});

describe("buildTranscript — handoff", () => {
	it("avisa juiz quando status indica handoff (handed_off ou closed)", () => {
		const messages: TranscriptMessage[] = [
			{ id: "m1", role: "user", content: "oi", createdAt: at("2026-05-08T10:00:00Z") },
		];

		const handed = buildTranscript(baseInput({ status: "handed_off", messages }));
		expect(handed).toContain("handed_off");
		expect(handed).toContain("Avalie apenas as decisões do agente");

		const closed = buildTranscript(baseInput({ status: "closed", messages }));
		expect(closed).toContain("closed");

		const active = buildTranscript(baseInput({ status: "active", messages }));
		expect(active).not.toContain("ATENÇÃO");
	});
});

describe("buildTranscript — artifacts e payloads", () => {
	it("inline artifacts compartilham turn number da mensagem-pai", () => {
		const messages: TranscriptMessage[] = [
			{ id: "a1", role: "assistant", content: "olha aí", createdAt: at("2026-05-08T10:00:00Z") },
		];
		const artifacts: TranscriptArtifact[] = [
			{ messageId: "a1", type: "group_card", payload: { administradora: "Embracon" } },
		];
		const out = buildTranscript(baseInput({ messages, artifacts }));
		expect(out).toContain("[Turn 1 · ARTIFACT · group_card]");
		expect(out).toContain("Embracon");
	});

	it("trunca payload acima de 1KB pra não estourar janela", () => {
		const bigPayload: Record<string, unknown> = {};
		for (let i = 0; i < 200; i++) bigPayload[`f${i}`] = "x".repeat(50);
		const out = buildTranscript(
			baseInput({
				messages: [
					{
						id: "a1",
						role: "assistant",
						content: "x",
						createdAt: at("2026-05-08T10:00:00Z"),
					},
				],
				artifacts: [{ messageId: "a1", type: "comparison_table", payload: bigPayload }],
			}),
		);
		expect(out).toContain("(truncado em 1024 bytes)");
	});
});

describe("buildTranscript — markers de transição multi-persona", () => {
	it("emite marker quando persona muda entre turnos consecutivos do agente", () => {
		const messages: TranscriptMessage[] = [
			{
				id: "a1",
				role: "assistant",
				content: "Sou a Helena",
				createdAt: at("2026-05-08T10:00:00Z"),
				personaId: "helena-imovel",
			},
			{
				id: "a2",
				role: "assistant",
				content: "Aqui é o Rafael",
				createdAt: at("2026-05-08T10:00:30Z"),
				personaId: "rafael-auto",
			},
		];
		const out = buildTranscript(baseInput({ messages }));
		expect(out).toContain(
			"Transição: persona muda de helena-imovel para rafael-auto a partir do Turn 2",
		);
	});

	it("não emite marker quando todas as mensagens são da mesma persona", () => {
		const messages: TranscriptMessage[] = [
			{
				id: "a1",
				role: "assistant",
				content: "x",
				createdAt: at("2026-05-08T10:00:00Z"),
				personaId: "helena-imovel",
			},
			{
				id: "a2",
				role: "assistant",
				content: "y",
				createdAt: at("2026-05-08T10:00:30Z"),
				personaId: "helena-imovel",
			},
		];
		const out = buildTranscript(baseInput({ messages }));
		expect(out).not.toContain("Transição:");
	});

	it("não emite marker pra mensagens legacy (personaId null)", () => {
		const messages: TranscriptMessage[] = [
			{
				id: "a1",
				role: "assistant",
				content: "x",
				createdAt: at("2026-05-08T10:00:00Z"),
			},
			{
				id: "a2",
				role: "assistant",
				content: "y",
				createdAt: at("2026-05-08T10:00:30Z"),
			},
		];
		const out = buildTranscript(baseInput({ messages }));
		expect(out).not.toContain("Transição:");
	});
});

describe("buildTranscript — formato (snapshot pra catch regression)", () => {
	it("formato canônico de turno + cabeçalho", () => {
		const messages: TranscriptMessage[] = [
			{
				id: "u1",
				role: "user",
				content: "oi, quero comprar imóvel",
				createdAt: at("2026-05-08T10:00:00Z"),
			},
			{
				id: "a1",
				role: "assistant",
				content: "Ótimo! Qual sua faixa de crédito?",
				createdAt: at("2026-05-08T10:00:01Z"),
			},
		];
		expect(buildTranscript(baseInput({ messages }))).toMatchInlineSnapshot(`
			"=== CONVERSA ===
			Canal: web
			Persona ativa: helena-imovel
			Categoria: imovel
			Status: active
			Total de turnos: 2

			[Turn 1 · USER · 2026-05-08 10:00:00]
			oi, quero comprar imóvel

			[Turn 2 · ASSISTANT · 2026-05-08 10:00:01]
			Ótimo! Qual sua faixa de crédito?"
		`);
	});

	it("filtra mensagens de role system", () => {
		const out = buildTranscript(
			baseInput({
				messages: [
					{
						id: "s1",
						role: "system",
						content: "internal",
						createdAt: at("2026-05-08T10:00:00Z"),
					},
					{
						id: "u1",
						role: "user",
						content: "oi",
						createdAt: at("2026-05-08T10:00:01Z"),
					},
				],
			}),
		);
		expect(out).not.toContain("internal");
		expect(out).toContain("Total de turnos: 1");
	});
});
