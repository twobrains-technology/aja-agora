// Veredito do perfil e exportação da simulação. Puro, client-safe.
//
// vereditoDoPerfil, nesta ordem:
//  1. REPROVADO se alguma marcação de gravidade DEFEITO está ACIONADA.
//  2. INCONCLUSIVO se a parada foi erro-do-vendedor, erro-do-cliente ou cancelado (a rodada
//     incompleta não prova a ausência de proposta ou de fila).
//  3. REPROVADO se o perfil espera proposta e `chegou-a-proposta` não foi ACIONADA.
//  4. Se espera fila: `chamou-fila` NAO_APLICAVEL → INCONCLUSIVO; LIMPA → REPROVADO.
//  5. APROVADO.

import type {
	ContextoDeMarcacao,
	ExportacaoDaSimulacao,
	Marcacao,
	MarcacaoId,
	MotivoDeParada,
	ResultadoDoPerfil,
	VereditoDoPerfil,
} from "./tipos";

const PARADAS_INCOMPLETAS: readonly MotivoDeParada[] = [
	"erro-do-vendedor",
	"erro-do-cliente",
	"cancelado",
];

export function vereditoDoPerfil(
	m: Marcacao[],
	perfil: ContextoDeMarcacao["perfil"],
	parada: MotivoDeParada,
): VereditoDoPerfil {
	const por = (id: MarcacaoId) => m.find((x) => x.id === id);

	if (m.some((x) => x.gravidade === "DEFEITO" && x.status === "ACIONADA")) return "REPROVADO";
	if (PARADAS_INCOMPLETAS.includes(parada)) return "INCONCLUSIVO";
	if (perfil.esperaProposta && por("chegou-a-proposta")?.status !== "ACIONADA") return "REPROVADO";
	if (perfil.esperaFila) {
		const fila = por("chamou-fila");
		if (!fila || fila.status === "NAO_APLICAVEL") return "INCONCLUSIVO";
		if (fila.status !== "ACIONADA") return "REPROVADO";
	}
	return "APROVADO";
}

export function montarExportacao(
	r: ResultadoDoPerfil[],
	agora: Date = new Date(),
): ExportacaoDaSimulacao {
	return { versao: 1, geradoEm: agora.toISOString(), resultados: r };
}

export function serializarExportacao(e: ExportacaoDaSimulacao): string {
	return JSON.stringify(e, null, 2);
}

/** "simulacao-AAAA-MM-DDTHH-MM.json", em UTC. */
export function nomeDoArquivoDeExportacao(agora: Date = new Date()): string {
	return `simulacao-${agora.toISOString().slice(0, 16).replace(":", "-")}.json`;
}
