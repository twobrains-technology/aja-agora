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
		contentId: linha.contentId,
	}));

	const naJanela = paraEnvio.filter((evento) => !expirouParaMeta(evento));

	// DOIS LOTES: marco de venda de um lado, sinal de interesse do outro.
	//
	// `enviarParaMeta` manda tudo numa chamada e o resultado é do LOTE — uma
	// recusa marca `failed` em todas as linhas juntas. Isso era aceitável
	// enquanto a fila tinha três eventos do vocabulário padrão da Meta, raros e
	// homogêneos.
	//
	// O `chat_iniciado` (item B3, 30/08/2026) mudou as duas coisas de uma vez: é
	// evento PERSONALIZADO — o de maior chance de ser recusado por validação nova
	// da Graph API — e é MUITO mais frequente (produção, 16–30/08: 75 aberturas
	// de teatro contra 22 eventos de conversão). A fila passa a ser dominada por
	// ele.
	//
	// Juntos, os dois fatos produzem o desfecho que esta separação impede: uma
	// recusa causada pelo sinal levaria junto, para `failed`, o `Purchase` de uma
	// venda de seis dígitos que estava no mesmo lote. E o erro gravado apontaria
	// o campo do evento errado — a venda não sumiria, ficaria `failed` com uma
	// mensagem plausível, e ninguém iria procurá-la.
	//
	// A divisão é por NATUREZA e não por nome: o que é marco de negócio de um
	// lado, o que é sinal do outro. Fila só de venda continua sendo uma chamada
	// só — nada de round-trip a mais quando não há sinal na fila.
	const marcos = naJanela.filter((evento) => evento.eventName !== "chat_iniciado");
	const sinais = naJanela.filter((evento) => evento.eventName === "chat_iniciado");

	const agora = new Date();
	let enviados = 0;
	let falhas = 0;

	for (const lote of [marcos, sinais]) {
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
				`[conversions] envio falhou para ${lote.length} evento(s) de ${lote[0].eventName === "chat_iniciado" ? "sinal" : "venda"}: ${resultado.erro}`,
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
