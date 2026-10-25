import { describe, expect, it } from "vitest";
import { TEXTO_ERRO_DO_CHAT } from "@/lib/chat/stream-error";
import {
	chaveDoLimiteDeMensagens,
	formularioDeContratoFoiEnviado,
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
