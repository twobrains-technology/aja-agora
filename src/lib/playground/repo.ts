// Persistência dos perfis do playground (D-0056). O perfil é a receita; a conduta
// viva continua em `caixa_de_prompt`. Salvar nunca toca a caixa: só publicar.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playgroundPerfilVersoes, playgroundPerfis } from "@/db/schema";
import { compilarPerfil } from "./compilar-perfil";
import type { AtributosDoPerfil, PerfilDoPlayground, VersaoDoPerfil } from "./tipos";

export class PerfilVersionConflictError extends Error {
	constructor(
		readonly esperada: number,
		readonly atual: number,
	) {
		super(`Perfil alterado por outra pessoa (esperava versão ${esperada}, a atual é ${atual}).`);
		this.name = "PerfilVersionConflictError";
	}
}

function paraPerfil(l: typeof playgroundPerfis.$inferSelect): PerfilDoPlayground {
	return {
		id: l.id,
		nome: l.nome,
		atributos: l.atributos,
		orientacao: l.orientacao,
		versao: l.versao,
		criadoEm: l.criadoEm,
		atualizadoEm: l.atualizadoEm,
		atualizadoPor: l.atualizadoPor,
	};
}

export async function listarPerfis(): Promise<PerfilDoPlayground[]> {
	const linhas = await db
		.select()
		.from(playgroundPerfis)
		.orderBy(desc(playgroundPerfis.atualizadoEm));
	return linhas.map(paraPerfil);
}

export async function obterPerfil(id: string): Promise<PerfilDoPlayground | null> {
	const [linha] = await db.select().from(playgroundPerfis).where(eq(playgroundPerfis.id, id));
	return linha ? paraPerfil(linha) : null;
}

export async function criarPerfil(entrada: {
	nome: string;
	atributos: AtributosDoPerfil;
	orientacao: string;
	salvoPor: string | null;
}): Promise<PerfilDoPlayground> {
	return db.transaction(async (tx) => {
		const [linha] = await tx
			.insert(playgroundPerfis)
			.values({
				nome: entrada.nome,
				atributos: entrada.atributos,
				orientacao: entrada.orientacao,
				versao: 1,
				atualizadoPor: entrada.salvoPor,
			})
			.returning();
		await tx.insert(playgroundPerfilVersoes).values({
			perfilId: linha.id,
			versao: 1,
			atributos: entrada.atributos,
			orientacao: entrada.orientacao,
			blocoCompilado: compilarPerfil(entrada),
			salvoPor: entrada.salvoPor,
		});
		return paraPerfil(linha);
	});
}

/** Concorrência otimista: só grava se `versaoEsperada` ainda é a do perfil. */
export async function atualizarPerfil(
	id: string,
	entrada: {
		nome: string;
		atributos: AtributosDoPerfil;
		orientacao: string;
		salvoPor: string | null;
		versaoEsperada: number;
	},
): Promise<PerfilDoPlayground | null> {
	return db.transaction(async (tx) => {
		const [atual] = await tx.select().from(playgroundPerfis).where(eq(playgroundPerfis.id, id));
		if (!atual) return null;
		const nova = entrada.versaoEsperada + 1;
		const [linha] = await tx
			.update(playgroundPerfis)
			.set({
				nome: entrada.nome,
				atributos: entrada.atributos,
				orientacao: entrada.orientacao,
				versao: nova,
				atualizadoEm: new Date(),
				atualizadoPor: entrada.salvoPor,
			})
			.where(and(eq(playgroundPerfis.id, id), eq(playgroundPerfis.versao, entrada.versaoEsperada)))
			.returning();
		if (!linha) throw new PerfilVersionConflictError(entrada.versaoEsperada, atual.versao);
		await tx.insert(playgroundPerfilVersoes).values({
			perfilId: id,
			versao: nova,
			atributos: entrada.atributos,
			orientacao: entrada.orientacao,
			blocoCompilado: compilarPerfil(entrada),
			salvoPor: entrada.salvoPor,
		});
		return paraPerfil(linha);
	});
}

export async function historicoDoPerfil(perfilId: string): Promise<VersaoDoPerfil[]> {
	const linhas = await db
		.select()
		.from(playgroundPerfilVersoes)
		.where(eq(playgroundPerfilVersoes.perfilId, perfilId))
		.orderBy(desc(playgroundPerfilVersoes.versao));
	return linhas.map((l) => ({
		perfilId: l.perfilId,
		versao: l.versao,
		atributos: l.atributos,
		orientacao: l.orientacao,
		blocoCompilado: l.blocoCompilado,
		salvoPor: l.salvoPor,
		criadoEm: l.criadoEm,
		caixaVersao: l.caixaVersao,
	}));
}

/** Publicar carimba a linha da versão do perfil com a versão devolvida por `publicarCaixa`. */
export async function carimbarCaixaVersao(
	perfilId: string,
	versao: number,
	caixaVersao: number,
): Promise<void> {
	await db
		.update(playgroundPerfilVersoes)
		.set({ caixaVersao })
		.where(
			and(
				eq(playgroundPerfilVersoes.perfilId, perfilId),
				eq(playgroundPerfilVersoes.versao, versao),
			),
		);
}

export async function apagarPerfil(id: string): Promise<void> {
	await db.delete(playgroundPerfis).where(eq(playgroundPerfis.id, id));
}
