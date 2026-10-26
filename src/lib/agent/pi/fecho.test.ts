// O FECHO DO VENDEDOR LIVRE — o que a proposta leva e o que o estado guarda.
//
// Cada bloco aqui reproduz uma lacuna medida em /tmp/aja-dono/paridade-310e.md:
// as condições da carta ESCOLHIDA (L01), o lead vinculado (L03), o fechamento
// concluído (L09), o `offer-confirm` do WhatsApp (L13), o celular validado
// (L34/N06) e o `recommendedOffer` que a retomada lê (L37).

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// As funções provadas aqui são puras; o módulo importa o banco no topo.
vi.mock("@/db", () => ({ db: {} }));

import type { ConversationMetadata } from "@/lib/agent/personas";
import { fechoJaConcluido } from "@/lib/bevi/fulfillment";
import { celularDeFechamento } from "@/lib/whatsapp/identify-capture";
import { buildRetomadaDirective } from "@/lib/workers/retomada";
import {
	garantirLeadDoFecho,
	inputDoFecho,
	metaDepoisDaProposta,
	metaDoFecho,
} from "./tools-livres";

const CPF = "11144477735";

/** A meta de uma conversa que JÁ viu uma carta: é a armadilha do L01 — o builder
 * lê `contractOffer`, e era ESTA (a anterior) que chegava ao `startContract`.
 * Sem `recommendedOffer`: é o estado real do Pi hoje (`buscar_cartas` grava
 * categoria/faixa, não o snapshot recomendado — o L37). */
function metaComCartaAnterior(): ConversationMetadata {
	return {
		currentCategory: "auto",
		qualifyAnswers: { creditMax: 90_000 },
		contractOffer: {
			administradora: "RODOBENS",
			creditValue: 90_000,
			termMonths: 120,
			monthlyPayment: 1_100,
		},
	} as unknown as ConversationMetadata;
}

const CARTA_ESCOLHIDA = {
	groupId: "grupo-itau-92902",
	administradora: "ITAÚ",
	creditValue: 92_902,
	termMonths: 100,
};

describe("L01 — o fecho usa as condições da carta ESCOLHIDA agora", () => {
	it("prova o defeito: com a meta antiga o contrato sai com a cota anterior", () => {
		const input = inputDoFecho({
			meta: metaComCartaAnterior(),
			cpf: CPF,
			celular: "11987654321",
			leadId: "lead-1",
			registeredAdministradora: null,
		});
		expect(input.valor).toBe(90_000);
		expect(input.administradoraPreferida).toBe("RODOBENS");
		expect(input.prazoPreferido).toBe(120);
	});

	it("com a carta escolhida, crédito, administradora e prazo são os dela", () => {
		const meta = metaDoFecho({
			meta: metaComCartaAnterior(),
			escolhida: CARTA_ESCOLHIDA,
			falaDoCliente: "quero a da Itaú de 100 meses",
		});
		const input = inputDoFecho({
			meta,
			cpf: CPF,
			celular: "11987654321",
			leadId: "lead-1",
			registeredAdministradora: null,
		});

		expect(input.valor).toBe(92_902);
		expect(input.valorVisto).toBe(92_902);
		expect(input.administradoraPreferida).toBe("ITAÚ");
		expect(input.prazoPreferido).toBe(100);
	});

	it("o aceite da LGPD é gravado uma vez e não é sobrescrito", () => {
		const primeiro = metaDoFecho({
			meta: metaComCartaAnterior(),
			escolhida: CARTA_ESCOLHIDA,
			falaDoCliente: "pode usar meus dados",
		});
		expect(primeiro.lgpdAceite?.fala).toBe("pode usar meus dados");

		const segundo = metaDoFecho({
			meta: primeiro,
			escolhida: CARTA_ESCOLHIDA,
			falaDoCliente: "outra coisa",
		});
		expect(segundo.lgpdAceite?.fala).toBe("pode usar meus dados");
	});
});

describe("L34/N06 — o celular do fecho é o validado, não o cru", () => {
	it("o cru com DDI/formatação não é o que vai à Bevi", () => {
		const celularCru = "+55 (11) 98765-4321";
		const celular = celularDeFechamento({ waId: "5511987654321", cpf: CPF, celular: celularCru });
		expect(celular.ok).toBe(true);
		if (!celular.ok) return;

		const comCru = inputDoFecho({
			meta: metaComCartaAnterior(),
			cpf: CPF,
			celular: celularCru,
			leadId: null,
			registeredAdministradora: null,
		});
		const comValidado = inputDoFecho({
			meta: metaComCartaAnterior(),
			cpf: CPF,
			celular: celular.celular,
			leadId: null,
			registeredAdministradora: null,
		});

		expect(comCru.celular).toBe(celularCru);
		expect(comValidado.celular).toBe("11987654321");
	});

	it("o simulador sem par de teste não chega a montar o input (recusa antes)", () => {
		const celular = celularDeFechamento({
			waId: "SIM-be27b2e8-3b1d-4702-92c1-87832589bfa9",
			cpf: CPF,
			celular: "62908872753",
		});
		// Sem par de teste no ambiente o fecho para; com par, o número é o do par.
		if (celular.ok) expect(celular.celular).not.toBe("62908872753");
		else expect(celular.motivo).toBe("falta-o-par-de-teste");
	});
});

describe("L03 — a proposta nasce vinculada ao lead, com o telefone da identidade", () => {
	it("sem lead na conversa: cria o lead com o celular do fecho", async () => {
		const criados: unknown[] = [];
		const leadId = await garantirLeadDoFecho(
			{ conversationId: "conv-1", celular: "11987654321", nome: "Ana" },
			{
				lerLead: async () => null,
				criarLead: async (args) => {
					criados.push(args);
					return "lead-novo";
				},
			},
		);

		expect(leadId).toBe("lead-novo");
		expect(criados).toEqual([{ conversationId: "conv-1", name: "Ana", phone: "11987654321" }]);
	});

	it("lead existente sem telefone: grava o telefone da identidade", async () => {
		const gravados: unknown[] = [];
		const leadId = await garantirLeadDoFecho(
			{ conversationId: "conv-1", celular: "11987654321", nome: "Ana" },
			{
				lerLead: async () => ({ id: "lead-1", phone: null, name: "Ana" }),
				gravarTelefone: async (args) => {
					gravados.push(args);
				},
			},
		);

		expect(leadId).toBe("lead-1");
		expect(gravados).toEqual([
			{ leadId: "lead-1", conversationId: "conv-1", phone: "11987654321", nome: "Ana" },
		]);
	});

	it("lead que já tem o telefone: não regrava, só devolve o id", async () => {
		const gravados: unknown[] = [];
		const leadId = await garantirLeadDoFecho(
			{ conversationId: "conv-1", celular: "11987654321", nome: "Ana" },
			{
				lerLead: async () => ({ id: "lead-1", phone: "11987654321", name: "Ana" }),
				gravarTelefone: async (args) => {
					gravados.push(args);
				},
			},
		);

		expect(leadId).toBe("lead-1");
		expect(gravados).toEqual([]);
	});

	it("telefone já gravado em outra formatação também não é regravado", async () => {
		const gravados: unknown[] = [];
		const leadId = await garantirLeadDoFecho(
			{ conversationId: "conv-1", celular: "11987654321", nome: "Ana" },
			{
				lerLead: async () => ({ id: "lead-1", phone: "+55 11 98765-4321", name: "Ana" }),
				gravarTelefone: async (args) => {
					gravados.push(args);
				},
			},
		);

		expect(leadId).toBe("lead-1");
		expect(gravados).toEqual([]);
	});

	it("falha do banco não derruba o fecho: devolve null e a proposta segue", async () => {
		const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const leadId = await garantirLeadDoFecho(
			{ conversationId: "conv-1", celular: "11987654321", nome: null },
			{
				lerLead: async () => {
					throw new Error("db fora");
				},
			},
		);
		expect(leadId).toBeNull();
		erro.mockRestore();
	});
});

describe("L09 — fechamento concluído não abre outra proposta", () => {
	it("conversa fechada manda recusar", () => {
		expect(fechoJaConcluido({ contractClosed: true, proposalStatus: null })).toBe(true);
	});

	it("proposta que saiu da simulação manda recusar", () => {
		for (const status of ["documentos", "proposta_enviada", "em_assinatura", "assinada"]) {
			expect(fechoJaConcluido({ proposalStatus: status })).toBe(true);
		}
	});

	it("proposta ainda em simulação (ou nenhuma) libera o fecho", () => {
		expect(fechoJaConcluido({ proposalStatus: "simulacao" })).toBe(false);
		expect(fechoJaConcluido({ proposalStatus: null })).toBe(false);
		expect(fechoJaConcluido({})).toBe(false);
	});
});

describe("L13/L37 — o estado depois da proposta real", () => {
	const OFERTA = {
		administradora: "ITAÚ",
		grupo: "grupo-itau-real",
		creditValue: 92_902,
		monthlyPayment: 1_450,
		termMonths: 100,
	};

	it("a cota REAL vira o recommendedOffer que a retomada lê", () => {
		const meta = metaDepoisDaProposta({
			meta: metaDoFecho({
				meta: metaComCartaAnterior(),
				escolhida: CARTA_ESCOLHIDA,
				falaDoCliente: "pode fechar",
			}),
			channel: "web",
			offer: OFERTA,
		});

		expect(meta.recommendedOffer?.creditValue).toBe(92_902);
		expect(meta.recommendedOffer?.monthlyPayment).toBe(1_450);
		expect(meta.recommendedAdministradora).toBe("ITAÚ");

		const retomada = buildRetomadaDirective(meta, { minutosParado: 40, channel: "web" });
		expect(retomada).toContain("R$ 92.902");
		expect(retomada).not.toContain("ainda não viu nenhuma oferta");
	});

	it("sem a gravação a retomada diz que o cliente não viu oferta — é o defeito", () => {
		const retomada = buildRetomadaDirective(metaComCartaAnterior(), {
			minutosParado: 40,
			channel: "web",
		});
		expect(retomada).toContain("ainda não viu nenhuma oferta");
	});

	it("no WhatsApp arma o offer-confirm, para o aceite por TEXTO finalizar", () => {
		const meta = metaDepoisDaProposta({
			meta: metaComCartaAnterior(),
			channel: "whatsapp",
			offer: OFERTA,
		});
		expect(meta.contractCollection?.stage).toBe("offer-confirm");
	});

	it("na web não arma estágio de WhatsApp", () => {
		const meta = metaDepoisDaProposta({
			meta: metaComCartaAnterior(),
			channel: "web",
			offer: OFERTA,
		});
		expect(meta.contractCollection).toBeUndefined();
	});
});

describe("a tool usa estas peças na ordem certa", () => {
	const fonte = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
	const posicao = (trecho: string) => {
		const i = fonte.indexOf(trecho);
		expect(i).toBeGreaterThan(-1);
		return i;
	};

	it("o guard do fechamento concluído vem antes de abrir a proposta", () => {
		expect(posicao("fechoJaConcluido({")).toBeLessThan(posicao("startContract("));
	});

	it("o lead é resolvido antes do startContract e o id vai no input", () => {
		expect(posicao("garantirLeadDoFecho({")).toBeLessThan(posicao("startContract("));
		expect(fonte).toMatch(/leadId,\s*\n\s*registeredAdministradora/);
	});

	it("o startContract recebe a meta COM a carta escolhida", () => {
		expect(posicao("metaDoFecho({")).toBeLessThan(posicao("startContract("));
		expect(fonte).toMatch(/meta: metaDaProposta/);
	});

	it("o estado pós-proposta é gravado depois do startContract", () => {
		expect(posicao("metaDepoisDaProposta({")).toBeGreaterThan(posicao("startContract("));
	});
});
