import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-271 (rodada 8, veredito Fable r7, mesma família do FIX-266): o fallback
// de EMPTY-TURN (finishReason="length"/turno fechou mudo) pedia "manda de
// novo, por favor?" mesmo quando o usuário JÁ tinha nomeado uma oferta
// exibida na tela — contenção sem resolução, a mesma classe de bug que o
// FIX-266 corrigiu no caminho do tool-error (index.ts), só que ali no route.
//
// Camada 1 (estrutural): trava a invariante de wiring no source de produção.
// O nome do arquivo NÃO começa com "route" de propósito — `test:unit` exclui
// `route*.test.ts` (a suíte que abre uma stream real do handler), e queremos
// que esta regressão rode em todo PR.
describe("FIX-271 — empty-turn fallback roda o resolver de menção antes de 'manda de novo'", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf("if (isTurnEmpty(trace.toRecord())) {");
	const end = src.indexOf("} else if (!trace.hasFinish())", start);
	const emptyTurnBlock = src.slice(start, end);

	it("o bloco de empty-turn existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("chama resolveOfferMentionForConversation ANTES de recorrer ao EMPTY_TURN_FALLBACK", () => {
		const resolverIdx = emptyTurnBlock.indexOf("resolveOfferMentionForConversation(");
		const fallbackIdx = emptyTurnBlock.lastIndexOf("EMPTY_TURN_FALLBACK");
		expect(resolverIdx).toBeGreaterThan(-1);
		expect(fallbackIdx).toBeGreaterThan(-1);
		expect(resolverIdx).toBeLessThan(fallbackIdx);
	});

	it("quando a menção resolve, reafirma a oferta (buildToolErrorRecoveryResolvedFallback) em vez de pedir de novo", () => {
		expect(emptyTurnBlock).toContain("buildToolErrorRecoveryResolvedFallback(");
	});

	it("o finishReason distingue o caminho resolvido do fallback genérico (observabilidade, FIX-269)", () => {
		expect(emptyTurnBlock).toMatch(/empty-turn-resolved/);
	});
});
