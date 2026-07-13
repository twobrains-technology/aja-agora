import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-265 (menor #3, veredito Fable r5, N7): "acabei de te mandar uma
// mensagenzinha no seu WhatsApp" era dito INCONDICIONALMENTE no handler de
// offer-confirm — mesmo quando sendFechoPedirOi só ENFILEIROU (janela fechada
// + template não aprovado). O handler precisa (1) chamar sendFechoPedirOi
// ANTES de montar a copy do fechamento e (2) passar o channel resultante pra
// closingPresentation condicionar o texto.
//
// Camada 1 (estrutural, sem DB) — nome NÃO começa com "route" de propósito
// (mesma convenção de lance-embutido-gate.test.ts): `test:unit` exclui
// `route*.test.ts`.
describe("FIX-265 — handler offer-confirm passa o channel real de sendFechoPedirOi pra closingPresentation", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf('if (body.action?.kind === "offer-confirm") {');
	const end = src.indexOf('if (body.action?.kind === "documents-done") {');
	const handler = src.slice(start, end);

	it("o handler do offer-confirm existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("sendFechoPedirOi é chamado ANTES de closingPresentation (precisa do channel pra montar a copy)", () => {
		const idxFecho = handler.indexOf("await sendFechoPedirOi(");
		const idxClosing = handler.indexOf("closingPresentation(");
		expect(idxFecho).toBeGreaterThan(-1);
		expect(idxClosing).toBeGreaterThan(-1);
		expect(idxFecho).toBeLessThan(idxClosing);
	});

	it("closingPresentation recebe whatsappChannel vindo do retorno de sendFechoPedirOi (não chamada crua)", () => {
		const closingCall = handler.slice(
			handler.indexOf("closingPresentation("),
			handler.indexOf("closingPresentation(") + 300,
		);
		expect(closingCall).toContain("whatsappChannel");
		expect(closingCall).toMatch(/\.channel\b/);
	});
});
