"use client";

import { useEffect, useRef, useState } from "react";

import { ChatProvider, useChatContext } from "@/lib/chat/provider";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { cn } from "@/lib/utils";
import { ChatInput } from "../chat-input";
import { MessageList } from "../message-list";
import { ResumePrompt } from "./resume-prompt";
import type { SeedOrigin } from "./theater-context";

interface TheaterChatProps {
	/** Mensagem-semente: não-vazia vira a próxima mensagem do usuário; vazia abre na saudação/retomada. */
	seed: string;
	/** Quem escreveu a semente — o cliente (`digitada`) ou o botão (`chip`). */
	seedOrigin?: SeedOrigin;
	/** Quando o morph assentou — controla o fade-in do stage + footer. */
	settled: boolean;
}

type ResumePayload = {
	conversationId: string;
	messages: {
		id: string;
		role: "user" | "assistant";
		content: string;
		artifact?: { type: string; payload: unknown };
	}[];
	messageCount: number;
	gate?: { kind: string } | null;
	lastActivityAt: string;
	meaningfulProgress: boolean;
};

type ResumeState =
	| { phase: "loading" }
	// FIX-51: gate de escolha entre "achei conversa retomável" e "montei o chat".
	| {
			phase: "prompt";
			conversationId: string;
			messages: AjaUIMessage[];
			lastActivityAt: string;
	  }
	| { phase: "ready"; conversationId?: string; messages?: AjaUIMessage[] };

/** Converte o payload do resume nas mensagens hidratadas (FIX-49: marca resumed). */
function toResumedMessages(conv: ResumePayload): AjaUIMessage[] {
	return conv.messages.map(
		(m) =>
			({
				id: m.id,
				role: m.role,
				// Card volta como CARD. Antes tudo virava `text`, então ao retomar/dar
				// refresh o cliente via a linha marcadora "[card: tipo]" em vez do
				// componente.
				parts: [
					...(m.content ? [{ type: "text", text: m.content }] : []),
					...(m.artifact
						? [
								{
									type: "data-artifact",
									id: `${m.id}-artifact`,
									data: { type: m.artifact.type, payload: m.artifact.payload },
								},
							]
						: []),
				],
				// FIX-49: marca o histórico hidratado — a UI ancora o scroll, mostra a
				// âncora "Você voltou" e sela artifacts/gates antigos.
				metadata: { resumed: true },
			}) as AjaUIMessage,
	);
}

/** Card do gate pendente, devolvido pelo resume, como última mensagem do
 * assistente. Sem ele a retomada volta muda: o agente repete a pergunta e
 * nenhum componente de input aparece. */
function comGatePendente(conv: ResumePayload, msgs: AjaUIMessage[]): AjaUIMessage[] {
	if (!conv.gate) return msgs;
	return [
		...msgs,
		{
			id: `${conv.conversationId}-gate-retomada`,
			role: "assistant",
			parts: [{ type: "data-gate", id: `${conv.conversationId}-gate`, data: conv.gate }],
			metadata: { resumed: true },
		} as unknown as AjaUIMessage,
	];
}

/**
 * O chat de produção REAL renderizado dentro do painel teatro — único ponto de
 * chat do produto (a rota /chat foi removida). Ao abrir, consulta
 * GET /api/chat/resume (FIX-46): se houver conversa same-device vinculada ao
 * cookie `aja_uid`, reidrata o histórico e CONTINUA de onde parou; o seed (texto
 * digitado / categoria clicada) vira a próxima mensagem dessa conversa. Sem
 * conversa anterior → conversa fresca (seed = 1ª mensagem, ou saudação se vazio).
 * ZERO mock — bate em /api/chat como produção.
 */
export function TheaterChat({ seed, seedOrigin = "digitada", settled }: TheaterChatProps) {
	const [resume, setResume] = useState<ResumeState>({ phase: "loading" });

	// Busca a retomada uma vez por abertura do teatro (o componente remonta a
	// cada open/close). A janela de fetch coincide com a animação de entrada.
	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const res = await fetch("/api/chat/resume", {
					headers: { "cache-control": "no-cache" },
				});
				const data = res.ok ? await res.json() : { conversation: null };
				const conv = (data?.conversation ?? null) as ResumePayload | null;
				if (!alive) return;
				if (conv && conv.messages.length > 0) {
					// FIX-51: COM progresso real → popup de escolha (voltar/nova). Sem
					// progresso (1-2 falas) → hidrata direto, sem perguntar (zero ruído).
					if (conv.meaningfulProgress) {
						setResume({
							phase: "prompt",
							conversationId: conv.conversationId,
							messages: comGatePendente(conv, toResumedMessages(conv)),
							lastActivityAt: conv.lastActivityAt,
						});
					} else {
						setResume({
							phase: "ready",
							conversationId: conv.conversationId,
							messages: comGatePendente(conv, toResumedMessages(conv)),
						});
					}
				} else {
					setResume({ phase: "ready" });
				}
			} catch {
				if (alive) setResume({ phase: "ready" });
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	// Enquanto resolve a retomada, segura o mount do ChatProvider (ele lê o
	// estado inicial no primeiro render). O shell vazio respeita o fade do morph.
	if (resume.phase === "loading") {
		return <TheaterStage settled={settled} />;
	}

	// FIX-51: gate de escolha — palco vazio atrás + popup por cima. Só sai pra
	// "ready" por uma das duas ações (o ChatProvider não monta antes da escolha).
	if (resume.phase === "prompt") {
		return (
			<>
				<TheaterStage settled={settled} />
				<ResumePrompt
					lastActivityAt={resume.lastActivityAt}
					onResume={() =>
						setResume({
							phase: "ready",
							conversationId: resume.conversationId,
							messages: resume.messages,
						})
					}
					// "Começar nova": thread limpa (sem initialMessages/conversationId). O
					// cookie aja_uid é preservado → mesmo contato/identidade no POST /api/chat
					// (não vira lead órfão). A conversa anterior fica no DB; a recência da
					// nova a supersede no próximo resume. Ver ADR Decisão 2.
					onFresh={() => setResume({ phase: "ready" })}
				/>
			</>
		);
	}

	const retomando = Boolean(resume.messages?.length);
	const seedDoCliente = seedOrigin === "chip" && retomando ? "" : seed.trim();
	const seedDeAbertura = seedDoCliente || (retomando ? "Voltei" : "");

	return (
		<ChatProvider initialConversationId={resume.conversationId} initialMessages={resume.messages}>
			{/* Retomada sem nada digitado: o cliente anuncia que voltou. Sem esse
			    sinal o agente ficava mudo esperando, sem chance de retomar o fio
			    ("você estava vendo a ITAÚ, quer seguir daí?") — reusa o MESMO
			    caminho do seed, então é mensagem de verdade, não turno fantasma.
			    Numa conversa JÁ em andamento, a frase do chip ("Quero comprar um
			    carro.") não é fala do cliente: é só o botão pelo qual ele reentrou.
			    Reenviá-la fazia a conversa parecer reiniciada no meio do funil —
			    quem volta diz "Voltei". Só o que ele DIGITOU sobrevive à retomada. */}
			<TheaterChatBody seed={seedDeAbertura} settled={settled} />
		</ChatProvider>
	);
}

/** Casca visual do palco (stage + footer), reusada no loading e no chat montado. */
function TheaterStage({ settled, children }: { settled: boolean; children?: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-hidden bg-background transition-opacity duration-300",
				settled ? "opacity-100" : "opacity-0",
			)}
		>
			<div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col overflow-hidden">
				{children}
			</div>
		</div>
	);
}

function TheaterChatBody({ seed, settled }: TheaterChatProps) {
	const { messages, status, regenerate, error, sendUserMessage } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	// `sendUserMessage` muda de identidade a cada render (depende do objeto do
	// useChat). Guardamos a referência mais recente num ref pra NÃO colocá-la nas
	// deps do effect — senão o cleanup/re-run mata o timer de 480ms antes dele
	// disparar (agravado pelo double-invoke do StrictMode em dev).
	const sendRef = useRef(sendUserMessage);
	sendRef.current = sendUserMessage;

	// Semente → próxima mensagem do usuário, depois do morph assentar. Vale tanto
	// pra conversa fresca (1ª mensagem) quanto pra retomada (continua a conversa).
	// Depende só de `seed` (estável durante a sessão do teatro), então roda uma vez.
	useEffect(() => {
		const trimmed = seed.trim();
		if (!trimmed) return;
		const timer = setTimeout(() => {
			void sendRef.current(trimmed);
		}, 480);
		return () => clearTimeout(timer);
	}, [seed]);

	return (
		<>
			<TheaterStage settled={settled}>
				<MessageList
					messages={messages}
					isStreaming={isStreaming}
					hasError={!!error}
					onRetry={regenerate}
				/>
			</TheaterStage>
			<div
				className={cn(
					"shrink-0 transition-opacity duration-300",
					settled ? "opacity-100" : "opacity-0",
				)}
			>
				<ChatInput isStreaming={isStreaming} variant="theater" />
			</div>
		</>
	);
}
