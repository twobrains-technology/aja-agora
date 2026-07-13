import { describe, expect, it } from "vitest";
import { gateQuestion, lanceEmbutidoEdu } from "./gate-questions";

// FIX-327 (rodada 10, veredito Sonnet A.6 — P4, teto explícito da r10):
// achado ao vivo (dossiê Madalena fresco, pós-FIX-326): o texto do gate
// `lance-embutido` (WEB) tinha 2 "?" — "Você sabe o que é lance embutido?
// Fica tranquilo, a gente te ajuda. ... Quer considerar esse tipo de lance
// nas suas simulações?" — um rhetórico (abertura) e um real (a pergunta que
// de fato importa). Diferente do FIX-326 (colisão modelo×gate): aqui as DUAS
// perguntas vêm do MESMO texto canônico do gate, um problema de COPY, não de
// runtime. Fix: reescreve a abertura como afirmação, mantendo o tom
// acolhedor sem usar "?".
describe("FIX-327 — lance-embutido (WEB) tem NO MÁXIMO 1 '?' no texto canônico", () => {
	it("lanceEmbutidoEdu não usa mais a abertura retórica com '?'", () => {
		const text = lanceEmbutidoEdu(92_902);
		expect(text.match(/\?/g)?.length ?? 0).toBe(0);
	});

	it("gateQuestion('lance-embutido', ...) — o texto composto (educação+pergunta) tem exatamente 1 '?'", () => {
		const q = gateQuestion("lance-embutido", "auto", 92_902);
		expect(q).toBeTruthy();
		expect(q?.match(/\?/g)?.length ?? 0).toBe(1);
	});

	it("preserva o tom acolhedor e o conteúdo educativo (não é opcional, só a abertura muda)", () => {
		const text = lanceEmbutidoEdu(92_902);
		expect(text).toMatch(/lance embutido/i);
		expect(text).toMatch(/chances de contempla[çc][ãa]o/i);
		expect(text).toMatch(/92\.902/);
	});
});
