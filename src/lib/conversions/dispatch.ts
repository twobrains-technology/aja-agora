// src/lib/conversions/dispatch.ts
//
// Esvazia a fila de conversões pendentes — quando a flag deixa.
//
// Com a flag desligada (o estado de hoje) esta função é um no-op deliberado:
// os eventos ficam `pending` acumulando. É esse acúmulo que permite ligar a
// chave e mandar o histórico dos últimos 7 dias de uma vez, em vez de começar
// a ensinar o algoritmo do zero.

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents } from "@/db/schema";
import { getConversionsConfig, motivoParaNaoEnviar } from "./config";
import {
	type EventoParaEnvio,
	enviarParaMeta,
	expirouParaMeta,
	JANELA_MAXIMA_MS,
	temNomeMeta,
} from "./meta-capi";

export interface ResultadoDespacho {
	enviados: number;
	falhas: number;
	expirados: number;
	/** Preenchido quando nada foi tentado, dizendo POR QUÊ. */
	desligado?: string;
}

/**
 * O que sai da fila comercial.
 *
 * A régua é ter nome que a Meta entende, não pertencer ao contrato novo. Os
 * marcos legados (`lead_qualificado`, `contrato_fechado`) continuam mapeados e
 * continuam sendo enviados enquanto a flag do V2 não vira — travá-los aqui
 * apagaria a medição durante todo o rollout, que é justamente o período em que
 * ela precisa existir para comparar contrato velho e novo. Quem fica de fora é
 * `chat_iniciado`, o diagnóstico de abertura de UI que gerava os HTTP 400.
 */
function enviavel(eventName: string): boolean {
	return temNomeMeta(eventName);
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

	const foraDaFila = pendentes.filter((linha) => !enviavel(linha.eventName));
	if (foraDaFila.length) {
		await db
			.update(conversionEvents)
			.set({ status: "skipped", lastError: "evento sem nome Meta — fora da fila comercial" })
			.where(
				inArray(
					conversionEvents.id,
					foraDaFila.map((linha) => linha.id),
				),
			);
	}
	const paraEnvio: EventoParaEnvio[] = pendentes
		.filter((linha) => enviavel(linha.eventName))
		.map((linha) => ({
			id: linha.id,
			eventName: linha.eventName,
			eventKey: linha.eventKey,
			occurredAt: linha.occurredAt,
			value: linha.value,
			currency: linha.currency,
			hashedEmail: linha.hashedEmail,
			hashedPhone: linha.hashedPhone,
			externalId: linha.externalId,
			fbc: linha.fbc,
			fbp: linha.fbp,
			ctwaClid: linha.ctwaClid,
			actionSource: linha.actionSource,
			contentId: linha.contentId,
			campaignId: linha.campaignId,
			adsetId: linha.adsetId,
			adId: linha.adId,
			previousStage: linha.previousStage,
			currentStage: linha.currentStage,
			proposalId: linha.proposalId,
			saleId: linha.saleId,
		}));

	const naJanela = paraEnvio.filter((evento) => !expirouParaMeta(evento));

	const marcos = naJanela;

	const agora = new Date();
	let enviados = 0;
	let falhas = 0;

	for (const lote of [marcos]) {
		if (lote.length === 0) continue;

		const resultado = await enviarParaMeta(lote, cfg);

		for (const evento of lote) {
			await db
				.update(conversionEvents)
				.set(
					resultado.ok
						? { status: "sent", sentAt: agora, lastError: null }
						: { status: "failed", lastError: resultado.erro ?? "erro desconhecido" },
				)
				.where(eq(conversionEvents.id, evento.id));
		}

		if (resultado.ok) {
			enviados += lote.length;
		} else {
			falhas += lote.length;
			console.error(
				`[conversions] envio falhou para ${lote.length} evento(s) comercial(is): ${resultado.erro}`,
			);
		}
	}

	return { enviados, falhas, expirados };
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
