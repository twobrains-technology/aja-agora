/**
 * Fato do turno sobre a fila de vendedores: hora local, quantos vendedores
 * ativos e o estado da chamada. Só fatos; a política (o que dizer ao lead
 * conforme a hora ou a fila) é texto de conduta, não código (P9, P11).
 */

export type EntradaDoFatoDaFila = {
	agora: Date;
	fuso?: string;
	atendentesAtivos: number;
	chamadaEm: Date | null;
	assumidaPor: string | null;
};

const FUSO_PADRAO = "America/Sao_Paulo";

function partes(data: Date, fuso: string, opcoes: Intl.DateTimeFormatOptions) {
	const mapa: Record<string, string> = {};
	for (const p of new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, ...opcoes }).formatToParts(
		data,
	)) {
		mapa[p.type] = p.value;
	}
	return mapa;
}

function hhmm(data: Date, fuso: string): string {
	const p = partes(data, fuso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
	return `${p.hour}:${p.minute}`;
}

function dataCompleta(data: Date, fuso: string): string {
	const p = partes(data, fuso, {
		weekday: "long",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
	const dia = (p.weekday ?? "").replace(/-feira$/, "");
	return `${dia}, ${p.day}/${p.month}/${p.year}`;
}

export function montarFatoDaFila(a: EntradaDoFatoDaFila): string {
	const fuso = a.fuso ?? FUSO_PADRAO;
	const linhas = [
		`Hora agora: ${dataCompleta(a.agora, fuso)}, ${hhmm(a.agora, fuso)} (${fuso})`,
		`Vendedores ativos cadastrados: ${a.atendentesAtivos}`,
	];
	if (a.chamadaEm) {
		const min = Math.max(0, Math.round((a.agora.getTime() - a.chamadaEm.getTime()) / 60_000));
		linhas.push(`Fila de vendedores: chamada há ${min} min (${hhmm(a.chamadaEm, fuso)})`);
	} else {
		linhas.push("Fila de vendedores: não chamada");
	}
	if (a.assumidaPor) linhas.push(`Fila assumida por ${a.assumidaPor}`);
	return linhas.join("\n");
}
