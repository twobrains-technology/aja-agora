/**
 * HISTÓRICO DE EXPORTAÇÕES — a auditoria de LGPD da área.
 *
 * Toda exportação baixada grava uma linha; a tela mostra as últimas. É o que
 * responde "quem levou o telefone completo da base, e quando" — sem isso o
 * switch "Incluir dado pessoal completo" seria um botão sem consequência.
 */

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { exportacoes } from "@/db/schema";
import type { ExportacaoRegistrada } from "./tipos";

export interface RegistroDeExportacao {
	tipo: string;
	formato: string;
	de: Date;
	ate: Date;
	mascarado: boolean;
	linhas: number;
	usuarioId: string | null;
	usuarioEmail: string | null;
}

export async function registrarExportacao(registro: RegistroDeExportacao): Promise<void> {
	await db.insert(exportacoes).values({
		tipo: registro.tipo,
		formato: registro.formato,
		de: registro.de,
		ate: registro.ate,
		mascarado: registro.mascarado,
		linhas: registro.linhas,
		usuarioId: registro.usuarioId,
		usuarioEmail: registro.usuarioEmail,
	});
}

export async function listarUltimasExportacoes(limite = 20): Promise<ExportacaoRegistrada[]> {
	const linhas = await db
		.select({
			id: exportacoes.id,
			tipo: exportacoes.tipo,
			formato: exportacoes.formato,
			de: exportacoes.de,
			ate: exportacoes.ate,
			mascarado: exportacoes.mascarado,
			linhas: exportacoes.linhas,
			usuarioEmail: exportacoes.usuarioEmail,
			criadoEm: exportacoes.criadoEm,
		})
		.from(exportacoes)
		.orderBy(desc(exportacoes.criadoEm))
		.limit(limite);

	return linhas.map((linha) => ({
		id: linha.id,
		tipo: linha.tipo,
		formato: linha.formato,
		de: linha.de.toISOString(),
		ate: linha.ate.toISOString(),
		mascarado: linha.mascarado,
		linhas: linha.linhas,
		usuarioEmail: linha.usuarioEmail,
		criadoEm: linha.criadoEm.toISOString(),
	}));
}
