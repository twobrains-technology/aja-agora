"use client";

// ============================================================================
// O VISUALIZADOR DE CONVERSA DO ADMIN — um só.
//
// Antes dele havia seis leituras de conversa espalhadas (`ConversationTimeline`,
// `WhatsAppView`, `conversation-detail-panel`, `simulator-web`,
// `simulator-whatsapp`, `theater-chat`), cada uma decidindo por conta própria
// como mostrar a mesma linha de `messages`. Duas consequências medidas:
//
//   • o marcador cru de card aparecia na tela de quem opera o painel,
//     em vez do card que o cliente viu (ou, sem payload, de um rótulo em PT);
//   • a ordem das falas do mesmo turno não tinha critério determinístico.
//
// Este arquivo é o ponto ÚNICO de leitura: ordena, resolve o card e desenha as
// duas visões (lista e WhatsApp). `ConversationTimeline` e os diálogos de
// atendimento consomem daqui; a regra do marcador só existe neste arquivo no
// admin.
//
// ## Por que NÃO reusar `ArtifactRenderer` direto
//
// O card "como o cliente viu" vive em `src/components/chat/artifacts/**`, e todo
// card interativo chama `useChatContext()` no topo — fora do `ChatProvider` ele
// LANÇA (`useChatContext must be used within ChatProvider`, reproduzido em
// happy-dom). Montar o `ChatProvider` no admin abriria um `EventSource` vivo
// para a conversa (`provider.tsx:253`), efeito que uma tela de LEITURA não pode
// ter. Então o card é reconstruído aqui a partir do PAYLOAD do artifact — a mesma
// fonte de verdade — e, sem payload, cai no rótulo humano em português. Nunca o
// identificador cru.
// ============================================================================

import {
	type BubbleAttachment,
	WhatsAppBubble,
} from "@/components/admin/simulator/whatsapp/whatsapp-bubble";

/** Artifact como as rotas do admin o entregam: `type` + `payload` (jsonb). */
export interface ArtefatoDaMensagem {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}

/**
 * Mensagem como as telas do painel já a carregam. `mediaType` só existe quando a
 * mensagem tem anexo (coluna nullable em `messages`).
 */
export interface MensagemDaConversa {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
	artifacts?: ArtefatoDaMensagem[];
	mediaType?: string | null;
	mediaFilename?: string | null;
	/** Preenchido quando a mensagem saiu como template aprovado (HSM). */
	templateName?: string | null;
}

/**
 * A ordem canônica das falas: `createdAt` crescente e, no empate exato, a ordem
 * em que o servidor entregou o lote (sort ESTÁVEL).
 *
 * `id` NÃO serve de desempate: é `uuid DEFAULT gen_random_uuid()` (aleatório,
 * `schema.ts:439`). E não há coluna de sequência em `messages`. Ordenar só por
 * `createdAt` deixaria um empate na mão do Postgres/JS — medido em produção,
 * zero empates exatos em 10 dias (`.orientacao/b6-ordem.md`), mas a garantia
 * tem que existir no código, não no dado do momento.
 */
export function ordenarMensagens<T extends { createdAt: string }>(mensagens: readonly T[]): T[] {
	return mensagens
		.map((mensagem, ordemDeChegada) => ({ mensagem, ordemDeChegada }))
		.sort((a, b) => {
			const tA = new Date(a.mensagem.createdAt).getTime();
			const tB = new Date(b.mensagem.createdAt).getTime();
			if (tA !== tB) return tA - tB;
			return a.ordemDeChegada - b.ordemDeChegada;
		})
		.map(({ mensagem }) => mensagem);
}

/**
 * O tipo do card, quando a mensagem é um marcador de card, senão `null`.
 *
 * O predicado canônico é `ehMarcadorDeCard` (`src/lib/conversation/messages.ts`),
 * que não é importável daqui: aquele módulo carrega `@/db`. A regra é a MESMA —
 * o marcador sozinho no corpo — e este é o único ponto do admin que o escreve.
 */
export function tipoDeCard(content: string): string | null {
	const encontrado = /^\[card:\s*([^\]]+)\]$/i.exec(content.trim());
	return encontrado ? encontrado[1].trim() : null;
}

/** Rótulo humano em português por tipo de card. Nunca devolve o identificador. */
const ROTULOS_DE_CARD: Record<string, string> = {
	telefone_do_desbloqueio: "Pediu o WhatsApp para liberar a comparação",
	comparison_table: "Mostrou a comparação dos grupos",
	recommendation_card: "Mostrou a recomendação de grupo",
	group_card: "Mostrou um grupo",
	simulation_result: "Mostrou a simulação da parcela",
	scenarios: "Mostrou cenários de lance",
	financing_comparison: "Mostrou a comparação com financiamento",
	contemplation_dial: "Mostrou o dial de contemplação",
	embedded_bid: "Mostrou o lance embutido",
	two_paths: "Mostrou dois caminhos de decisão",
	scarcity: "Mostrou a disponibilidade da cota",
	quick_reply: "Mostrou atalhos de resposta",
	value_picker: "Pediu o valor do bem",
	topic_picker: "Pediu o tipo do bem",
	lead_form: "Abriu o formulário de contato",
	contract_form: "Abriu o formulário de contrato",
	document_upload: "Pediu o envio de documento",
	whatsapp_optin: "Pediu a autorização do WhatsApp",
	decision_prompt: "Pediu a decisão do cliente",
	real_offer: "Apresentou a carta da oferta",
	signature_handoff: "Encaminhou para a assinatura",
	atendimento_handoff: "Encaminhou para atendimento humano",
};

/** Rótulo do card em PT. Tipo desconhecido cai num genérico — nunca no `type`. */
export function rotuloDoCard(tipo: string): string {
	return ROTULOS_DE_CARD[tipo] ?? "Card enviado ao cliente";
}

const formatadorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarBRL(valor: unknown): string | null {
	const numero = Number(valor);
	if (!Number.isFinite(numero)) return null;
	return formatadorBRL.format(numero);
}

function texto(valor: unknown): string | null {
	return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : null;
}

/** Detalhes legíveis a partir do payload. `null` quando não há o que acrescentar. */
function detalhesDoCard(tipo: string, payload: Record<string, unknown>): string | null {
	const parcela = formatarBRL(payload.monthlyPayment);
	const credito = formatarBRL(payload.creditValue);
	const prazo = Number.isFinite(Number(payload.termMonths)) ? `${payload.termMonths} meses` : null;

	switch (tipo) {
		case "group_card":
		case "recommendation_card":
		case "simulation_result": {
			const partes = [texto(payload.administradora), parcela, credito, prazo].filter(Boolean);
			return partes.length > 0 ? partes.join(" · ") : null;
		}
		case "comparison_table": {
			const grupos = Array.isArray(payload.groups) ? payload.groups : [];
			if (grupos.length === 0) return null;
			const melhor = grupos[0] as Record<string, unknown>;
			const resumo = [texto(melhor.administradora), formatarBRL(melhor.monthlyPayment)]
				.filter(Boolean)
				.join(" · ");
			return `${grupos.length} grupos${resumo ? ` — melhor: ${resumo}` : ""}`;
		}
		case "quick_reply": {
			const opcoes = Array.isArray(payload.options) ? payload.options : [];
			const rotulos = opcoes
				.map((o) => texto((o as Record<string, unknown>).label))
				.filter((r): r is string => r !== null);
			return rotulos.length > 0 ? rotulos.join(" · ") : null;
		}
		case "scarcity": {
			const vagas = Number(payload.availableSlots);
			const partes = [
				Number.isFinite(vagas) ? `${vagas} vagas` : null,
				texto(payload.administradora),
			].filter(Boolean);
			return partes.length > 0 ? partes.join(" · ") : null;
		}
		case "two_paths": {
			const partes = [texto(payload.administradora), parcela].filter(Boolean);
			return partes.length > 0 ? partes.join(" · ") : null;
		}
		case "telefone_do_desbloqueio": {
			const estado = texto(payload.estado);
			return estado === "borrado"
				? "Variante B — opções borradas até informar o telefone"
				: estado === "pede-antes"
					? "Variante A — a comparação vem depois do telefone"
					: null;
		}
		case "value_picker":
		case "topic_picker": {
			const categoria = texto(payload.category);
			return categoria ? `Categoria: ${categoria}` : null;
		}
		default:
			return null;
	}
}

/** O card como o admin o lê: rótulo humano + os fatos do payload. */
export function CardLegivel({
	tipo,
	payload,
}: {
	tipo: string;
	payload?: Record<string, unknown>;
}) {
	const detalhes = payload ? detalhesDoCard(tipo, payload) : null;
	return (
		<div
			data-testid="card-legivel"
			data-tipo={tipo}
			className="rounded-md border bg-muted/50 px-3 py-2 text-xs"
		>
			<span className="font-medium">{rotuloDoCard(tipo)}</span>
			{detalhes && <span className="block text-muted-foreground">{detalhes}</span>}
		</div>
	);
}

/**
 * O corpo de UMA mensagem: texto da fala, ou o card (via payload) / rótulo
 * humano quando a linha é um marcador de card. Nunca devolve o marcador cru.
 */
export function ConteudoDaMensagem({
	content,
	artifacts = [],
}: {
	content: string;
	artifacts?: ArtefatoDaMensagem[];
}) {
	const tipo = tipoDeCard(content);

	if (!tipo) {
		return (
			<>
				{content}
				{artifacts.map((artefato) => (
					<CardLegivel key={artefato.id} tipo={artefato.type} payload={artefato.payload} />
				))}
			</>
		);
	}

	const doMarcador = artifacts.find((artefato) => artefato.type === tipo);
	return <CardLegivel tipo={tipo} payload={doMarcador?.payload} />;
}

/**
 * A conversa inteira, na visão de lista (registro) ou de WhatsApp (atendimento).
 *
 * `system` não é renderizado: é ruído de máquina que o cliente nunca viu.
 */
export function Conversa({
	mensagens,
	modo = "lista",
	vazio = "Nenhuma mensagem nesta conversa ainda.",
}: {
	mensagens: MensagemDaConversa[];
	modo?: "lista" | "whatsapp";
	vazio?: string;
}) {
	const visiveis = ordenarMensagens(mensagens).filter((m) => m.role !== "system");

	if (visiveis.length === 0) {
		return (
			<div
				data-testid="conversa"
				data-modo={modo}
				className="rounded-lg border bg-[#efeae2] p-6 text-center text-sm text-muted-foreground dark:bg-[#0b141a]"
			>
				{vazio}
			</div>
		);
	}

	if (modo === "whatsapp") {
		return (
			<div
				data-testid="conversa"
				data-modo="whatsapp"
				// O bege é o fundo do WhatsApp. Não é enfeite: é o que faz o atendente
				// reconhecer na hora que está vendo a conversa como o cliente a vê.
				className="overflow-y-auto rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]"
			>
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
					{visiveis.map((m) => {
						const tipo = tipoDeCard(m.content);
						return (
							<WhatsAppBubble
								key={m.id}
								// O cliente é `user`; agente e atendente humano saem do mesmo lado,
								// porque pro cliente os dois são "a empresa".
								direction={m.role === "user" ? "received" : "sent"}
								text={tipo ? "" : m.content}
								createdAt={m.createdAt}
								attachment={anexoDe(m)}
								ehTemplate={Boolean(m.templateName)}
							>
								{tipo ? <ConteudoDaMensagem content={m.content} artifacts={m.artifacts} /> : null}
							</WhatsAppBubble>
						);
					})}
				</div>
			</div>
		);
	}

	return (
		<div data-testid="conversa" data-modo="lista" className="flex flex-col gap-3 p-4">
			{visiveis.map((m) => {
				const ehCliente = m.role === "user";
				return (
					<div key={m.id} className={`flex flex-col ${ehCliente ? "items-start" : "items-end"}`}>
						<span className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground">
							{ehCliente ? "Cliente" : "Agente"}
						</span>
						<div
							className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
								ehCliente ? "bg-blue-100 dark:bg-blue-900/30" : "bg-muted"
							}`}
						>
							<ConteudoDaMensagem content={m.content} artifacts={m.artifacts} />
						</div>
						<span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
							{new Date(m.createdAt).toLocaleString("pt-BR", {
								day: "2-digit",
								month: "2-digit",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					</div>
				);
			})}
		</div>
	);
}

/** Anexo exibido dentro da bolha; endpoint que assina na hora. */
export function anexoDe(m: MensagemDaConversa): BubbleAttachment | null {
	if (!m.mediaType) return null;
	const tipo =
		m.mediaType === "image" || m.mediaType === "audio" || m.mediaType === "video"
			? m.mediaType
			: ("document" as const);
	return {
		tipo,
		url: `/api/admin/messages/${m.id}/media`,
		filename: m.mediaFilename,
	};
}
