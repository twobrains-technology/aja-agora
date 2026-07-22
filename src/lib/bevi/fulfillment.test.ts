import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockProposalGateway } from "../../../tests/helpers/mock-proposal-gateway";
import type { PartnerOffer, SimulationResult } from "../adapters/proposal-gateway";

// Mock do repo (DB) — guarda em memória, mantém isOfferFresh real.
const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
vi.mock("./proposal-repo", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./proposal-repo")>();
	return {
		...actual,
		createBeviProposal: vi.fn(async (conversationId: string, snap: Record<string, unknown>) => {
			const row = { id: `row-${conversationId}`, conversationId, ...snap };
			store.set(conversationId, row);
			return row;
		}),
		getLatestBeviProposal: vi.fn(
			async (conversationId: string) => store.get(conversationId) ?? null,
		),
		updateBeviProposal: vi.fn(async (id: string, patch: Record<string, unknown>) => {
			for (const r of store.values()) if (r.id === id) Object.assign(r, patch);
		}),
	};
});

import { confirmOffer, startContract, uploadContractDocument } from "./fulfillment";

const input = {
	cpf: "12345678909",
	celular: "11999998888",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 50000,
};

beforeEach(() => store.clear());

describe("fulfillment — passo 5 Contratar (com MockProposalGateway)", () => {
	it("startContract: cria proposta, devolve oferta real próxima do valor, persiste", async () => {
		const gw = new MockProposalGateway();
		const r = await startContract("conv-1", input, gw);
		expect(r.proposalId).toMatch(/^prop-mock-/);
		expect(r.offer).toBeTruthy();
		expect(r.offer?.category).toBe("auto");
		expect(r.offer?.creditValue).toBeGreaterThan(30000);
		expect(store.get("conv-1")?.proposalId).toBe(r.proposalId);
		expect(store.get("conv-1")?.ofertaId).toBeTruthy();
	});

	// FIX-240 (rodada 2, Fable r1, D5.1): o valor PEDIDO pelo cliente (input.valor)
	// tem que sobreviver no resultado — é a fonte do rawCreditValue que aciona o
	// aviso de ajuste (FIX-197) quando a carta fechada diverge dele.
	it("startContract: devolve requestedCreditValue = input.valor (fonte do aviso de ajuste FIX-197)", async () => {
		const gw = new MockProposalGateway();
		const r = await startContract("conv-req", input, gw);
		expect(r.requestedCreditValue).toBe(input.valor);
	});

	// FIX-281 (r9 onda 2, veredito Sonnet r9pos, gap G-A): `requestedCreditValue`
	// tem que refletir o PEDIDO original do cliente (o mesmo dado que alimenta o
	// aviso de divergência CDC no `real_offer`), nunca o `valor` de matching (que é
	// o creditValue da ÚLTIMA oferta vista, FIX-73) — mesmo quando os dois DIVERGEM
	// da carta final devolvida pela simulação. Gateway fixo (não o
	// MockProposalGateway padrão, cuja fórmula sintética não reproduz os números
	// reais) pina literalmente os dois cenários do veredito.
	describe("FIX-281 — requestedCreditValue usa originalRequestedCreditValue, NUNCA o valor de matching", () => {
		function fixedOfferGateway(creditValue: number): MockProposalGateway {
			const gw = new MockProposalGateway();
			const offer: PartnerOffer = {
				ofertaId: "oferta-fixa",
				administradora: "RODOBENS",
				tipoOferta: "SPECIAL_OFFER",
				grupo: "500",
				valorCarta: creditValue,
				parcela: creditValue / 80,
				taxaContemplacao: 0.6,
				quotaId: "quota-fixa",
			};
			gw.simulate = async (): Promise<SimulationResult> => ({
				simulationSessionId: "sess-fixa",
				expiresAt: new Date("2026-07-12T21:00:00.000Z").toISOString(),
				offers: [offer],
			});
			return gw;
		}

		it("mario: pedido 70.000, carta final 71.043 → rawCreditValue (requestedCreditValue) sai 70.000", async () => {
			const gw = fixedOfferGateway(71_043);
			const r = await startContract(
				"conv-mario",
				{ ...input, valor: 71_043, originalRequestedCreditValue: 70_000 },
				gw,
			);
			expect(r.offer?.creditValue).toBe(71_043);
			expect(r.requestedCreditValue).toBe(70_000);
		});

		it("madalena: pedido 250.000, carta final 263.864 → rawCreditValue sai 250.000, NUNCA 260.173 (creditValue do reveal anterior)", async () => {
			const gw = fixedOfferGateway(263_864);
			const r = await startContract(
				"conv-madalena",
				{ ...input, valor: 260_173, originalRequestedCreditValue: 250_000 },
				gw,
			);
			expect(r.offer?.creditValue).toBe(263_864);
			expect(r.requestedCreditValue).toBe(250_000);
			expect(r.requestedCreditValue).not.toBe(260_173);
		});

		it("sem originalRequestedCreditValue (caminho legado) → cai pro valor de matching (fallback gracioso)", async () => {
			const gw = fixedOfferGateway(52_000);
			const r = await startContract("conv-legado", { ...input, valor: 50_000 }, gw);
			expect(r.requestedCreditValue).toBe(50_000);
		});
	});

	it("confirmOffer: escolhe a oferta → link de assinatura + links de documento", async () => {
		const gw = new MockProposalGateway();
		await startContract("conv-2", input, gw);
		const c = await confirmOffer("conv-2", gw);
		expect(c.consortiumProposalLink).toContain("uselink.me");
		expect(c.documentsLinkPersonal).toContain("uselink.me");
		expect(store.get("conv-2")?.proposalStatus).toBe("documentos");
		expect(store.get("conv-2")?.consortiumProposalLink).toContain("uselink.me");
	});

	it("uploadContractDocument: ok com mock; depois de confirmar a oferta", async () => {
		const gw = new MockProposalGateway();
		await startContract("conv-3", input, gw);
		await confirmOffer("conv-3", gw);
		const up = await uploadContractDocument(
			"conv-3",
			{
				slot: "identidade_frente",
				file: new Uint8Array([1]),
				filename: "rg.jpg",
				mimeType: "image/jpeg",
			},
			gw,
		);
		expect(up.ok).toBe(true);
	});

	it("uploadContractDocument: upload falho → fallback pro link (docs opcionais)", async () => {
		const gw = new MockProposalGateway();
		await startContract("conv-4", input, gw);
		await confirmOffer("conv-4", gw);
		const throwingGw = new MockProposalGateway();
		throwingGw.uploadDocument = async () => {
			throw new Error("anti-bot");
		};
		const up = await uploadContractDocument(
			"conv-4",
			{
				slot: "identidade_frente",
				file: new Uint8Array([1]),
				filename: "rg.jpg",
				mimeType: "image/jpeg",
			},
			throwingGw,
		);
		expect(up.ok).toBe(false);
		expect(up.fallbackLink).toContain("uselink.me");
	});

	it("confirmOffer sem proposta → erro claro", async () => {
		await expect(confirmOffer("conv-inexistente", new MockProposalGateway())).rejects.toThrow(
			/Nenhuma proposta/i,
		);
	});

	// EC-7 (QA crítico 2026-06-02): duplo-clique em "Continuar com segurança" criava
	// 2 propostas na administradora (handler sem idempotência). Re-submit numa conversa
	// com proposta 'simulacao' pendente DEVE reusar a proposta, não criar outra.
	it("EC-7: duplo-submit reusa a proposta 'simulacao' pendente (idempotente por conversa)", async () => {
		const gw = new MockProposalGateway();
		const createSpy = vi.spyOn(gw, "createProposal");
		const r1 = await startContract("conv-ec7", input, gw);
		const r2 = await startContract("conv-ec7", input, gw); // duplo-submit
		expect(createSpy, "só UMA proposta criada na administradora").toHaveBeenCalledTimes(1);
		expect(r2.proposalId, "mesma proposta reusada").toBe(r1.proposalId);
		expect(r2.offer, "ainda devolve a oferta pra confirmar").toBeTruthy();
		// só 1 linha persistida pra conversa
		expect(store.get("conv-ec7")?.proposalId).toBe(r1.proposalId);
	});

	it("EC-7: após confirmar (status documentos), novo contract cria proposta nova", async () => {
		const gw = new MockProposalGateway();
		const createSpy = vi.spyOn(gw, "createProposal");
		await startContract("conv-ec7b", input, gw);
		await confirmOffer("conv-ec7b", gw); // status vira 'documentos'
		await startContract("conv-ec7b", input, gw); // recontratar → nova proposta
		expect(createSpy, "reuso só vale enquanto status='simulacao'").toHaveBeenCalledTimes(2);
	});

	// FIX-112 (uso manual Kairo, PROD, 2026-06-30): o passo documento atingia o
	// usuário SEM links (a oferta não fora confirmada). A API da Bevi dá 400 em
	// getDocumentLinks ANTES do chooseOffer ("disponível após a escolha"). Estes
	// locks garantem a ordem e o gate de links — quebrar a ordem reintroduz o 400.
	it("FIX-112: confirmOffer chama chooseOffer ANTES de getDocumentLinks (ordem é o gate)", async () => {
		const gw = new MockProposalGateway();
		await startContract("conv-order", input, gw);
		const calls: string[] = [];
		const origChoose = gw.chooseOffer.bind(gw);
		const origLinks = gw.getDocumentLinks.bind(gw);
		vi.spyOn(gw, "chooseOffer").mockImplementation(async (a) => {
			calls.push("choose");
			return origChoose(a);
		});
		vi.spyOn(gw, "getDocumentLinks").mockImplementation(async (a) => {
			calls.push("links");
			return origLinks(a);
		});
		await confirmOffer("conv-order", gw);
		expect(calls).toEqual(["choose", "links"]);
	});

	// FIX-259 (rodada 5, veredito Fable r4, P1 #2): o catálogo do fechamento pode
	// não ter a administradora confirmada na faixa — pickClosestOffer cai pro
	// global best (BUG-ADMIN-TROCADA-NO-FECHAMENTO em forma nova). O caller
	// PRECISA saber que trocou, pra nunca fechar em silêncio (aviso em código).
	it("FIX-259: administradora confirmada indisponível na faixa → administradoraChanged=true + previousAdministradora preservada", async () => {
		const gw = new MockProposalGateway();
		// MockProposalGateway só devolve ANCORA/RODOBENS/ITAU (ADMINS.slice(0,3)) —
		// BANCO DO BRASIL nunca está na faixa simulada, força o fallback global.
		const r = await startContract(
			"conv-adm-troca",
			{ ...input, administradoraPreferida: "BANCO DO BRASIL" },
			gw,
		);
		expect(r.administradoraChanged).toBe(true);
		expect(r.previousAdministradora).toBe("BANCO DO BRASIL");
		expect(r.offer?.administradora).not.toBe("BANCO DO BRASIL");
	});

	it("FIX-259: administradora confirmada disponível na faixa → administradoraChanged=false (sem aviso falso)", async () => {
		const gw = new MockProposalGateway();
		const r = await startContract("conv-adm-ok", { ...input, administradoraPreferida: "ITAU" }, gw);
		// FIX-265 (menor #1): partnerOfferToRealOffer normaliza o código cru da
		// Bevi ("ITAU") pro nome exibível acentuado (ITAÚ) — a copy do fecho
		// nunca mais fala o nome sem acento.
		expect(r.offer?.administradora).toBe("ITAÚ");
		expect(r.administradoraChanged).toBeFalsy();
		expect(r.previousAdministradora ?? null).toBeNull();
	});

	it("FIX-259: comparação de administradora ignora acento/caixa (ITAÚ ~ itau)", async () => {
		const gw = new MockProposalGateway();
		const r = await startContract(
			"conv-adm-acento",
			{ ...input, administradoraPreferida: "itaú" },
			gw,
		);
		expect(r.offer?.administradora).toBe("ITAÚ");
		expect(r.administradoraChanged).toBeFalsy();
	});

	it("FIX-259: sem administradoraPreferida (caminho legado) → administradoraChanged nunca dispara", async () => {
		const gw = new MockProposalGateway();
		const r = await startContract("conv-adm-sem-pref", input, gw);
		expect(r.administradoraChanged).toBeFalsy();
	});

	it("FIX-112: uploadContractDocument SEM oferta confirmada (sem links) lança gate", async () => {
		const gw = new MockProposalGateway();
		await startContract("conv-nolinks", input, gw); // proposta criada, NÃO confirmada → sem links
		await expect(
			uploadContractDocument(
				"conv-nolinks",
				{
					slot: "identidade_frente",
					file: new Uint8Array([1]),
					filename: "rg.jpg",
					mimeType: "image/jpeg",
				},
				gw,
			),
		).rejects.toThrow(/Sem links|finalize a escolha/i);
	});
});
