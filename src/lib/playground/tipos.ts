// Contratos do playground de comportamento (D-0056). Sem dependência de banco.
import type { ExpertiseLevel } from "@/lib/agent/personas";

export type { ParteId } from "@/lib/agent/prompt-do-vendedor";

export const CONTATOS_DO_PRESET = ["carta-primeiro", "telefone-antes"] as const;
export type ContatoPreset = (typeof CONTATOS_DO_PRESET)[number];

export const AGRESSIVIDADES = ["suave", "equilibrada", "insistente"] as const;
export const PROATIVIDADES = ["baixa", "media", "alta"] as const;
export const TECNICIDADES: readonly Tecnicidade[] = ["leigo", "neutro", "expert"];
export const TONS = ["formal", "neutro", "coloquial"] as const;

export type Agressividade = (typeof AGRESSIVIDADES)[number];
export type Proatividade = (typeof PROATIVIDADES)[number];
export type Tecnicidade = ExpertiseLevel;
export type Tom = (typeof TONS)[number];

export interface AtributosDoPerfil {
	agressividade: Agressividade;
	proatividade: Proatividade;
	tecnicidade: Tecnicidade;
	tom: Tom;
}

export interface PerfilDoPlayground {
	id: string;
	nome: string;
	atributos: AtributosDoPerfil;
	orientacao: string;
	versao: number;
	criadoEm: Date;
	atualizadoEm: Date;
	atualizadoPor: string | null;
}

export interface VersaoDoPerfil {
	perfilId: string;
	versao: number;
	atributos: AtributosDoPerfil;
	orientacao: string;
	blocoCompilado: string;
	salvoPor: string | null;
	criadoEm: Date;
	/** Nulo até publicar; depois, a versão devolvida por publicarCaixa. */
	caixaVersao: number | null;
}

export const ROTULOS: {
	agressividade: Record<Agressividade, string>;
	proatividade: Record<Proatividade, string>;
	tecnicidade: Record<Tecnicidade, string>;
	tom: Record<Tom, string>;
} = {
	agressividade: { suave: "Suave", equilibrada: "Equilibrada", insistente: "Insistente" },
	proatividade: { baixa: "Baixa", media: "Média", alta: "Alta" },
	tecnicidade: { leigo: "Leigo", neutro: "Neutro", expert: "Expert" },
	tom: { formal: "Formal", neutro: "Neutro", coloquial: "Coloquial" },
};

export type ResultadoDoDetector = { ok: true } | { ok: false; motivo: string };
