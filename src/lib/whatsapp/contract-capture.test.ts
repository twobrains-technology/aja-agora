import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { AVISO_LGPD_RE } from "@/lib/agent/pi/lgpd";
import { decidirCpfDoTexto } from "@/lib/conversation/telefone-ou-cpf";

// O módulo importa o banco; o mock dele está mais abaixo, junto do estado que o
// caminho determinístico do fechamento escreve.

describe("o aceite da carta REAL por texto finaliza como o botão", () => {
	it("'sim', 'pode fechar' e 'confirmo' finalizam", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		for (const fala of ["sim", "pode fechar", "confirmo", "pode seguir, confirmado"]) {
			expect(decideOfferConfirmStage(fala)).toEqual({ handled: true, outcome: "finalize" });
		}
	});

	it("pergunta e dúvida NÃO finalizam — vão pro modelo", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		expect(decideOfferConfirmStage("e se eu quiser contemplar no mês 20?")).toEqual({
			handled: false,
		});
		expect(decideOfferConfirmStage("essa parcela é fixa?")).toEqual({ handled: false });
	});

	it("recusa continua recusando (não vira fecho)", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		expect(decideOfferConfirmStage("quero ver outras opções")).toEqual({
			handled: true,
			outcome: "cancel",
		});
	});

	it("o estágio 'confirm' segue disparando a proposta (fire), não finalizando", async () => {
		const { decideConfirmStage } = await import("./contract-capture");
		expect(decideConfirmStage("pode fechar")).toEqual({ handled: true, outcome: "fire" });
	});
});

describe("o estágio do CPF aplica a regra ÚNICA de 'tentativa de CPF'", () => {
	it("CPF com DV válido dispara a proposta", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("meu cpf é 529.982.247-25")).toEqual({
			handled: true,
			outcome: "fire",
			cpf: "52998224725",
		});
	});

	it("o número ambíguo 11900000083 é CPF aqui: o agente acabou de pedir", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		// Celular de SP (DDD 11 + 9º dígito) que TAMBÉM passa no DV do CPF. O estágio
		// `cpf` só existe depois do pedido, então o número é resposta ao pedido — a
		// mesma leitura da `main` e da regra única com `pedidoDeCpf: true`.
		expect(decideCpfStage("11900000083")).toEqual({
			handled: true,
			outcome: "fire",
			cpf: "11900000083",
		});
		expect(decidirCpfDoTexto("11900000083", { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: "11900000083",
		});
	});

	it("tentativa de CPF com DV errado responde 'não confere' em vez de ir pro modelo", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("11987654321")).toEqual({ handled: true, outcome: "invalid-cpf" });
		expect(decideCpfStage("111.444.777-36")).toEqual({ handled: true, outcome: "invalid-cpf" });
	});

	it("quem RECUSA o CPF e dita o telefone não dispara a proposta nem ouve 'não confere'", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		// `11900000083` é celular de SP E passa no DV do CPF. Dito como telefone na
		// mesma fala que nega o CPF, ele não é o CPF da proposta: fica `handled: false`
		// (o modelo responde), em vez de `fire` (proposta com o telefone como CPF) ou
		// `invalid-cpf` (manda "confere os números" pra quem não mandou número nenhum).
		expect(decideCpfStage("não tenho cpf, meu telefone é 11900000083")).toEqual({
			handled: false,
		});
		expect(decideCpfStage("não tenho CPF. meu celular é 11 90000-0083")).toEqual({
			handled: false,
		});
	});

	it("o que não tem cara de CPF segue pro modelo", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("vocês atendem em Curitiba?")).toEqual({ handled: false });
		expect(decideCpfStage("tá caro, quero um de 80 mil")).toEqual({ handled: false });
	});
});

// F4 (testador no dev, conversa dfd69823): no WhatsApp o `contract_form` sem
// identidade pedia o CPF com um "(LGPD)" genérico. O cliente mandava o CPF e o
// caminho determinístico criava a proposta — consulta de bureau com `lgpd: true`
// fixo, sem aviso canônico e sem `metadata.lgpdAceite`. Na main o aviso vinha
// SEMPRE antes do pedido (`identify-capture.ts:23-42`, a2bc3024) e o CPF mandado
// depois era o consentimento por conduta.
//
// Os testes abaixo exercitam o caminho real que o `processor.ts` chama: o stage
// grava o INSTANTE do aviso junto dele, o disparo só acontece com aviso gravado
// ou aceite registrado, e o aceite é gravado no mesmo formato de `metaDoFecho`
// (`pi/tools-livres.ts:324`) — nunca sobrescrevendo um aceite já registrado.

// O meta do mock é TIPADO pelo tipo compartilhado de `personas.ts`, não solto:
// é assim que o teste morde o tipo. Se `avisoLgpdEm` não está na definição de
// `contractCollection` em `personas.ts`, os casos abaixo não compilam — era o
// único caminho escrever o campo por cast, e o tipo prometia menos do que o
// código escrevia (pendência de LGPDZAP, item 1, bloco TIPOLGPD).
const estado = vi.hoisted(() => ({
	meta: {} as ConversationMetadata,
	textos: [] as string[],
	chamadasStartContract: [] as string[],
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => ({ id: "conv-1", metadata: estado.meta })),
			},
		},
	},
}));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: (conv: { metadata: unknown } | null | undefined) =>
		(conv?.metadata ?? {}) as ConversationMetadata,
	persistMeta: vi.fn(async (_convId: string, meta: ConversationMetadata) => {
		estado.meta = { ...meta };
	}),
	reloadMeta: vi.fn(async () => ({ ...estado.meta })),
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: vi.fn(async () => "msg-1") }));
// Só a I/O de identidade é trocada: `isValidCpf` (o DV) continua o real, porque é
// ele que decide se o número é CPF no stage `cpf`.
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	storeIdentity: vi.fn(async () => {}),
	loadIdentity: vi.fn(async () => ({ cpf: "52998224725", celular: "5511987654321" })),
}));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async (_to: string, texto: string) => {
		estado.textos.push(texto);
		return { messageId: "wamid-1" };
	}),
	sendInteractiveMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
}));
vi.mock("@/lib/bevi/fulfillment", () => ({
	startContract: vi.fn(async (convId: string) => {
		estado.chamadasStartContract.push(convId);
		return { proposalId: "p-1", offer: null, noOffer: true };
	}),
}));
vi.mock("@/lib/bevi/proposal-repo", () => ({
	getLatestBeviProposal: vi.fn(async () => null),
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	getLeadIdForConversation: vi.fn(async () => null),
}));

const metaBase: ConversationMetadata = {
	currentCategory: "auto",
	revealCompleted: true,
};

describe("o aviso de LGPD é gravado antes de o CPF valer como proposta", () => {
	beforeEach(() => {
		estado.meta = {};
		estado.textos.length = 0;
		estado.chamadasStartContract.length = 0;
	});

	it("beginContractCollection grava o instante do aviso junto do stage", async () => {
		const { beginContractCollection } = await import("./contract-capture");
		const stage = await beginContractCollection("conv-1", {});
		expect(stage).toBe("cpf");
		// Lido PELO TIPO, sem cast: `avisoLgpdEm` é do tipo compartilhado.
		const aviso = estado.meta.contractCollection?.avisoLgpdEm;
		if (!aviso) throw new Error("o instante do aviso não está no tipo compartilhado");
		// Instante, não data solta: o registro do aceite é `{ em, fala }`.
		expect(new Date(aviso).toISOString()).toBe(aviso);
	});

	it("CPF válido no stage cpf dispara e o meta ganha lgpdAceite com a fala do cliente", async () => {
		estado.meta = {
			...metaBase,
			contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const { captureContractText } = await import("./contract-capture");
		const resultado = await captureContractText("5511987654321", "529.982.247-25");
		expect(resultado).toEqual({ handled: true, outcome: "fire" });
		expect(estado.meta.lgpdAceite).toBeTruthy();
		expect(estado.meta.lgpdAceite?.fala).toBe("529.982.247-25");
	});

	it("no stage confirm, o aceite explícito registra o lgpdAceite", async () => {
		estado.meta = {
			...metaBase,
			contractCollection: { stage: "confirm", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const { captureContractText } = await import("./contract-capture");
		const resultado = await captureContractText("5511987654321", "pode criar, sim");
		expect(resultado).toEqual({ handled: true, outcome: "fire" });
		expect(estado.meta.lgpdAceite?.fala).toBe("pode criar, sim");
	});

	it("um lgpdAceite já gravado não é sobrescrito pelo disparo", async () => {
		estado.meta = {
			...metaBase,
			lgpdAceite: { em: "2026-10-25T11:00:00.000Z", fala: "pode usar meus dados" },
			contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const { captureContractText } = await import("./contract-capture");
		await captureContractText("5511987654321", "529.982.247-25");
		expect(estado.meta.lgpdAceite?.fala).toBe("pode usar meus dados");
	});

	it("sem aviso gravado e sem aceite, o disparo NÃO chama a Bevi — responde o aviso de novo", async () => {
		estado.meta = { ...metaBase, contractCollection: { stage: "cpf" } };
		const { fireContract } = await import("./contract-capture");
		await fireContract("5511987654321", "conv-1");
		expect(estado.chamadasStartContract).toEqual([]);
		expect(estado.textos).toHaveLength(1);
		expect(AVISO_LGPD_RE.test(estado.textos[0])).toBe(true);
		expect(estado.textos[0]).toContain("CPF");
	});

	it("com o aviso gravado, o disparo segue criando a proposta (a trava não bloqueia o fecho)", async () => {
		estado.meta = {
			...metaBase,
			contractCollection: { stage: "confirm", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const { fireContract } = await import("./contract-capture");
		await fireContract("5511987654321", "conv-1");
		expect(estado.chamadasStartContract).toEqual(["conv-1"]);
	});

	it("com lgpdAceite já registrado, dispara mesmo sem o aviso nesta coleta", async () => {
		estado.meta = {
			...metaBase,
			lgpdAceite: { em: "2026-10-25T11:00:00.000Z", fala: "pode usar meus dados" },
			contractCollection: { stage: "confirm" },
		};
		const { fireContract } = await import("./contract-capture");
		await fireContract("5511987654321", "conv-1");
		expect(estado.chamadasStartContract).toEqual(["conv-1"]);
	});

	it("quem lê `contractCollection` pelo tipo compartilhado vê o instante do aviso", async () => {
		// Prova de tipo, não só de comportamento: `ConversationMetadata` é o que os
		// outros caminhos do fecho usam pra ler a coleta (`pi/tools-livres.ts`). Se
		// `avisoLgpdEm` só vivia no alias local de `contract-capture.ts`, este teste
		// não compilava (`pnpm -s typecheck`), e quem lê por fora não vê o FATO.
		const meta: ConversationMetadata = {
			...metaBase,
			contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		expect(meta.contractCollection?.avisoLgpdEm).toBe("2026-10-25T12:00:00.000Z");
		const { aceiteDoDisparo } = await import("./contract-capture");
		expect(aceiteDoDisparo(meta, "529.982.247-25")?.fala).toBe("529.982.247-25");
	});

	it("sem aviso gravado, o CPF que chega não fabrica aceite — o registro é do aviso", async () => {
		// O lado perigoso: registrar aceite por um número que respondeu a uma
		// mensagem que nunca disse o aviso derrotaria a trava do disparo.
		estado.meta = { ...metaBase, contractCollection: { stage: "cpf" } };
		const { captureContractText } = await import("./contract-capture");
		const resultado = await captureContractText("5511987654321", "529.982.247-25");
		expect(resultado).toEqual({ handled: true, outcome: "fire" });
		expect(estado.meta.lgpdAceite).toBeUndefined();
	});
});
