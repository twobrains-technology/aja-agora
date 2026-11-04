/**
 * Chat do playground (D-0056): um turno do vendedor, em stream NDJSON, com os
 * seams por chamada — nunca o gateway real nem a Bevi real.
 *
 * - `antes`: conduta viva pura. `depois`: conduta viva + bloco do perfil.
 * - Bevi: dublê (`fixtureDiscoveryAdapter` + `MockProposalGateway`), injetado
 *   por parâmetro. Não passa por `PROPOSAL_GATEWAY` nem por `getProposalGateway`.
 * - A conversa nasce `channel=web`, `isSimulated=true`, `metadata.playground=true`.
 * - `semCapturarContato`: celular na fala do teste não vira contato/lead/conversão.
 * - O detector roda na orientação (barra com 422) e na fala do agente (só marca).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import { lerCaixa } from "@/lib/agent/box/caixa";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { simularCotaDaCarta } from "@/lib/agent/pi/tools-livres";
import { createRunTurnLivre } from "@/lib/agent/pi/turno-livre";
import { aplicarBloco, compilarPerfil } from "@/lib/playground/compilar-perfil";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import { fixtureDiscoveryAdapter } from "@/lib/playground/dubles/fixture-discovery-adapter";
import { MockProposalGateway } from "@/lib/playground/dubles/mock-proposal-gateway";
import { obterPerfil } from "@/lib/playground/repo";
import {
	atributosSchema,
	barrarPromessa,
	corpoInvalido,
	guarda,
	idSchema,
	lerJson,
	naoEncontrado,
	orientacaoSchema,
} from "../comum";

export const maxDuration = 120;

const corpoSchema = z.object({
	perfilId: z.string().uuid().optional(),
	atributos: atributosSchema.optional(),
	orientacao: orientacaoSchema.optional(),
	modo: z.enum(["antes", "depois"]),
	conversationId: z.string().uuid().optional(),
	mensagem: z.string().trim().min(1, "Escreva uma mensagem.").max(2000),
});

/** Estado da dublê por conversa: o índice do adapter vive entre turnos. */
const dublesPorConversa = new Map<
	string,
	{
		adapter: ReturnType<typeof fixtureDiscoveryAdapter>;
		gateway: MockProposalGateway;
		grupos: Map<string, GroupSummary>;
	}
>();
const MAX_DUBLES = 200;

function dublesDa(conversationId: string) {
	let d = dublesPorConversa.get(conversationId);
	if (!d) {
		if (dublesPorConversa.size >= MAX_DUBLES) {
			const primeira = dublesPorConversa.keys().next().value;
			if (primeira) dublesPorConversa.delete(primeira);
		}
		d = {
			adapter: fixtureDiscoveryAdapter(),
			gateway: new MockProposalGateway(),
			grupos: new Map(),
		};
		dublesPorConversa.set(conversationId, d);
	}
	return d;
}

export async function POST(req: Request) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const lido = await lerJson(req);
	if ("resposta" in lido) return lido.resposta;
	const parsed = corpoSchema.safeParse(lido.corpo);
	if (!parsed.success) return corpoInvalido(parsed.error);
	const corpo = parsed.data;

	const viva = await lerCaixa({ semCache: true });
	let caixa = viva;
	if (corpo.modo === "depois") {
		const perfil = corpo.perfilId ? await obterPerfil(corpo.perfilId) : null;
		if (corpo.perfilId && !perfil) return naoEncontrado();
		const atributos = corpo.atributos ?? perfil?.atributos;
		if (!atributos) {
			return Response.json(
				{ error: "No modo depois, informe perfilId ou atributos." },
				{ status: 400 },
			);
		}
		const orientacao = corpo.orientacao ?? perfil?.orientacao ?? "";
		const barrado = barrarPromessa(orientacao);
		if (barrado) return barrado;
		caixa = { ...viva, texto: aplicarBloco(viva.texto, compilarPerfil({ atributos, orientacao })) };
	}

	let conversationId = corpo.conversationId;
	if (conversationId) {
		if (!idSchema.safeParse(conversationId).success) return naoEncontrado();
		const [existente] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(and(eq(conversations.id, conversationId), eq(conversations.isSimulated, true)));
		if (!existente || existente.metadata?.playground !== true) return naoEncontrado();
	} else {
		const [criada] = await db
			.insert(conversations)
			.values({
				channel: "web",
				waId: null,
				isSimulated: true,
				metadata: { playground: true, modo: corpo.modo, criadaPor: g.email },
			})
			.returning({ id: conversations.id });
		conversationId = criada.id;
	}

	const convId = conversationId;
	const d = dublesDa(convId);
	const run = createRunTurnLivre({
		caixa,
		busca: async (params) => {
			const grupos = await d.adapter.searchGroups(params);
			for (const gr of grupos) d.grupos.set(gr.id, gr);
			return grupos;
		},
		simularCota: (params) =>
			simularCotaDaCarta({ adapter: d.adapter, params, grupo: d.grupos.get(params.groupId) }),
		gateway: d.gateway,
		semCapturarContato: true,
	});

	const enc = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const linha = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
			const baloes: string[] = [""];
			try {
				linha({
					type: "inicio",
					conversationId: convId,
					modo: corpo.modo,
					caixaVersao: caixa.versao,
				});
				const turno = run({
					channel: "web",
					conversationId: convId,
					userText: corpo.mensagem,
					isUserTurn: true,
				});
				for await (const evento of turno as AsyncGenerator<TurnEvent>) {
					if (evento.type === "text-delta") baloes[baloes.length - 1] += evento.text;
					else if (evento.type === "text-boundary") baloes.push("");
					linha({ type: "evento", evento });
				}
				const finais = baloes
					.map((texto) => texto.trim())
					.filter(Boolean)
					.map((texto) => {
						const r = detectarPromessaDeContemplacao(texto);
						return {
							texto,
							promessa: r.ok ? null : { rotulo: "PROMESSA DE CONTEMPLAÇÃO", motivo: r.motivo },
						};
					});
				linha({ type: "final", conversationId: convId, baloes: finais });
			} catch (erro) {
				console.error("[admin/playground/chat]", erro);
				linha({ type: "erro", error: "O turno falhou. Tente de novo." });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
	});
}
