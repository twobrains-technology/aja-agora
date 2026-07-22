"use client";

import {
	MoreVerticalIcon,
	PaperclipIcon,
	PhoneIcon,
	SendIcon,
	SmileIcon,
	VideoIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateId } from "@/lib/utils/id";
import type { SimulatorClientEvent } from "@/lib/whatsapp/simulator-bus";
import { WhatsAppBubble } from "./whatsapp-bubble";
import { type InteractivePayload, WhatsAppInteractive } from "./whatsapp-interactive";
import { WhatsAppTyping } from "./whatsapp-typing";

type Item =
	| { kind: "bubble"; id: string; direction: "sent" | "received"; text: string; createdAt: string }
	| { kind: "interactive"; id: string; payload: InteractivePayload; createdAt: string };

export type WhatsAppStageItem = Item;

interface WhatsAppStageProps {
	conversationId: string;
	/**
	 * Mensagens já persistidas pra hidratar o stage ao re-abrir a conversa.
	 * Sem isso, o stage zera ao conectar no SSE e perde o histórico do DB.
	 */
	initialItems?: WhatsAppStageItem[];
}

/**
 * Container ~440px no centro, simulando uma tela WhatsApp.
 * - Header com avatar do agente + nome + status
 * - Pattern de fundo (cores aproximadas — pixel-perfect fora de escopo)
 * - Lista de bolhas + typing indicator
 * - Input rounded com ícones decorativos
 *
 * Conecta no SSE /stream e envia via /send. Tudo gateado por dev-only no backend.
 */
export function WhatsAppStage({ conversationId, initialItems }: WhatsAppStageProps) {
	const [items, setItems] = useState<Item[]>(() => initialItems ?? []);
	const [isTyping, setIsTyping] = useState(false);
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [connection, setConnection] = useState<"connecting" | "connected" | "error">("connecting");
	const endRef = useRef<HTMLDivElement | null>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const interactiveLockRef = useRef(false);

	// Snapshot do seed pra usar dentro do effect SSE sem virar dep dinâmica.
	// Pai usa `key={conversationId}` pra remontar quando a conversa muda, então
	// esse ref nunca é "stale" no contexto desse mount.
	const initialItemsRef = useRef<Item[] | undefined>(initialItems);
	initialItemsRef.current = initialItems;

	// SSE: assina eventos do agente
	// biome-ignore lint/correctness/useExhaustiveDependencies: initialItems entra pelo ref acima de propósito — vira dep dinâmica e re-abre a conexão SSE a cada render. O pai remonta via key={conversationId}, então o ref nunca fica stale.
	useEffect(() => {
		if (!conversationId) return;
		// Em vez de zerar, hidrata com o histórico vindo do pai (re-abrir
		// conversa simulada). Conexão SSE só carrega eventos NOVOS — sem isso
		// o histórico persistido desaparece da UI.
		setItems(initialItemsRef.current ?? []);
		setIsTyping(false);
		setConnection("connecting");
		const es = new EventSource(`/api/admin/simulator/whatsapp/${conversationId}/stream`);
		es.onmessage = (e) => {
			let payload: { type: string; event?: SimulatorClientEvent };
			try {
				payload = JSON.parse(e.data);
			} catch {
				return;
			}
			if (payload.type === "connected") {
				setConnection("connected");
				return;
			}
			if (payload.type === "ping") return;
			if (payload.type === "event" && payload.event) {
				handleAgentEvent(payload.event);
			}
		};
		es.onerror = () => setConnection("error");
		return () => {
			es.close();
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		};
	}, [conversationId]);

	// Auto-scroll
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	function handleAgentEvent(event: SimulatorClientEvent) {
		if (event.type === "typing") {
			setIsTyping(event.on);
			if (event.on) {
				// safety timeout: limpa após 15s sem mensagem nova
				if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 15_000);
			}
			return;
		}
		// Mensagem chegou — limpa typing
		setIsTyping(false);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

		if (event.type === "text") {
			setItems((prev) => [
				...prev,
				{
					kind: "bubble",
					id: event.id,
					direction: "received",
					text: event.text,
					createdAt: event.createdAt,
				},
			]);
			interactiveLockRef.current = false;
		} else if (event.type === "interactive") {
			setItems((prev) => [
				...prev,
				{
					kind: "interactive",
					id: event.id,
					payload: event.interactive as unknown as InteractivePayload,
					createdAt: event.createdAt,
				},
			]);
			interactiveLockRef.current = false;
		}
		setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
	}

	const sendText = useCallback(async () => {
		const text = input.trim();
		if (!text || sending) return;
		setSending(true);
		// Optimistic — bolha verde aparece já.
		const optimistic: Item = {
			kind: "bubble",
			id: `local-${generateId()}`,
			direction: "sent",
			text,
			createdAt: new Date().toISOString(),
		};
		setItems((prev) => [...prev, optimistic]);
		setInput("");
		setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
		try {
			const res = await fetch(`/api/admin/simulator/whatsapp/${conversationId}/send`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "text", text }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		} catch (err) {
			setItems((prev) => [
				...prev,
				{
					kind: "bubble",
					id: `err-${generateId()}`,
					direction: "received",
					text: `[erro ao enviar: ${err instanceof Error ? err.message : String(err)}]`,
					createdAt: new Date().toISOString(),
				},
			]);
		} finally {
			setSending(false);
		}
	}, [conversationId, input, sending]);

	const sendInteractive = useCallback(
		async (replyId: string, replyTitle: string) => {
			if (interactiveLockRef.current) return;
			interactiveLockRef.current = true;
			// Mostra a escolha como bolha enviada (como o WhatsApp real faz)
			setItems((prev) => [
				...prev,
				{
					kind: "bubble",
					id: `local-${generateId()}`,
					direction: "sent",
					text: replyTitle,
					createdAt: new Date().toISOString(),
				},
			]);
			setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
			try {
				const res = await fetch(`/api/admin/simulator/whatsapp/${conversationId}/send`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ kind: "interactive", replyId, replyTitle }),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
			} catch (err) {
				interactiveLockRef.current = false;
				setItems((prev) => [
					...prev,
					{
						kind: "bubble",
						id: `err-${generateId()}`,
						direction: "received",
						text: `[erro ao responder botão: ${err instanceof Error ? err.message : String(err)}]`,
						createdAt: new Date().toISOString(),
					},
				]);
			}
		},
		[conversationId],
	);

	return (
		<div className="mx-auto flex h-full w-full max-w-[440px] flex-col overflow-hidden border bg-[#efeae2] dark:bg-[#0b141a]">
			{/* Header WhatsApp */}
			<div className="flex items-center gap-3 bg-[#008069] px-3 py-2 text-white dark:bg-[#202c33]">
				<div className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
					A
				</div>
				<div className="flex-1 leading-tight">
					<div className="text-sm font-semibold">Aja Agora</div>
					<div className="text-[11px] opacity-80">
						{connection === "connected"
							? "online"
							: connection === "connecting"
								? "conectando..."
								: "offline (simulador)"}
					</div>
				</div>
				<VideoIcon className="size-4 opacity-90" />
				<PhoneIcon className="size-4 opacity-90" />
				<MoreVerticalIcon className="size-4 opacity-90" />
			</div>

			{/* Pattern + mensagens */}
			<div className="flex-1 overflow-y-auto p-3">
				<div className="flex flex-col gap-1.5">
					{items.length === 0 && !isTyping && (
						<div className="mx-auto max-w-[80%] rounded-md bg-[#fff3c4] px-3 py-2 text-center text-xs text-[#54452d] shadow-sm dark:bg-[#182229] dark:text-muted-foreground">
							Digite uma mensagem pra iniciar a conversa com o agente.
						</div>
					)}
					{items.map((it) =>
						it.kind === "bubble" ? (
							<WhatsAppBubble
								key={it.id}
								direction={it.direction}
								text={it.text}
								createdAt={it.createdAt}
							/>
						) : (
							<WhatsAppInteractive
								key={it.id}
								payload={it.payload}
								onReply={(rid, rtitle) => void sendInteractive(rid, rtitle)}
							/>
						),
					)}
					{isTyping && <WhatsAppTyping />}
					<div ref={endRef} />
				</div>
			</div>

			{/* Input WhatsApp */}
			<div className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2 dark:bg-[#202c33]">
				<SmileIcon className="size-5 text-muted-foreground" />
				<PaperclipIcon className="size-5 text-muted-foreground" />
				<Input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void sendText();
						}
					}}
					placeholder="Mensagem"
					disabled={sending}
					className="h-9 rounded-full bg-white dark:bg-[#2a3942]"
				/>
				<Button
					size="icon"
					onClick={() => void sendText()}
					disabled={sending || !input.trim()}
					className="size-9 rounded-full bg-[#008069] hover:bg-[#006b58]"
				>
					<SendIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}
