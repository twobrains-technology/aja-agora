import { describe, expect, it } from "vitest";
import {
	lanceEmbutidoQuestionToWhatsApp,
	resolveLanceEmbutidoReply,
} from "@/lib/whatsapp/formatter";
import { gateQuestion } from "./orchestrator/gate-questions";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT, LANCE_EMBUTIDO_OPTIONS } from "./qualify-config";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// Camada 1 (estrutural) — gate de lance embutido (jornada do .docx 2026-05-29).

describe("gate lance-embutido — pergunta educativa", () => {
	const q = gateQuestion("lance-embutido") ?? "";

	it("explica lance embutido em prosa (texto do doc)", () => {
		expect(q).toMatch(/lance embutido/i);
		expect(q).toMatch(/parte da própria carta de crédito/i);
		// Termina perguntando se quer considerar nas simulações (opt-in do doc).
		expect(q).toMatch(/considerar esse tipo de lance/i);
	});

	it("NÃO vaza jargão de engine (gate, botão, sistema, tool)", () => {
		expect(q.toLowerCase()).not.toMatch(/\bgate\b|\bbot[õo]es?\b|\bsistema\b|\btool\b/);
	});

	it("acentuação correta (sem ASCII-fy)", () => {
		expect(q).toMatch(/crédito/);
		expect(q).toMatch(/própria/);
		// não deve conter as versões sem acento das mesmas palavras
		expect(q).not.toMatch(/\bcredito\b/);
	});
});

describe("LANCE_EMBUTIDO_OPTIONS — opt-in binário", () => {
	it("tem exatamente 2 tokens: yes/no", () => {
		expect(LANCE_EMBUTIDO_OPTIONS.map((o) => o.token).sort()).toEqual(["no", "yes"]);
	});
	it("default percent é 30 (mais comum na captura Bevi)", () => {
		expect(LANCE_EMBUTIDO_DEFAULT_PERCENT).toBe(30);
	});
});

describe("roundtrip WhatsApp lance-embutido", () => {
	it("gera 2 botões com replyId lanceembutido_*", () => {
		const wa = lanceEmbutidoQuestionToWhatsApp("prefixo");
		const buttons = (wa.interactive as { action: { buttons: { reply: { id: string } }[] } }).action
			.buttons;
		expect(buttons).toHaveLength(2);
		expect(buttons.map((b) => b.reply.id).sort()).toEqual([
			"lanceembutido_no",
			"lanceembutido_yes",
		]);
	});

	it("resolve replyId de volta pro token", () => {
		expect(resolveLanceEmbutidoReply("lanceembutido_yes")?.value).toBe("yes");
		expect(resolveLanceEmbutidoReply("lanceembutido_no")?.value).toBe("no");
		// não colide com o gate lance normal
		expect(resolveLanceEmbutidoReply("lance_yes")).toBeNull();
	});
});

describe("prompt — consciência de lance embutido + objetivo", () => {
	it("instrui o agent a NÃO duplicar a explicação do sistema", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/lance embutido/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/contempla[çc][ãa]o r[áa]pida/i);
	});
});
