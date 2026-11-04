// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { PainelDeConversa } from "./painel-de-conversa";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (..._a: unknown[]) => new Response("{}")),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const grupo = (id: string, administradora: string) => ({
	id,
	administradora,
	category: "auto" as const,
	creditValue: 80000,
	monthlyPayment: 1200,
	adminFeePercent: 15,
	termMonths: 80,
	availableSlots: 3,
});

const mensagens = [
	{ id: "u1", role: "user", parts: [{ type: "text", text: "Quero um carro" }] },
	{
		id: "v1",
		role: "assistant",
		parts: [
			{ type: "text", text: "Separei três opções para você" },
			{
				type: "data-artifact",
				data: {
					type: "comparison_table",
					payload: {
						groups: [grupo("g1", "AdmUm"), grupo("g2", "AdmDois"), grupo("g3", "AdmTres")],
					},
				},
			},
		],
	},
] as unknown as AjaUIMessage[];

describe("PainelDeConversa", () => {
	it("mostra rótulo, lista da plataforma, texto e as 3 cartas do card", () => {
		const { container } = render(<PainelDeConversa modo="antes" mensagens={mensagens} />);
		expect(screen.getByText("Antes (conduta viva)")).toBeTruthy();
		expect(screen.getByText("Cards: somente leitura")).toBeTruthy();
		expect(container.querySelector("[data-message-list]")).not.toBeNull();
		expect(screen.getByText("Separei três opções para você")).toBeTruthy();
		for (const adm of ["AdmUm", "AdmDois", "AdmTres"]) {
			expect(screen.getAllByText(new RegExp(adm)).length).toBeGreaterThan(0);
		}
	});

	it("rótulo do modo depois", () => {
		render(<PainelDeConversa modo="depois" mensagens={[]} />);
		expect(screen.getByText("Depois (perfil em edição)")).toBeTruthy();
	});

	it("clique dentro do card não chama /api/chat", async () => {
		const fetchEspiao = vi.fn(async (..._a: unknown[]) => new Response("{}"));
		vi.stubGlobal("fetch", fetchEspiao);
		const { container } = render(<PainelDeConversa modo="antes" mensagens={mensagens} />);
		const clicaveis = Array.from(container.querySelectorAll("button, a, [role=button]"));
		expect(clicaveis.length).toBeGreaterThan(0);
		for (const el of clicaveis) fireEvent.click(el);
		await new Promise((r) => setTimeout(r, 200));
		const chamadas = fetchEspiao.mock.calls.filter((c) => String(c[0]).includes("/api/chat"));
		expect(chamadas).toHaveLength(0);
	});

	it("marca promessa de contemplação no vendedor", () => {
		const m = [
			{
				id: "v2",
				role: "assistant",
				parts: [{ type: "text", text: "Você será contemplado no mês que vem, garantido." }],
			},
		] as unknown as AjaUIMessage[];
		render(<PainelDeConversa modo="antes" mensagens={m} />);
		expect(screen.getByText("PROMESSA DE CONTEMPLAÇÃO")).toBeTruthy();
	});
});
