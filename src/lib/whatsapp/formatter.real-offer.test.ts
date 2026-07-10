import { describe, expect, it } from "vitest";
import { realOfferToWhatsApp } from "./formatter";

// ============================================================================
// FIX-39/40 — paridade de canal: o card real_offer do WhatsApp consome os campos
// novos da API (prazo, lance médio do grupo) iguais ao card web. Defensivo: ausente
// → omite a linha (D11: nenhum número sem fonte). Rótulo LITERAL pro lance médio,
// SEM prometer contemplação. Os CTAs (offer_confirm/offer_reject) seguem vivos.
// ============================================================================

const BASE = {
	administradora: "BANCO DO BRASIL",
	grupo: "1690",
	creditValue: 114_760.54,
	monthlyPayment: 2_075.34,
};

type InteractiveBody = {
	body?: { text?: string };
	action?: { buttons?: { reply: { id: string } }[] };
};

const bodyText = (p: Record<string, unknown>): string => {
	const wa = realOfferToWhatsApp(p);
	return (wa.interactive as InteractiveBody | undefined)?.body?.text ?? "";
};

describe("realOfferToWhatsApp — paridade dos campos novos (FIX-39/40)", () => {
	it("FIX-39: com termMonths inclui 'Prazo' e '72 meses' (markdown bold do WhatsApp)", () => {
		const t = bodyText({ ...BASE, termMonths: 72 });
		expect(t).toMatch(/Prazo/i);
		expect(t).toMatch(/72\s*meses/i);
	});

	it("FIX-39: sem termMonths NÃO inventa prazo", () => {
		expect(bodyText(BASE)).not.toMatch(/\d+\s*meses/i);
	});

	it("FIX-40: com avgBidValue inclui 'Lance médio do grupo' (rótulo literal, sem promessa)", () => {
		const t = bodyText({ ...BASE, avgBidValue: 69_361.27 });
		expect(t).toMatch(/lance médio do grupo/i);
		expect(t).toMatch(/69\.361/);
		expect(t).not.toMatch(/contempl|garant|chance/i);
	});

	it("FIX-40: sem avgBidValue NÃO renderiza lance médio", () => {
		expect(bodyText(BASE)).not.toMatch(/lance médio/i);
	});

	it("CTAs offer_confirm/offer_reject seguem vivos com os campos novos", () => {
		const wa = realOfferToWhatsApp({ ...BASE, termMonths: 72, avgBidValue: 69_361.27 });
		if (wa.type !== "interactive") throw new Error("esperava interactive");
		const ids = (wa.interactive as InteractiveBody).action?.buttons?.map((b) => b.reply.id);
		expect(ids).toContain("offer_confirm");
		expect(ids).toContain("offer_reject");
	});
});

// FIX-240 (rodada 2, Fable r1, D5.1 — CDC art. 30): o WhatsApp usa o MESMO
// payload real_offer do web (closing-presentation.ts) — o aviso de ajuste
// precisa de paridade de canal, senão o cliente do WhatsApp confirma uma carta
// fora da faixa pedida sem nenhum aviso (o card web já cobre via FIX-197).
// FIX-247 (rodada 3, Fable r2 N3): a copy antiga ("Ajustamos essa carta de X
// pra sua faixa de ~Y") estava semanticamente INVERTIDA no fechamento — "essa
// carta" apontava pro PEDIDO e "sua faixa" pra CARTA NOVA (o oposto do que as
// palavras significam). Corrigida pra "pedido × carta real", sem ambiguidade.
describe("realOfferToWhatsApp — aviso de ajuste (FIX-240/FIX-247, paridade com o card web)", () => {
	it("rawCreditValue ≠ creditValue → avisa a divergência com pedido × carta real", () => {
		const t = bodyText({ ...BASE, rawCreditValue: 150_000 });
		expect(t.toLowerCase()).toMatch(/pediu.*carta real/is);
		expect(t).toMatch(/150\.000|150,00/);
	});

	it("sem rawCreditValue → NÃO avisa (nada a ajustar)", () => {
		expect(bodyText(BASE).toLowerCase()).not.toMatch(/pediu uma carta/);
	});

	it("rawCreditValue igual a creditValue → NÃO avisa (nada divergiu)", () => {
		expect(
			bodyText({ ...BASE, rawCreditValue: BASE.creditValue }).toLowerCase(),
		).not.toMatch(/pediu uma carta/);
	});
});

// FIX-259 (rodada 5, veredito Fable r4, P1 #2) — paridade de canal: a troca de
// administradora no fechamento nunca pode sair em silêncio, nem no WhatsApp.
describe("realOfferToWhatsApp — aviso de troca de administradora (FIX-259, paridade com o card web)", () => {
	it("previousAdministradora presente → avisa a troca com as duas marcas", () => {
		const t = bodyText({ ...BASE, previousAdministradora: "ITAÚ" });
		expect(t).toMatch(/ITAÚ/);
		expect(t).toMatch(/n[ãa]o tem grupo dispon[íi]vel/i);
		expect(t).toMatch(/BANCO DO BRASIL/);
	});

	it("sem previousAdministradora → NÃO avisa troca (comportamento antigo intacto)", () => {
		expect(bodyText(BASE).toLowerCase()).not.toMatch(/n[ãa]o tem grupo dispon[íi]vel/);
	});
});
