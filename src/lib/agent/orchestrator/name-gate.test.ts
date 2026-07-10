/**
 * Camada 1 — FIX-17: o gate do nome ("Como posso te chamar?", passo 1 da
 * jornada canônica) dispara DETERMINISTICAMENTE no primeiro contato (nome
 * ainda NULL) — antes era um no-op ("doubts-wait"). A pergunta segue saindo no
 * TEXTO do agente (directive de primeiro contato); o card só complementa, então
 * gateQuestion('name') é null pra NÃO duplicar a pergunta. WhatsApp degrada pra
 * texto (gateInteractive('name') = null) — o card não existe lá.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import { gatePartData } from "@/lib/web/adapter";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const metaWithCategory = { currentCategory: "auto" } as ConversationMetadata;

describe("FIX-17 — gate do nome (primeiro contato)", () => {
	it("nextGate retorna 'name' quando o nome ainda não foi capturado", () => {
		expect(nextGate(metaWithCategory, { hasContactName: false })).toBe("name");
	});

	it("com o nome já capturado, segue o funil normal (desire — FIX-233: experience desceu pra pós-reveal)", () => {
		expect(nextGate(metaWithCategory, { hasContactName: true })).toBe("desire");
	});

	it("gateQuestion('name') é null — a pergunta já vem no texto do agente, o card não duplica", () => {
		expect(gateQuestion("name")).toBeNull();
	});

	it("gatePartData('name') devolve o card do nome", () => {
		expect(gatePartData("name", metaWithCategory)).toEqual({ kind: "name", gate: "name" });
	});

	it("WhatsApp degrada o gate 'name' pra texto (gateInteractive devolve null)", () => {
		// A pergunta do nome já saiu no texto do directive de primeiro contato;
		// no WhatsApp não há card — o switch precisa tratar 'name' como no-op.
		const src = read("src/lib/whatsapp/adapter.ts");
		expect(src).toMatch(/case "name":/);
	});
});

describe("FIX-17 — autofocus padronizado nos forms do funil (decisão Kairo 2026-06-11)", () => {
	it("name-prompt foca o input ao aparecer", () => {
		expect(read("src/components/chat/artifacts/name-prompt.tsx")).toMatch(/autoFocus|\.focus\(\)/);
	});

	it("gate-identity-form foca o CPF", () => {
		expect(read("src/components/chat/artifacts/gate-identity-form.tsx")).toMatch(
			/autoFocus|\.focus\(\)/,
		);
	});

	it("contract-form foca o CPF", () => {
		expect(read("src/components/chat/artifacts/contract-form.tsx")).toMatch(
			/autoFocus|\.focus\(\)/,
		);
	});

	it("lead-form mantém o autofocus no 1º campo", () => {
		expect(read("src/components/chat/artifacts/lead-form.tsx")).toMatch(/autoFocus/);
	});
});
