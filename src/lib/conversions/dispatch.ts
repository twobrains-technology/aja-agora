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
} from "./meta-capi";

export interface ResultadoDespacho {
	enviados: number;
	falhas: number;
	expirados: number;
	/** Preenchido quando nada foi tentado, dizendo POR QUÊ. */
	desligado?: string;
}

const EVENTOS_V2 = new Set([
	"conversation_started",
	"lead",
	"qualified_lead",
	"offer_viewed",
	"proposal_sent",
	"purchase",
]);

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

	// Nunca reaproveita o contrato antigo. Em particular, chat_iniciado era
	// abertura de UI e gerava os HTTP 400 que contaminavam a fila comercial.
	const legados = pendentes.filter((linha) => !EVENTOS_V2.has(linha.eventName));
	if (legados.length) {
		await db
			.update(conversionEvents)
			.set({ status: "skipped", lastError: "evento legado fora do contrato Meta CAPI V2" })
			.where(
				inArray(
					conversionEvents.id,
					legados.map((linha) => linha.id),
				),
			);
	}
	const paraEnvio: EventoParaEnvio[] = pendentes
		.filter((linha) => EVENTOS_V2.has(linha.eventName))
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
