import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXTO_ERRO_DO_CHAT } from "@/lib/chat/stream-error";
import {
	chaveDoLimiteDeMensagens,
	formularioDeContratoFoiEnviado,
	groupIdDaCartaDoClique,
	respostaDeLimiteDeMensagens,
} from "./route";

describe("R5.6 — o limite de mensagens é da CONVERSA, com teto por IP", () => {
	it("a chave é a conversa: o mesmo IP em duas conversas não se atrapalha", () => {
		const a = chaveDoLimiteDeMensagens({
			conversationId: "conv-a",
			cookieDoCliente: "uid-1",
			ip: "1.2.3.4",
		});
		const b = chaveDoLimiteDeMensagens({
			conversationId: "conv-b",
			cookieDoCliente: "uid-1",
			ip: "1.2.3.4",
		});
		expect(a).toBe("conversa:conv-a");
		expect(b).toBe("conversa:conv-b");
		expect(a).not.toBe(b);
	});

	it("sem conversa ainda, a conta é a pessoa (cookie aja_uid)", () => {
		expect(
			chaveDoLimiteDeMensagens({ conversationId: null, cookieDoCliente: "uid-1", ip: "1.2.3.4" }),
		).toBe("aja_uid:uid-1");
	});

	it("sem conversa e sem cookie, cai no IP — que já tem o teto próprio", () => {
		expect(
			chaveDoLimiteDeMensagens({ conversationId: null, cookieDoCliente: null, ip: "1.2.3.4" }),
		).toBe("ip:1.2.3.4");
	});

	it("o 429 traz um corpo que a UI consegue MOSTRAR (código do conjunto fechado)", async () => {
		const res = respostaDeLimiteDeMensagens({ allowed: false, remaining: 0, retryAfterMs: 12_400 });
		const corpo = await res.text();
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("13");
		// O `useChat` transforma o corpo em `error.message` e a tela só mostra
		// banner para os códigos que ela conhece — texto livre do servidor morreria
		// em silêncio (era o caso do "Too many requests" em inglês).
		expect(TEXTO_ERRO_DO_CHAT[corpo as keyof typeof TEXTO_ERRO_DO_CHAT]).toMatch(
			/muitas mensagens/i,
		);
	});
});

describe("L02 — o submit do formulário de contrato exige que o formulário tenha saído", () => {
	it("sem a marca do card, o submit é recusado", () => {
		expect(formularioDeContratoFoiEnviado({})).toBe(false);
		expect(formularioDeContratoFoiEnviado({ contractFormDispatched: false })).toBe(false);
	});

	it("com a marca do card, o submit segue para a proposta real", () => {
		expect(formularioDeContratoFoiEnviado({ contractFormDispatched: true })).toBe(true);
	});
});

/** P112/P161/P179/P181 — o clique de fecho da web tem a CARTA em mãos e a
 * diretiva precisa do id LITERAL: é ele que faz o `contract_form` sair com a
 * `administradora` (o montador resolve a carta pelo id) e que o caminho curto
 * `fazer_proposta` usa, sem depender de o modelo copiar o id do histórico. */
describe("o clique de fecho da web leva o id da carta", () => {
	it("vale a cota RESOLVIDA contra os artifacts exibidos", () => {
		expect(groupIdDaCartaDoClique({ groupId: "grp-resolvido" }, "grp-do-card")).toBe(
			"grp-resolvido",
		);
	});

	it("sem cota resolvida, vale o id que o próprio card entregou", () => {
		expect(groupIdDaCartaDoClique(null, "grp-do-card")).toBe("grp-do-card");
	});

	it("sem nenhum dos dois, a diretiva pede a carta que está na tela", () => {
		expect(groupIdDaCartaDoClique(undefined, undefined)).toBeUndefined();
	});

	// A rota é um handler Next (banco, adapters, stream): não há harness de POST
	// aqui, então o que o teste prova em código é a LIGAÇÃO — que as duas
	// diretivas de fecho da rota recebem o id do clique.
	it("as duas diretivas de fecho da rota recebem o id", () => {
		const fonte = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
		const chamadas = [
			...fonte.matchAll(/build(?:ChooseOffer|AdvanceToContract)Directive\(\{[\s\S]*?\}\)/g),
		].map((m) => m[0]);
		expect(chamadas).toHaveLength(2);
		for (const chamada of chamadas) {
			expect(chamada).toContain("groupId: groupIdDaCartaDoClique(");
		}
	});
});

/**
 * GUARDA DE ENCANAMENTO — não é guarda de fala.
 *
 * Defeito medido na auditoria do sha `e2461a52` (R21 de 28/10 01:58:27Z): só dois avisos do
 * servidor saíam por `writeAndSaveTextComAviso`; os outros cinco saíam por `writeAndSaveText`, que
 * grava só texto — o turno do agente perguntava ("…me diz que quer seguir?") e o cliente ficava sem
 * nenhum botão. Nada aqui julga o TEXTO do aviso (ele não muda): o que se prova é a LIGAÇÃO — que
 * estes avisos continuam saindo pela variante que emite o toque.
 *
 * Sem harness de POST na rota, a prova é a fonte: para cada aviso, a chamada imediatamente antes do
 * literal tem de ser `writeAndSaveTextComAviso(`.
 */
describe("os avisos que perguntam saem com toque (encanamento)", () => {
	// O último entra pelo trecho final: o texto da rota interpola
	// `${existingProposal?.administradora}` e o `${` num literal comum vira aviso do biome.
	const AVISOS_SEM_TOQUE_DO_SHA_E2461A52 = [
		"Preciso do celular completo, com DDD — dá uma conferida e me manda de novo?",
		"Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
		"Deixa eu refazer a busca pra te mostrar as outras opções — me dá um instante e pede de novo?",
		"Antes de eu confirmar seu plano, deixa eu te mostrar o formulário rapidinho — me diz que quer seguir?",
		"não dá pra abrir uma segunda com outra administradora por aqui. Quer que eu confira o status dessa proposta pra você?",
	];

	it("cada um deles passa por writeAndSaveTextComAviso, nunca pelo texto puro", () => {
		const fonte = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
		for (const aviso of AVISOS_SEM_TOQUE_DO_SHA_E2461A52) {
			const posicao = fonte.indexOf(aviso);
			expect(posicao, `aviso não encontrado na rota: ${aviso}`).toBeGreaterThan(-1);
			const chamadas = [...fonte.slice(0, posicao).matchAll(/writeAndSaveText(?:ComAviso)?\(/g)];
			const ultima = chamadas[chamadas.length - 1]?.[0];
			expect(ultima, `o aviso saiu sem toque: ${aviso}`).toBe("writeAndSaveTextComAviso(");
		}
	});
});
