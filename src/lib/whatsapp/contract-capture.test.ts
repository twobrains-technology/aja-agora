import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { AVISO_LGPD_RE } from "@/lib/agent/pi/lgpd";
import { metaDoFecho } from "@/lib/agent/pi/tools-livres";
import {
	decryptIdentity,
	maskCpf,
	type StoredIdentity,
	storeIdentity,
} from "@/lib/conversation/identity";
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

/** P288 — o aceite é o comprovante, não o número. O único lugar onde o CPF pode
 * existir persistido é `identityEnc` (cifrado): uma segunda cópia em claro no meta
 * derrotaria a criptografia. O teste fecha as duas formas do mesmo número — com
 * pontuação e só dígitos — sobre o objeto que `persistMeta` recebe. */
const CPF_EM_CLARO = "52998224725";
function semCpfEmClaro(objeto: unknown): void {
	expect(JSON.stringify(objeto) ?? "").not.toContain(CPF_EM_CLARO);
}

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
//
// O dublê de `storeIdentity` NÃO pode ser no-op (R12-2): ele escreve `identityEnc` e
// `identityCollected` por `persistMeta`, e é justamente aí que o snapshot anterior à
// captura pode apagá-los (P187). Um no-op escondia a perda, e `loadIdentity` sempre
// devolvendo identidade escondia o outro lado — sem `identityEnc` o disparo volta a
// pedir CPF e não chama a Bevi. Os dois continuam os reais, lidos pelo mesmo meta em
// memória que o mock de `persistMeta` escreve.
vi.mock("@/lib/conversation/identity", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/conversation/identity")>();
	const metaModule = await import("@/lib/conversation/meta");
	return {
		...real,
		storeIdentity: vi.fn(async (convId: string, identity: StoredIdentity) => {
			// `attachContact` é I/O de fora deste teste; o que importa é a escrita no meta.
			const fresca = await metaModule.reloadMeta(convId);
			await metaModule.persistMeta(convId, {
				...fresca,
				identityCollected: real.isCompleteIdentity(identity),
				identityEnc: real.encryptIdentity(identity),
			});
		}),
	};
});
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
		// P288: o registro continua sendo a fala do cliente, mas mascarada — nenhum CPF
		// completo no meta, com ou sem pontuação. O que o atendente lê é `***.***.247-25`.
		expect(estado.meta.lgpdAceite?.fala).toBe(maskCpf("529.982.247-25"));
		semCpfEmClaro(estado.meta);
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
		// A identidade on file é fato de conversa, não concessão do mock: entra pelo
		// mesmo `storeIdentity` fiel (P187) — era ele que o dublê no-op escondia.
		await storeIdentity("conv-1", { cpf: CPF_EM_CLARO, celular: "5511987654321" });
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
		await storeIdentity("conv-1", { cpf: CPF_EM_CLARO, celular: "5511987654321" });
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
		// P288: a fala é comprovante mascarado, não o número. O mesmo `scrubCpf` que
		// protege a fala do cliente protege o registro.
		const aceite = aceiteDoDisparo(meta, "meu cpf é 529.982.247-25");
		expect(aceite?.fala).toBe(`meu cpf é ${maskCpf("529.982.247-25")}`);
		semCpfEmClaro(aceite);
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

// P288 — os dois pontos que escrevem `lgpdAceite.fala` (o `aceiteDoDisparo` do
// WhatsApp e o `metaDoFecho` do vendedor livre) gravam comprovante, não número.
// Este é o teste que morde a garantia: tirar `scrubCpf` dos dois vermelha.
describe("P288 — o aceite persistido nunca leva CPF em claro", () => {
	beforeEach(() => {
		estado.meta = {};
	});

	it("`metaDoFecho` (o vendedor livre) mascara a fala que contém o CPF", () => {
		const meta = metaDoFecho({
			meta: metaBase,
			escolhida: {
				groupId: "grupo-1",
				administradora: "ITAÚ",
				creditValue: 92_902,
				termMonths: 100,
			},
			falaDoCliente: "meu cpf é 529.982.247-25, pode usar meus dados",
		});
		expect(meta.lgpdAceite?.fala).toBe(
			`meu cpf é ${maskCpf("529.982.247-25")}, pode usar meus dados`,
		);
		semCpfEmClaro(meta);
	});

	// P288 (reauditoria 13) — o contraexemplo que ainda abria a linha: dois números na
	// mesma fala, CPF e celular separados só por espaço. O candidato guloso de
	// `vazamento.ts` engolia os dois, o DV não fechava nos 18 dígitos e a fala era
	// persistida com o CPF em claro.
	it("no stage `cpf`, CPF e telefone vizinhos não entram no meta gravado", async () => {
		estado.meta = {
			...metaBase,
			contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const fala = "529.982.247-25 11 98765-4321";
		const { captureContractText } = await import("./contract-capture");
		const resultado = await captureContractText("5511987654321", fala);
		expect(resultado).toEqual({ handled: true, outcome: "fire" });
		// P288 (rodada 14): o comprovante não guarda número. O telefone vizinho sai junto — a
		// garantia do registro é a fala SEM número, não o número legível — e os 5 dígitos que
		// `maskCpf` deixa visíveis somem com ele, porque formam um trecho de 16 dígitos com o
		// celular na sequência. CPF sozinho continua `***.***.247-25` (teste acima).
		expect(estado.meta.lgpdAceite?.fala).toBe("***.***.[número omitido]");
		const gravado = JSON.stringify(estado.meta) ?? "";
		semCpfEmClaro(gravado);
		expect(gravado).not.toContain("529.982.247-25");
		// A identidade continua guardada, e a única cópia persistida é a CIFRADA —
		// mascarar a fala não pode perder o CPF que `storeIdentity` acabou de cifrar.
		expect(estado.meta.identityEnc).toContain("v1.");
		expect(decryptIdentity(estado.meta.identityEnc ?? "").cpf).toBe(CPF_EM_CLARO);
	});

	it("a fala longa é cortada em 200 chars depois de mascarar, e continua sem CPF", async () => {
		const { aceiteDoDisparo } = await import("./contract-capture");
		const fala = `529.982.247-25 ${"a".repeat(250)}`;
		const aceite = aceiteDoDisparo(
			{
				...metaBase,
				contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
			},
			fala,
		);
		expect(aceite?.fala).toHaveLength(200);
		semCpfEmClaro(aceite);
	});
});

// P288 (rodada 14) — o comprovante gravado, conferido no OBJETO que `persistMeta` recebe.
// As falas abaixo têm CPF com separadores que o molde por regex não alcança (espaço em volta
// do hífen, barra) e número na sequência. A garantia é POR TRECHO numérico: nenhum com 8+ dígitos
// — assim `R$ 60.000` continua legível e o telefone/CPF do cliente não ficam persistidos fora da
// identidade cifrada. O teste morde: tirar `comprovanteDeAceite` e voltar para o `scrubCpf`
// sozinho deixa `52998224725` no meta gravado.
describe("P288 (rodada 14) — o aceite gravado não leva CPF nem número de 8+ dígitos", () => {
	beforeEach(() => {
		estado.meta = {};
		estado.textos.length = 0;
		estado.chamadasStartContract.length = 0;
	});

	// Contado por trecho, não pelo total: um meta com `R$ 60.000 em 114 meses` tem 12 dígitos
	// somados e nenhum trecho de 8+.
	function maiorTrechoNumérico(texto: string): number {
		let max = 0;
		for (const trecho of texto.match(/\d[\d.\-\s/]*\d|\d/g) ?? []) {
			const digitos = [...trecho].filter((c) => c >= "0" && c <= "9").length;
			if (digitos > max) max = digitos;
		}
		return max;
	}

	// O `identityEnc` não se confere por trecho numérico: é base64url e pode ter 11 dígitos por
	// acaso — é a única cópia que deve existir, e está cifrada. O que não pode ter número em claro
	// é o comprovante.
	const falas = [
		"sim, 529.982.247 - 25 11 98765-4321",
		"sim, meu CPF é 52998224725 11987654321",
		"sim, meu cpf é 529 . 982 . 247 - 25 11987654321",
		"sim, meu cpf é 529/982/247-25, pode usar meus dados",
		"sim, 11987654321529.982.247-25",
		"sim, 11 98765-4321 é o telefone e 52998224725 é o cpf",
		"sim, 529.982.247-25 11 98765-4321",
	];

	for (const fala of falas) {
		it(`o meta gravado de "${fala}" não contém CPF nem número de 8+ dígitos`, async () => {
			estado.meta = {
				...metaBase,
				contractCollection: { stage: "confirm", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
			};
			const { captureContractText } = await import("./contract-capture");
			const resultado = await captureContractText("5511987654321", fala);
			expect(resultado).toEqual({ handled: true, outcome: "fire" });
			const gravado = JSON.stringify(estado.meta) ?? "";
			semCpfEmClaro(gravado);
			expect(gravado).not.toContain("529.982.247-25");
			expect(gravado).not.toContain("529.982.247 - 25");
			// O número se confere na FALA: `em` é o instante ISO do registro e tem 8 dígitos
			// na data (`2026-10-25`) — não é o dado do cliente, e o comprovante não guarda número.
			expect(maiorTrechoNumérico(estado.meta.lgpdAceite?.fala ?? "")).toBeLessThan(8);
			// A fala do cliente continua registrada — o que sai é o número, não o aceite.
			expect(estado.meta.lgpdAceite?.fala).toContain("sim");
		});
	}

	// O outro ponto que escreve o comprovante: `metaDoFecho` do vendedor livre.
	it("`metaDoFecho` (rodada 14) grava o comprovante sem número", () => {
		const meta = metaDoFecho({
			meta: metaBase,
			escolhida: {
				groupId: "grupo-1",
				administradora: "ITAÚ",
				creditValue: 92_902,
				termMonths: 100,
			},
			falaDoCliente: "sim, 529.982.247 - 25 11 98765-4321",
		});
		expect(meta.lgpdAceite?.fala).toBe("sim, ***.***.[número omitido]");
		expect(maiorTrechoNumérico(meta.lgpdAceite?.fala ?? "")).toBeLessThan(8);
	});
});

// P187 — a captura no estágio `cpf` grava a identidade cifrada e o aceite na MESMA
// sequência de turnos. `persistMeta` substitui a coluna inteira: repersistir o
// snapshot anterior à captura apagava `identityEnc`/`identityCollected`, e o disparo
// voltava a pedir CPF em vez de criar a proposta. Este teste usa o `storeIdentity`
// fiel (dublê que escreve no meta) — com o no-op antigo ele não morde nada.
describe("P187 — o registro do aceite não apaga a identidade recém-capturada", () => {
	beforeEach(() => {
		estado.meta = {};
		estado.textos.length = 0;
		estado.chamadasStartContract.length = 0;
	});

	function identidadeGuardada(): StoredIdentity | null {
		if (!estado.meta.identityEnc) return null;
		return decryptIdentity(estado.meta.identityEnc);
	}

	it("captura seguida de `fireContract`: a identidade continua e a proposta é criada", async () => {
		// O contraexemplo da auditoria: conversa SEM identidade on file (por isso o
		// `contract_form` abriu o estágio `cpf` com aviso), e o cliente responde o CPF.
		estado.meta = {
			...metaBase,
			contractCollection: { stage: "cpf", avisoLgpdEm: "2026-10-25T12:00:00.000Z" },
		};
		const { captureContractText, fireContract } = await import("./contract-capture");
		const resultado = await captureContractText("5511987654321", "529.982.247-25");
		expect(resultado).toEqual({ handled: true, outcome: "fire" });

		// A identidade que `storeIdentity` acabou de cifrar não pode sumir na escrita
		// seguinte (o aceite), que era o snapshot ANTERIOR à captura.
		expect(estado.meta.identityCollected).toBe(true);
		expect(identidadeGuardada()?.cpf).toBe(CPF_EM_CLARO);

		await fireContract("5511987654321", "conv-1");
		// Sem identidade o disparo cai no `CONTRACT_CPF_PROMPT` e nunca chama a Bevi —
		// é o sinal de que o aceite apagou a identidade.
		expect(estado.chamadasStartContract).toEqual(["conv-1"]);
		expect(identidadeGuardada()?.cpf).toBe(CPF_EM_CLARO);
	});
});
