/**
 * O marco da primeira carta é por CONVERSA, não por turno.
 *
 * `carta_na_tela` mede um turno e serve para "de cada 100 turnos, em quantos o
 * cliente viu preço?". Mas ele responde a pergunta ERRADA para avaliar a
 * vitrine: quanto melhor ela funciona, mais turnos a conversa ganha depois da
 * carta — escolha, dúvida, fecho —, todos valendo zero. A média por turno cai
 * quando o produto melhora.
 *
 * Este marco é o contraponte: uma emissão por conversa, com quantos turnos ela
 * custou. É a mesma métrica que foi levantada à mão no banco para diagnosticar
 * o funil (mediana de 5 turnos até a primeira carta) — agora viva.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scoreCreate } = vi.hoisted(() => ({ scoreCreate: vi.fn() }));

vi.mock("./client", () => ({
	getLangfuseClient: () => ({ score: { create: scoreCreate } }),
}));

import { registrarPrimeiraCarta } from "./negocio";

beforeEach(() => scoreCreate.mockClear());

const nomes = () => scoreCreate.mock.calls.map((c) => (c[0] as { name: string }).name);
const porNome = (n: string) =>
	scoreCreate.mock.calls.map((c) => c[0] as Record<string, unknown>).find((s) => s.name === n);

describe("registrarPrimeiraCarta", () => {
	it("emite carta_vista e turnos_ate_carta ancorados na SESSÃO", () => {
		registrarPrimeiraCarta({ conversationId: "conv-1", turnosAteACarta: 1, isSimulated: false });

		expect(nomes()).toEqual(expect.arrayContaining(["carta_vista", "turnos_ate_carta"]));
		expect(porNome("carta_vista")?.sessionId).toBe("conv-1");
		expect(porNome("turnos_ate_carta")?.value).toBe(1);
	});

	it("NÃO emite para conversa simulada — teste não entra em métrica de funil", () => {
		// Quatro dos seis "fechamentos" do período medido eram teste interno. Sem
		// este corte, a métrica nova nasceria com o mesmo vício.
		registrarPrimeiraCarta({ conversationId: "conv-1", turnosAteACarta: 1, isSimulated: true });

		expect(scoreCreate).not.toHaveBeenCalled();
	});

	it("NÃO emite sem conversa para ancorar", () => {
		registrarPrimeiraCarta({ conversationId: null, turnosAteACarta: 2, isSimulated: false });

		expect(scoreCreate).not.toHaveBeenCalled();
	});

	it("omite a contagem de turnos quando ela não é um número utilizável", () => {
		// Zero e NaN não são medições — emitir "0 turnos até a carta" estragaria a
		// mediana com um valor que não aconteceu.
		registrarPrimeiraCarta({ conversationId: "conv-1", turnosAteACarta: 0, isSimulated: false });

		expect(nomes()).toContain("carta_vista");
		expect(nomes()).not.toContain("turnos_ate_carta");
	});
});
