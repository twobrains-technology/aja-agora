import { beforeEach, describe, expect, it, vi } from "vitest";

// F4 (testador no dev, conversa dfd69823): o clique "Confirmar" do `contract_form`
// era o aceite só na fala. `fireContract` ia direto à Bevi com `lgpd: true` fixo e
// nada registava o consentimento — consulta de bureau sem `metadata.lgpdAceite`.
// O botão só existe no corpo que carrega o aviso, então o clique responde a ele:
// agora o clique grava `lgpdAceite` (mesmo formato de `metaDoFecho`) e dispara.

const estado = vi.hoisted(() => ({
	meta: {} as Record<string, unknown>,
	passo: [] as string[],
	persistido: [] as Record<string, unknown>[],
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
vi.mock("./session", () => ({
	getOrCreateConversation: vi.fn(async () => ({ id: "conv-1", isNew: false })),
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: vi.fn(async () => "msg-1") }));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: (conv: { metadata: unknown } | null | undefined) =>
		(conv?.metadata ?? {}) as Record<string, unknown>,
	persistMeta: vi.fn(async (_convId: string, meta: Record<string, unknown>) => {
		estado.persistido.push({ ...meta });
		estado.meta = { ...meta };
	}),
}));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async (_to: string, texto: string) => {
		estado.passo.push(`texto:${texto}`);
		return { messageId: "wamid-1" };
	}),
	sendInteractiveMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
}));
// O que é trocado aqui é a I/O pesada (Bevi). `aceiteDoDisparo` continua o real — é
// o formato do registro que este teste confere, e ele mora em `contract-capture.ts`.
vi.mock("./contract-capture", async (importOriginal) => ({
	...(await importOriginal<typeof import("./contract-capture")>()),
	fireContract: vi.fn(async () => {
		estado.passo.push("fecho:fireContract");
	}),
}));

const clicar = async (replyId: string, replyTitle: string, meta: Record<string, unknown>) => {
	estado.meta = { ...meta };
	estado.passo.length = 0;
	estado.persistido.length = 0;
	const { dispatchInteractiveReply } = await import("./interactive-handlers");
	await dispatchInteractiveReply({
		from: "5511987654321",
		replyId,
		replyTitle,
		processTextMessage: vi.fn(async () => {}),
	});
	return estado;
};

describe("o clique que fecha o contrato registra o aceite da LGPD", () => {
	beforeEach(() => {
		estado.meta = {};
		estado.passo.length = 0;
		estado.persistido.length = 0;
	});

	it("contract_confirm: grava lgpdAceite com a fala do botão e dispara", async () => {
		const { ACK_CONFIRMACAO_CONTRATO } = await import("./interactive-handlers");
		const passos = await clicar("contract_confirm", "Confirmar", {
			contractCollection: { stage: "confirm", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		});
		const aceite = passos.persistido.at(-1)?.lgpdAceite as { em: string; fala: string };
		expect(aceite).toBeTruthy();
		expect(aceite.fala).toBe("botão: Confirmar");
		expect(new Date(aceite.em).toISOString()).toBe(aceite.em);
		expect(passos.passo).toEqual([`texto:${ACK_CONFIRMACAO_CONTRATO}`, "fecho:fireContract"]);
	});

	it("um aceite já gravado não é sobrescrito pelo clique", async () => {
		await clicar("contract_confirm", "Confirmar", {
			lgpdAceite: { em: "2026-10-25T11:00:00.000Z", fala: "pode usar meus dados" },
			contractCollection: { stage: "confirm", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		});
		expect((estado.persistido.at(-1)?.lgpdAceite as { fala: string }).fala).toBe(
			"pode usar meus dados",
		);
	});

	it("sem o aviso gravado, o clique não fabrica aceite — é o aviso que falta", async () => {
		const passos = await clicar("contract_confirm", "Confirmar", {
			contractCollection: { stage: "confirm" },
		});
		expect(passos.persistido.at(-1)?.lgpdAceite).toBeUndefined();
	});
});
