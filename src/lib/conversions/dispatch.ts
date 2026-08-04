// src/lib/conversions/dispatch.ts
//
// Esvazia a fila de conversões pendentes — quando a flag deixa.
//
// Com a flag desligada (o estado de hoje) esta função é um no-op deliberado:
// os eventos ficam `pending` acumulando. É esse acúmulo que permite ligar a
// chave e mandar o histórico dos últimos 7 dias de uma vez, em vez de começar
// a ensinar o algoritmo do zero.

import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents } from "@/db/schema";
import { getConversionsConfig, motivoParaNaoEnviar } from "./config";
import {
	type EventoParaEnvio,
	enviarParaMeta,
	expirouParaMeta,
	JANELA_MAXIMA_MS,
} from "./meta-capi";

export interface ResultadoDespacho {
	enviados: number;
	falhas: number;
	expirados: number;
	/** Preenchido quando nada foi tentado, dizendo POR QUÊ. */
	desligado?: string;
}

/**
 * Envia os pendentes em um lote.
 *
 * Lote único porque a Meta aceita até 1000 eventos por chamada e o volume desta
 * operação é muito menor — dividir só multiplicaria round-trip. Se um lote
 * falha, todos daquele lote voltam pra `failed` com o erro registrado: é
 * melhor um punhado de linhas dizendo o mesmo motivo do que um `pending`
 * eterno sem explicação.
 */
export async function despacharConversoesPendentes(limite = 500): Promise<ResultadoDespacho> {
	const cfg = getConversionsConfig();
	const motivo = motivoParaNaoEnviar(cfg);
	if (motivo) {
		return { enviados: 0, falhas: 0, expirados: 0, desligado: motivo };
	}

	// Só o que ainda cabe na janela de 7 dias da Meta — buscar mais velho seria
	// gastar chamada com o que já vai ser recusado.
	const limiteDeIdade = new Date(Date.now() - JANELA_MAXIMA_MS);

	const pendentes = await db
		.select()
		.from(conversionEvents)
		.where(
			and(
				eq(conversionEvents.status, "pending"),
				eq(conversionEvents.destination, "meta"),
				gte(conversionEvents.occurredAt, limiteDeIdade),
			),
		)
		.orderBy(asc(conversionEvents.occurredAt))
		.limit(limite);

	// Marca de uma vez o que envelheceu além da janela: some da fila em vez de
	// ser retentado pra sempre.
	const expirados = await marcarExpirados(limiteDeIdade);

	if (pendentes.length === 0) {
		return { enviados: 0, falhas: 0, expirados };
	}

	const paraEnvio: EventoParaEnvio[] = pendentes.map((linha) => ({
		id: linha.id,
		eventName: linha.eventName,
		eventKey: linha.eventKey,
		occurredAt: linha.occurredAt,
		value: linha.value,
		currency: linha.currency,
		hashedEmail: linha.hashedEmail,
		hashedPhone: linha.hashedPhone,
		fbc: linha.fbc,
		fbp: linha.fbp,
		ctwaClid: linha.ctwaClid,
		actionSource: linha.actionSource,
	}));

	const naJanela = paraEnvio.filter((evento) => !expirouParaMeta(evento));
	const resultado = await enviarParaMeta(naJanela, cfg);
	const agora = new Date();

	for (const evento of naJanela) {
		await db
			.update(conversionEvents)
			.set(
				resultado.ok
					? { status: "sent", sentAt: agora, lastError: null }
					: { status: "failed", lastError: resultado.erro ?? "erro desconhecido" },
			)
			.where(eq(conversionEvents.id, evento.id));
	}

	if (!resultado.ok) {
		console.error(
			`[conversions] envio falhou para ${naJanela.length} evento(s): ${resultado.erro}`,
		);
	}

	return {
		enviados: resultado.ok ? naJanela.length : 0,
		falhas: resultado.ok ? 0 : naJanela.length,
		expirados,
	};
}

async function marcarExpirados(limiteDeIdade: Date): Promise<number> {
	const linhas = await db
		.update(conversionEvents)
		.set({
			status: "skipped",
			lastError: "fora da janela de 7 dias aceita pela Meta",
		})
		.where(
			and(
				eq(conversionEvents.status, "pending"),
				eq(conversionEvents.destination, "meta"),
				// Tudo que é mais antigo que o limite.
				lt(conversionEvents.occurredAt, limiteDeIdade),
			),
		)
		.returning({ id: conversionEvents.id });

	return linhas.length;
}
