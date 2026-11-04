import { describe, expect, it, vi } from "vitest";

// `toLocaleString("pt-BR", { style: "currency" })` separa com espaço INQUEBRÁVEL.
const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");

vi.mock("@/db", () => ({ db: {} }));

const PLANO = {
	groupId: "grp-canopus-1",
	administradora: "Canopus",
	creditValue: 80000,
	monthlyPayment: 700,
	termMonths: 120,
	initialTargetMonth: 60,
	avgBidValue: 12000,
};

const corpoDoDial = (wa: { interactive?: unknown }) =>
	semNbsp((wa.interactive as { body: { text: string } }).body.text);

describe("o dial do WhatsApp diz o resultado, não só a pergunta", () => {
	it("o payload da carta vira CENÁRIO calculado, como o componente web faz no cliente", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 12 });
		expect(wa.type).toBe("interactive");
		const corpo = corpoDoDial(wa);
		// O resultado do mês-alvo do payload — não a pergunta solta.
		expect(corpo).toContain("12 meses");
		// Mês 12 pede lance ACIMA do médio do grupo (R$ 12.000 pra 120 meses): o
		// número é o TETO observado, e o balão tem que dizer isso em vez de
		// vendê-lo como estimativa daquele mês (P148).
		expect(corpo).toContain("R$ 12.000");
		expect(corpo).toContain("teria que passar do que costuma vencer");
		expect(corpo).toContain("não dá pra estimar");
		expect(corpo).toContain("A partir do mês 30");
		expect(corpo).not.toContain("fica em torno de");
		// O de-para da parcela (a referência é a parcela do próprio payload).
		expect(corpo).toContain("R$ 68.000");
		expect(corpo).toContain("R$ 700");
		expect(corpo).toContain("R$ 589");
		// E o loop continua aberto: no chat não há slider pra pedir outro prazo.
		expect(corpo).toMatch(/quantos meses/i);
	});

	it('o mês-alvo muda o número — "Testar outro prazo" não repete o anterior', async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const cedo = corpoDoDial(contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 12 }));
		const tarde = corpoDoDial(contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 60 }));
		expect(cedo).toContain("12 meses");
		expect(tarde).toContain("60 meses");
		expect(cedo).not.toBe(tarde);
	});

	it("botão simoffer_* → mês fora da evidência → o balão traz a ressalva", async () => {
		const { artifactToWhatsApp } = await import("./formatter");
		const { coerceDialPayload, offerSnapshotFromArtifact } = await import(
			"@/lib/agent/orchestrator/dial-payload"
		);
		// Percurso real: a carta reemitida carrega os INPUTS coagiados do snapshot
		// da oferta (cards-livres `contemplation_dial`) e o mês-alvo que o cliente
		// pediu ao tocar "Testar outro prazo".
		const snapshot = offerSnapshotFromArtifact({
			administradora: PLANO.administradora,
			creditValue: PLANO.creditValue,
			monthlyPayment: PLANO.monthlyPayment,
			termMonths: PLANO.termMonths,
			avgBidValue: PLANO.avgBidValue,
		});
		expect(snapshot).not.toBeNull();
		const payload = coerceDialPayload({ initialTargetMonth: 12 }, snapshot);
		const wa = artifactToWhatsApp("contemplation_dial", payload);
		expect(wa?.type).toBe("interactive");
		const corpo = corpoDoDial(wa as { interactive?: unknown });
		expect(corpo).toContain("12 meses");
		expect(corpo).toContain("teria que passar do que costuma vencer");
		expect(corpo).toContain("A partir do mês 30");
	});

	it("recusa ao lance embutido (maxEmbutidoPct: 0) é zero, não ausência", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const recusou = corpoDoDial(
			contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 30, maxEmbutidoPct: 0 }),
		);
		const aceitou = corpoDoDial(contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 30 }));
		// Sem embutido o cliente recebe a carta cheia; com o teto padrão (30%) a
		// parte embutida do lance sai do próprio crédito.
		expect(recusou).toContain("R$ 80.000");
		expect(recusou).not.toContain("R$ 68.000");
		expect(aceitou).toContain("R$ 68.000");
	});

	it("cenário calculado pelo agente: o de-para da parcela continua saindo", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({
			...PLANO,
			initialTargetMonth: 60,
			scenario: {
				targetMonth: 60,
				mode: "lance",
				requiredLancePct: 25,
				requiredLanceValue: 20000,
				receivedCredit: 80000,
				paymentBeforeContemplation: 700,
				paymentAfterContemplation: 420,
			},
		});
		expect(wa.type).toBe("interactive");
		const corpo = corpoDoDial(wa);
		expect(corpo).toContain("R$ 700");
		expect(corpo).toContain("R$ 420");
		expect(corpo).toContain("60 meses");
	});

	it("cenário do agente além da evidência também chega com a ressalva", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({
			...PLANO,
			initialTargetMonth: 12,
			scenario: {
				targetMonth: 12,
				mode: "lance",
				requiredLancePct: 15,
				requiredLanceValue: 12000,
				receivedCredit: 68000,
				beyondEvidence: true,
				earliestSupportedMonth: 30,
			},
		});
		const corpo = corpoDoDial(wa);
		expect(corpo).toContain("R$ 12.000");
		expect(corpo).toContain("teria que passar do que costuma vencer");
		expect(corpo).toContain("A partir do mês 30");
	});

	it("payload vazio não inventa número — só a pergunta", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({});
		expect(wa.text ?? "").not.toMatch(/R\$/);
		expect(wa.text ?? "").toMatch(/quantos meses/i);
	});
});

// O AVISO DA LGPD SAIU DO FECHAMENTO (decisão do dono, 27/10/2026 — ver
// `.orientacao/prints-kairo/1532-formulario-fixo.png`): o texto que recitava "conforme a
// LGPD… Posso criar?" virou rito e atropelou o pedido de WhatsApp que a pessoa estava
// fazendo. O que este bloco protege agora é o contrário: o pedido do CPF sai LIMPO, sem
// pergunta de autorização, e o texto não quebra quando falta a administradora.
const perguntas = (t: string) => (t.match(/\?/g) ?? []).length;

describe("o pedido de CPF do fechamento não recita aviso de LGPD", () => {
	it("sem identidade: pede o CPF direto, sem aviso e sem 'Posso seguir'", async () => {
		const { contractFormToWhatsApp } = await import("./formatter");
		const wa = contractFormToWhatsApp({ administradora: "Canopus" });
		expect(wa.type).toBe("text");
		const texto = wa.text ?? "";
		expect(texto).not.toMatch(/LGPD/i);
		expect(texto).not.toMatch(/bir[ôo]s?\s+de\s+cr[eé]dito/i);
		expect(texto).not.toMatch(/Posso seguir/i);
		expect(texto).toContain("manda seu *CPF*");
		expect(texto).toContain("Canopus");
		expect(perguntas(texto)).toBe(0);
	});

	it("com identidade: o corpo dos botões confirma os dados e pergunta se pode criar", async () => {
		const { contractFormToWhatsApp } = await import("./formatter");
		const wa = contractFormToWhatsApp({
			administradora: "Rodobens",
			identityOnFile: true,
			prefilledCpfMasked: "123.456.7**",
		});
		expect(wa.type).toBe("interactive");
		const corpo = (wa.interactive as { body: { text: string } }).body.text;
		expect(corpo).not.toMatch(/LGPD/i);
		expect(corpo).not.toMatch(/bir[ôo]s?\s+de\s+cr[eé]dito/i);
		expect(perguntas(corpo)).toBeLessThanOrEqual(1);
		expect(corpo).toContain("123.456.7**");
		expect(corpo).toContain("Rodobens");
		const buttons = (wa.interactive as { action: { buttons: { reply: { id: string } }[] } }).action
			.buttons;
		expect(buttons.map((b) => b.reply.id)).toEqual(["contract_confirm", "contract_cancel"]);
	});

	it("sem administradora no payload, o texto não sai com buraco no meio", async () => {
		const { contractFormToWhatsApp } = await import("./formatter");
		const texto = contractFormToWhatsApp({}).text ?? "";
		expect(texto).toMatch(/proposta/);
		expect(texto).not.toMatch(/proposta\s+,/);
	});
});
