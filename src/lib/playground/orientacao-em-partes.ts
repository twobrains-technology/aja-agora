// Envelope da orientação por partes (D-0078, Q10): JSON dentro do campo `orientacao`,
// sem migração. Texto que não é envelope v2 válido (inclui o legado, texto puro)
// vira `livre`; parte ausente vale o padrão.
import { ORDEM_DE_COMPOSICAO } from "@/lib/agent/prompt-do-vendedor";
import { CONTATOS_DO_PRESET, type ContatoPreset, type ParteId } from "./tipos";

export interface OrientacaoEmPartes {
	partes: Partial<Record<ParteId, string>>;
	contato: ContatoPreset;
	livre: string;
}

export function serializar(o: OrientacaoEmPartes): string {
	return JSON.stringify({ v: 2, partes: o.partes, contato: o.contato, livre: o.livre });
}

export function ehEnvelope(orientacao: string): boolean {
	return lerEnvelope(orientacao) !== null;
}

function lerEnvelope(texto: string): OrientacaoEmPartes | null {
	let bruto: unknown;
	try {
		bruto = JSON.parse(texto);
	} catch {
		return null;
	}
	if (typeof bruto !== "object" || bruto === null) return null;
	const o = bruto as Record<string, unknown>;
	if (o.v !== 2) return null;
	if (typeof o.partes !== "object" || o.partes === null || Array.isArray(o.partes)) return null;
	const partes: Partial<Record<ParteId, string>> = {};
	for (const id of ORDEM_DE_COMPOSICAO) {
		const valor = (o.partes as Record<string, unknown>)[id];
		if (typeof valor === "string") partes[id] = valor;
	}
	const contato = CONTATOS_DO_PRESET.find((c) => c === o.contato) ?? "carta-primeiro";
	return { partes, contato, livre: typeof o.livre === "string" ? o.livre : "" };
}

export function ler(orientacao: string): OrientacaoEmPartes {
	return lerEnvelope(orientacao) ?? { partes: {}, contato: "carta-primeiro", livre: orientacao };
}
