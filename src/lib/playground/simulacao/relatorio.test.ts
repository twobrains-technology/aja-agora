import { describe, expect, it } from "vitest";
import {
	montarExportacao,
	nomeDoArquivoDeExportacao,
	serializarExportacao,
	vereditoDoPerfil,
} from "./relatorio";
import type { Gravidade, Marcacao, MarcacaoId, StatusDaMarcacao } from "./tipos";

const m = (
	id: MarcacaoId,
	status: StatusDaMarcacao,
	gravidade: Gravidade = "DEFEITO",
): Marcacao => ({ id, status, gravidade, ocorrencias: [] });

const base = { id: "caminho-feliz" as const, esperaProposta: false, esperaFila: false };

describe("vereditoDoPerfil", () => {
	it("defeito acionado → REPROVADO", () => {
		expect(vereditoDoPerfil([m("pedido-repetido", "ACIONADA")], base, "objetivo-atingido")).toBe(
			"REPROVADO",
		);
	});
	it("defeito acionado vence parada com erro", () => {
		expect(vereditoDoPerfil([m("resposta-cortada", "ACIONADA")], base, "erro-do-vendedor")).toBe(
			"REPROVADO",
		);
	});
	it("esperaProposta sem proposta → REPROVADO", () => {
		const r = vereditoDoPerfil(
			[m("chegou-a-proposta", "LIMPA", "SUCESSO")],
			{ ...base, esperaProposta: true },
			"limite-de-turnos",
		);
		expect(r).toBe("REPROVADO");
	});
	it("esperaProposta com proposta → APROVADO", () => {
		const r = vereditoDoPerfil(
			[m("chegou-a-proposta", "ACIONADA", "SUCESSO")],
			{ ...base, esperaProposta: true },
			"objetivo-atingido",
		);
		expect(r).toBe("APROVADO");
	});
	it("erro sem defeito → INCONCLUSIVO", () => {
		for (const p of ["erro-do-vendedor", "erro-do-cliente", "cancelado"] as const) {
			expect(vereditoDoPerfil([m("pedido-repetido", "LIMPA")], base, p)).toBe("INCONCLUSIVO");
		}
	});
	it("esperaFila: acionada aprova, limpa reprova, não aplicável é inconclusivo", () => {
		const p = { ...base, esperaFila: true };
		expect(
			vereditoDoPerfil([m("chamou-fila", "ACIONADA", "INFORMATIVA")], p, "objetivo-atingido"),
		).toBe("APROVADO");
		expect(
			vereditoDoPerfil([m("chamou-fila", "LIMPA", "INFORMATIVA")], p, "objetivo-atingido"),
		).toBe("REPROVADO");
		expect(
			vereditoDoPerfil([m("chamou-fila", "NAO_APLICAVEL", "INFORMATIVA")], p, "objetivo-atingido"),
		).toBe("INCONCLUSIVO");
	});
	it("tudo limpo → APROVADO", () => {
		expect(vereditoDoPerfil([m("pedido-repetido", "LIMPA")], base, "desistencia")).toBe("APROVADO");
	});
});

describe("exportação", () => {
	const agora = new Date("2026-11-04T14:05:33.000Z");
	it("serializa JSON válido com versao 1", () => {
		const e = montarExportacao([], agora);
		const lido = JSON.parse(serializarExportacao(e));
		expect(lido).toEqual({ versao: 1, geradoEm: "2026-11-04T14:05:33.000Z", resultados: [] });
	});
	it("nome do arquivo é estável com agora injetado", () => {
		expect(nomeDoArquivoDeExportacao(agora)).toBe("simulacao-2026-11-04T14-05.json");
	});
});
