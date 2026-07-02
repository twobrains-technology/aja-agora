// FIX-65 — outbound do dossiê pro WhatsApp do atendente. Camada 1 (structural, roda em
// test:unit). Cobre: minimização de PII (NÃO vaza CPF/e-mail), montagem do dossiê e a
// fronteira Meta (sendTextMessage chamado com o número do atendente — mockada).
// Spec: docs/visao/mesa-de-operacao.md §4-5 + §8 (PII).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock só a fronteira externa (Meta Graph API) — o resto é código real.
// vi.hoisted: o factory do vi.mock é içado pro topo, então o spy tem que nascer içado.
const { sendTextMessage } = vi.hoisted(() => ({
	sendTextMessage: vi.fn(async (_to: string, _text: string) => ({ messageId: "mock-123" })),
}));
vi.mock("@/lib/whatsapp/api", () => ({ sendTextMessage }));

import {
	buildDossierMessage,
	type MesaCaseDossier,
	sendCaseToAttendant,
	toDossier,
} from "./outbound";

const FULL_DOSSIER: MesaCaseDossier = {
	attendantWhatsapp: "5562988887777",
	attendantNome: "Atendente Um",
	clienteNome: "Maria Teste",
	clienteContato: "5562999990000",
	segmento: "imovel",
	administradora: "Canopus",
	grupo: "1234",
	creditValue: "200000.00",
	monthlyPayment: "1200.00",
	termMonths: 180,
	proposalLink: "https://bevi.example/proposta/abc",
};

// Padrão de CPF formatado (não pode aparecer no dossiê).
const CPF_FORMATTED = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

describe("FIX-65 — buildDossierMessage (minimização de PII)", () => {
	it("inclui os campos do caso necessários pra contratar", () => {
		const msg = buildDossierMessage(FULL_DOSSIER);
		expect(msg).toContain("Maria Teste");
		expect(msg).toContain("5562999990000");
		expect(msg).toContain("Canopus");
		expect(msg).toContain("1234");
		expect(msg).toContain("180 meses");
		expect(msg).toContain("https://bevi.example/proposta/abc");
	});

	it("NÃO contém CPF cru (nem formatado, nem rótulo CPF: <número>)", () => {
		const msg = buildDossierMessage(FULL_DOSSIER);
		expect(msg).not.toMatch(CPF_FORMATTED);
		// "CPF" só pode aparecer no ponteiro de privacidade — nunca seguido de um dígito.
		expect(msg).not.toMatch(/CPF[:\s]*\d/);
	});

	it("NÃO vaza e-mail do cliente", () => {
		const msg = buildDossierMessage(FULL_DOSSIER);
		expect(msg).not.toContain("@");
	});

	it("cota ausente → não imprime null/undefined, sinaliza 'não definida'", () => {
		const msg = buildDossierMessage({
			...FULL_DOSSIER,
			segmento: null,
			administradora: null,
			grupo: null,
			creditValue: null,
			monthlyPayment: null,
			termMonths: null,
			proposalLink: null,
		});
		expect(msg).not.toContain("null");
		expect(msg).not.toContain("undefined");
		expect(msg.toLowerCase()).toContain("não definida");
	});
});

describe("FIX-65 — toDossier (mapeamento entidade → DTO sem PII sensível)", () => {
	it("o DTO montado NÃO tem campo cpf por construção", () => {
		const dossier = toDossier({
			attendant: { nome: "Atendente Um", whatsapp: "5562988887777" },
			lead: { name: "Maria Teste", phone: "5562999990000" },
			proposal: {
				segmento: "imovel",
				administradora: "Canopus",
				grupo: "1234",
				creditValue: "200000.00",
				monthlyPayment: "1200.00",
				termMonths: 180,
				consortiumProposalLink: "https://bevi.example/proposta/abc",
			},
		});
		expect(Object.keys(dossier)).not.toContain("cpf");
		expect(dossier.attendantWhatsapp).toBe("5562988887777");
		expect(dossier.administradora).toBe("Canopus");
	});

	it("proposta nula → DTO com cota vazia (sem quebrar)", () => {
		const dossier = toDossier({
			attendant: { nome: "Atendente Um", whatsapp: "5562988887777" },
			lead: { name: "Maria Teste", phone: "5562999990000" },
			proposal: null,
		});
		expect(dossier.administradora).toBeNull();
		expect(dossier.grupo).toBeNull();
	});
});

describe("FIX-65 — sendCaseToAttendant (fronteira Meta)", () => {
	beforeEach(() => sendTextMessage.mockClear());

	it("envia o dossiê para o WhatsApp do atendente", async () => {
		await sendCaseToAttendant(FULL_DOSSIER);
		expect(sendTextMessage).toHaveBeenCalledTimes(1);
		const [to, text] = sendTextMessage.mock.calls[0];
		expect(to).toBe("5562988887777"); // número do atendente, não do cliente
		expect(text).toContain("Maria Teste");
		expect(text).not.toMatch(CPF_FORMATTED);
	});
});

describe("FIX-124 — wiring na rota de transbordo (structural)", () => {
	const routeSrc = readFileSync(
		join(process.cwd(), "src/app/api/admin/leads/[id]/transbordo/route.ts"),
		"utf8",
	);

	it("a rota POST dispara o BROADCAST do transbordo (broadcastCaseToAttendants)", () => {
		// FIX-124: single-cast (sendCaseToAttendant) deu lugar ao broadcast a todos os
		// atendentes com botão "Vou atender".
		expect(routeSrc).toContain("broadcastCaseToAttendants");
	});

	it("a rota NÃO exige mais um atendente único (sem mesaAttendantId no schema)", () => {
		expect(routeSrc).not.toContain("mesaAttendantId: z");
	});
});
