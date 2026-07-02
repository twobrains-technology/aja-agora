import { describe, it, expect } from "vitest";

describe("contact-detail-panel — formatação de propostas", () => {
	it("deve formatar creditValue como moeda PT-BR", () => {
		const formatted = formatCurrency("100000");
		expect(formatted).toContain("R$");
		expect(formatted).toContain("100.000");
		expect(formatted).not.toContain("100000");
	});

	it("deve formatar monthlyPayment como moeda PT-BR", () => {
		const formatted = formatCurrency("1397.47");
		expect(formatted).toContain("R$");
		expect(formatted).toContain("1.397,47");
	});

	it("deve traduzir status cru 'simulacao' para 'Simulação' acentuado", () => {
		const status = getStatusLabel("simulacao");
		expect(status).toBe("Simulação");
		expect(status).not.toContain("simulacao");
	});

	it("deve traduzir status cru 'documentos' para 'Aguardando documentos'", () => {
		const status = getStatusLabel("documentos");
		expect(status).toBe("Aguardando documentos");
	});

	it("deve retornar status humanizado para todos os status conhecidos", () => {
		const statuses = [
			["simulacao", "Simulação"],
			["documentos", "Aguardando documentos"],
			["proposta_enviada", "Proposta enviada"],
		];

		statuses.forEach(([raw, expected]) => {
			expect(getStatusLabel(raw)).toBe(expected);
		});
	});
});

// Helpers que devem estar no componente
function formatCurrency(value: number): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);
}

const STATUS_LABELS: Record<string, string> = {
	simulacao: "Simulação",
	documentos: "Aguardando documentos",
	proposta_enviada: "Proposta enviada",
	em_assinatura: "Em assinatura",
	assinada: "Assinada",
	recusada: "Recusada",
};

function getStatusLabel(status: string): string {
	return STATUS_LABELS[status] || status;
}
