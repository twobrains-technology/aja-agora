// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	chatAbriu,
	chatConversaConhecida,
	chatDigitou,
	chatEnviou,
	chatFechou,
	chatRecebeu,
	chatTocou,
	resetarSessaoDeChat,
} from "./chat";
import { filaAtual, resetarFila } from "./fila";

const ABERTURA = 1_770_000_000_000;

beforeEach(() => {
	resetarFila();
	resetarSessaoDeChat();
	vi.stubGlobal("navigator", { ...globalThis.navigator, sendBeacon: () => true });
});

/** O evento que acabou de entrar na fila. */
function ultimo() {
	const fila = filaAtual();
	return fila[fila.length - 1] as Record<string, unknown> | undefined;
}

describe("sessão de chat", () => {
	it("registra a abertura com a seção do CTA e o tipo de semente", () => {
		// É a pergunta que a landing faz: o botão do hero traz gente que conversa,
		// ou é o do rodapé, de quem leu a página inteira antes de falar?
		chatAbriu({ secao: "kv-footer", seed: "vazia" }, ABERTURA);

		expect(ultimo()).toMatchObject({ type: "chat_open", section: "kv-footer", label: "vazia" });
	});

	it("mede quanto tempo a pessoa levou pra escrever a primeira letra — e só na 1ª vez", () => {
		chatAbriu({ secao: "kv-hero", seed: "vazia" }, ABERTURA);
		chatDigitou(ABERTURA + 3_500);
		chatDigitou(ABERTURA + 9_000);

		// Digitar de novo a cada mensagem não é sinal nenhum: o que interessa é a
		// hesitação ANTES da primeira palavra. E não pode ser o FOCO: o campo se
		// auto-foca ao abrir, então foco daria zero para todo mundo.
		expect(filaAtual().filter((e) => e.type === "chat_typing")).toHaveLength(1);
		expect(ultimo()).toMatchObject({ type: "chat_typing", duracaoMs: 3_500 });
	});

	it("no primeiro envio, a duração é a espera desde que o teatro abriu", () => {
		chatAbriu({ secao: "kv-hero", seed: "digitada" }, ABERTURA);
		chatEnviou(ABERTURA + 12_000);

		expect(ultimo()).toMatchObject({ type: "chat_send", duracaoMs: 12_000 });
	});

	it("nos envios seguintes, a duração é o tempo que a PESSOA levou pra responder", () => {
		// Do segundo turno em diante, contar desde a abertura mediria a idade da
		// sessão, não a reação dela ao que o agente disse.
		chatAbriu({ secao: "kv-hero", seed: "digitada" }, ABERTURA);
		chatEnviou(ABERTURA + 10_000);
		chatRecebeu(ABERTURA + 13_000);
		chatEnviou(ABERTURA + 20_000);

		expect(ultimo()).toMatchObject({ type: "chat_send", duracaoMs: 7_000 });
	});

	it("mede a espera que a pessoa SENTIU, do envio até a primeira palavra do agente", () => {
		chatAbriu({ secao: "kv-hero", seed: "digitada" }, ABERTURA);
		chatEnviou(ABERTURA + 10_000);
		chatRecebeu(ABERTURA + 14_500);

		expect(ultimo()).toMatchObject({ type: "chat_receive", duracaoMs: 4_500 });
	});

	it("registra o toque dentro do teatro com o alvo, e sem coordenada", () => {
		chatAbriu({ secao: "kv-hero", seed: "vazia" }, ABERTURA);
		chatTocou({ selector: "@data-heat-id=card-simular", label: "Simular ITAÚ" }, ABERTURA + 5_000);

		expect(ultimo()).toMatchObject({
			type: "chat_card_click",
			selector: "@data-heat-id=card-simular",
			label: "Simular ITAÚ",
		});
		expect(ultimo()).not.toHaveProperty("relX");
	});

	it("registra COMO fechou e quanto durou a sessão inteira", () => {
		chatAbriu({ secao: "kv-hero", seed: "vazia" }, ABERTURA);
		chatFechou("scrim", ABERTURA + 45_000);

		expect(ultimo()).toMatchObject({ type: "chat_close", label: "scrim", duracaoMs: 45_000 });
	});

	it("carimba a conversa em todo evento a partir do momento em que ela existe", () => {
		// A conversa só nasce no primeiro POST /api/chat. Antes disso os eventos
		// saem sem ela — e é essa faixa (abriu, não escreveu) que a instrumentação
		// existe pra enxergar. Depois, tudo tem que apontar pra mesma conversa,
		// senão o percurso da pessoa fica partido em dois.
		chatAbriu({ secao: "kv-hero", seed: "vazia" }, ABERTURA);
		expect(ultimo()?.conversationId).toBeUndefined();

		chatConversaConhecida("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
		chatEnviou(ABERTURA + 8_000);

		expect(ultimo()).toMatchObject({
			type: "chat_send",
			conversationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
		});
	});

	it("não emite nada de chat antes da abertura — evento órfão mediria tempo do nada", () => {
		chatDigitou(ABERTURA);
		chatEnviou(ABERTURA);
		chatFechou("x", ABERTURA);

		expect(filaAtual()).toHaveLength(0);
	});

	it("uma sessão nova zera os marcos da anterior", () => {
		// O teatro remonta a cada abertura. Sem zerar, o `chat_close` da segunda
		// sessão reportaria a duração da primeira somada.
		chatAbriu({ secao: "kv-hero", seed: "vazia" }, ABERTURA);
		chatFechou("x", ABERTURA + 60_000);

		chatAbriu({ secao: "kv-footer", seed: "chip" }, ABERTURA + 100_000);
		chatFechou("esc", ABERTURA + 105_000);

		expect(ultimo()).toMatchObject({ type: "chat_close", duracaoMs: 5_000 });
	});
});
