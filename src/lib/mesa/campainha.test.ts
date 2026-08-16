// A campainha do handoff — os números do caso real como teste.
//
// Conversa `75f77efd`, sexta 14/08: a notificação do handoff saiu às 19:02:04,
// foi `delivered` às 19:44:39 (42 min) e só foi `read` às 12:26:22 do dia
// seguinte (17h24 = 1044 min). O painel tinha ZERO listeners no instante do
// handoff. As 28,9 horas de silêncio da cliente não foram desatenção da mesa:
// foi a chamada que não chegou.
import { describe, expect, it } from "vitest";
import { diagnosticoDaCampainha, LIMITE_ENTREGA_MIN, scoresDaCampainha } from "./campainha";

const SENT = new Date("2026-08-14T19:02:04-03:00");
const DELIVERED = new Date("2026-08-14T19:44:39-03:00");
const READ = new Date("2026-08-15T12:26:22-03:00");
const AGORA = new Date("2026-08-16T00:30:00-03:00");

describe("diagnosticoDaCampainha — o caso 75f77efd", () => {
	it("mede os 42 min até entregar e os 1044 min até ler", () => {
		const d = diagnosticoDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: DELIVERED,
				readAt: READ,
				failedAt: null,
				listenersNoHandoff: 0,
			},
			AGORA,
		);
		expect(d.minutosAteEntregar).toBe(43); // 42min35s arredondado
		expect(d.minutosAteLer).toBe(1044);
		expect(d.semPainelAberto).toBe(true);
	});

	it("entrega demorada acima do limite é acusada", () => {
		const d = diagnosticoDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: DELIVERED,
				readAt: READ,
				failedAt: null,
				listenersNoHandoff: 0,
			},
			AGORA,
		);
		expect(LIMITE_ENTREGA_MIN).toBeLessThan(43);
		expect(d.entregaLenta).toBe(true);
	});

	it("notificação nunca entregue, com o limite vencido, é o alarme mais grave", () => {
		const d = diagnosticoDaCampainha(
			{ sentAt: SENT, deliveredAt: null, readAt: null, failedAt: null, listenersNoHandoff: 1 },
			AGORA,
		);
		expect(d.naoEntregue).toBe(true);
		expect(d.minutosAteEntregar).toBeNull();
	});

	it("entrega rápida e leitura rápida não acusam nada", () => {
		const d = diagnosticoDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: new Date(SENT.getTime() + 20_000),
				readAt: new Date(SENT.getTime() + 60_000),
				failedAt: null,
				listenersNoHandoff: 3,
			},
			AGORA,
		);
		expect(d.naoEntregue).toBe(false);
		expect(d.entregaLenta).toBe(false);
		expect(d.semPainelAberto).toBe(false);
	});

	it("dentro do limite, ainda sem entrega, não acusa — a Meta pode estar a caminho", () => {
		const agoraCedo = new Date(SENT.getTime() + 60_000);
		const d = diagnosticoDaCampainha(
			{ sentAt: SENT, deliveredAt: null, readAt: null, failedAt: null, listenersNoHandoff: 1 },
			agoraCedo,
		);
		expect(d.naoEntregue).toBe(false);
	});

	it("falha declarada pela Meta é acusada como não entregue, sem esperar o limite", () => {
		const d = diagnosticoDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: null,
				readAt: null,
				failedAt: new Date(SENT.getTime() + 5_000),
				failureReason: "131047 Re-engagement message",
				listenersNoHandoff: 2,
			},
			new Date(SENT.getTime() + 30_000),
		);
		expect(d.naoEntregue).toBe(true);
	});
});

describe("scoresDaCampainha", () => {
	it("o caso real produz os três sinais que não existiam", () => {
		const scores = scoresDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: DELIVERED,
				readAt: READ,
				failedAt: null,
				listenersNoHandoff: 0,
			},
			AGORA,
		);
		const porNome = Object.fromEntries(scores.map((s) => [s.name, s.value]));
		expect(porNome.handoff_notificacao_entregue_min).toBe(43);
		expect(porNome.handoff_notificacao_lida_min).toBe(1044);
		expect(porNome.handoff_painel_sem_listener).toBe(1);
	});

	it("campainha saudável não emite alarme — só as medidas", () => {
		const scores = scoresDaCampainha(
			{
				sentAt: SENT,
				deliveredAt: new Date(SENT.getTime() + 15_000),
				readAt: new Date(SENT.getTime() + 45_000),
				failedAt: null,
				listenersNoHandoff: 2,
			},
			AGORA,
		);
		const nomes = scores.map((s) => s.name);
		expect(nomes).not.toContain("handoff_notificacao_nao_entregue");
		expect(nomes).toContain("handoff_notificacao_entregue_min");
	});

	it("notificação não entregue emite o alarme booleano", () => {
		const scores = scoresDaCampainha(
			{ sentAt: SENT, deliveredAt: null, readAt: null, failedAt: null, listenersNoHandoff: 0 },
			AGORA,
		);
		const porNome = Object.fromEntries(scores.map((s) => [s.name, s.value]));
		expect(porNome.handoff_notificacao_nao_entregue).toBe(1);
	});
});
