// FIX-258 — Camada 1 structural: o orquestrador precisa resolver a menção
// textual do turno CONTRA os grupos já exibidos ANTES de montar o
// systemContext/chamar a LLM (rota determinística, Lei 1/4) — nunca deixar a
// LLM adivinhar o groupId sozinha. `resolveOfferMentionForConversation` já
// existe (choose-offer.ts, FIX-252) mas só era usado PÓS-simulação
// (runner.ts); este bloco liga a MESMA função também no ponto ANTES da
// tool-call, em `index.ts` (buildSystemContext recebe `mentionedOffer`).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-258 — index.ts resolve a menção textual ANTES de montar o systemContext", () => {
	it("importa resolveOfferMentionForConversation de choose-offer", () => {
		const src = readSource("src/lib/agent/orchestrator/index.ts");
		expect(src).toMatch(/resolveOfferMentionForConversation/);
	});

	it("passa mentionedOffer pro buildSystemContext (rota ANTES da tool-call, não só pós-simulação)", () => {
		const src = readSource("src/lib/agent/orchestrator/index.ts");
		expect(src).toMatch(/mentionedOffer/);
		// a chamada de buildSystemContext precisa carregar o campo — não só existir
		// em outro lugar do arquivo.
		const buildSystemContextCall = src.slice(src.indexOf("buildSystemContext({"));
		expect(buildSystemContextCall.slice(0, 400)).toMatch(/mentionedOffer/);
	});
});
