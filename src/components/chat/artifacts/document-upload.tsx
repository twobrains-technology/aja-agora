"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { DocumentUploadPayload } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

// Upload de documento direto no chat (sem redirect) — é AQUI que a ficha termina.
//
// FIX-10 (teste manual Kairo 2026-06-05): cada slot sobe SILENCIOSO via
// endpoint dedicado (/api/chat/document) — nada de "Enviei meu documento" a
// cada arquivo. A conclusão é EXPLÍCITA: botão "Pronto, enviei tudo" (action
// documents-done) ou automática quando frente E verso completam. Antes, subir
// só a frente já disparava a mensagem e o bot respondia "ficha completa" sem
// dar tempo do verso. Documentos são opcionais → oferece "pular".
//
// FIX-82: `ok` agora reflete a gravação no NOSSO S3 (fonte da verdade), não
// mais o envio síncrono à Bevi — isso virou despacho best-effort, desacoplado
// da resposta (dispatch.ts). Por isso não há mais link de fallback aqui: o
// documento guardado é sempre acessível pelo operador no Kanban, mesmo se a
// Bevi estiver travada.

type Slot = "identidade_frente" | "identidade_verso";

const SLOTS: { slot: Slot; label: string }[] = [
	{ slot: "identidade_frente", label: "RG/CNH — frente" },
	{ slot: "identidade_verso", label: "RG/CNH — verso" },
];

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.split(",")[1] ?? ""); // tira o prefixo data:...;base64,
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

type SlotState = { ok: boolean };

export function DocumentUpload({ payload }: { payload: DocumentUploadPayload }) {
	const { conversationId, sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [sent, setSent] = useState<Record<string, SlotState>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [finished, setFinished] = useState(false);
	const inputs = useRef<Record<string, HTMLInputElement | null>>({});
	// Guard síncrono anti-duplo-disparo da conclusão (mesmo racional do EC-7
	// no contract-form: state só atualiza no próximo render).
	const finishedRef = useRef(false);

	const finish = (slots: Record<string, SlotState>) => {
		if (finishedRef.current) return;
		const sentSlots = SLOTS.filter(({ slot }) => slots[slot]?.ok).map(({ slot }) => slot);
		if (sentSlots.length === 0) return;
		finishedRef.current = true;
		setFinished(true);
		void sendAction({ kind: "documents-done", sentSlots }, "Enviei meus documentos");
	};

	const onPick = async (slot: Slot, file: File | undefined) => {
		if (!file) return;
		setBusy(slot);
		try {
			const fileBase64 = await fileToBase64(file);
			// Upload SILENCIOSO — sem turno de chat, sem mensagem fantasma.
			const res = await fetch("/api/chat/document", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					conversationId,
					slot,
					fileBase64,
					filename: file.name,
					mimeType: file.type || "image/jpeg",
				}),
			});
			const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean };
			setSent((s) => {
				const next: Record<string, SlotState> = {
					...s,
					[slot]: { ok: data.ok === true },
				};
				// Frente E verso completos → conclusão automática (uma mensagem só).
				if (SLOTS.every(({ slot: sl }) => next[sl]?.ok)) finish(next);
				return next;
			});
		} finally {
			setBusy(null);
		}
	};

	const anySent = SLOTS.some(({ slot }) => sent[slot]?.ok);

	return (
		<div className="w-full max-w-sm rounded-[18px] border border-border bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			{/* header */}
			<div className="flex flex-col gap-[2px]">
				<p className="text-sm font-semibold text-foreground">Envie seu documento (RG ou CNH)</p>
				<p className="text-xs text-muted-foreground">
					Frente e verso. É opcional — você pode enviar depois.
				</p>
			</div>

			{/* slots */}
			<div className="flex flex-col gap-2">
				{SLOTS.map(({ slot, label }) => (
					<div key={slot}>
						<input
							ref={(el) => {
								inputs.current[slot] = el;
							}}
							type="file"
							accept="image/*,application/pdf"
							capture="environment"
							className="hidden"
							onChange={(e) => void onPick(slot, e.target.files?.[0])}
							data-testid={`doc-input-${slot}`}
						/>
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-[10px] h-[46px] rounded-[12px] border px-[14px] text-sm font-medium cursor-pointer transition-colors",
								sent[slot]?.ok
									? "bg-[#eafaf2] border-[rgba(31,157,99,0.3)] text-success"
									: "bg-card border-border text-foreground hover:bg-muted",
								(isStreaming || busy === slot || finished) && "opacity-60 cursor-not-allowed",
							)}
							onClick={() => inputs.current[slot]?.click()}
							disabled={isStreaming || busy === slot || finished}
							data-testid={`doc-upload-${slot}`}
						>
							{busy === slot ? (
								<Loader2 className="size-4 animate-spin" />
							) : sent[slot]?.ok ? (
								<Check className="size-4" />
							) : (
								<Upload className="size-4" />
							)}
							{sent[slot]?.ok ? `${label} — enviado` : label}
						</button>
					</div>
				))}
			</div>

			{anySent && !finished ? (
				<Button
					type="button"
					className="w-full h-[40px] min-h-[44px] rounded-[13px] bg-primary text-xs font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(3,110,255,0.5)] hover:brightness-105"
					onClick={() => finish(sent)}
					disabled={isStreaming}
					data-testid="doc-done"
				>
					Pronto, enviei tudo
				</Button>
			) : null}

			{payload.optional && !finished ? (
				<button
					type="button"
					className="w-full text-xs text-muted-foreground bg-transparent border-none cursor-pointer py-1 hover:text-foreground transition-colors"
					onClick={() =>
						!isStreaming && void sendAction({ kind: "document-skip" }, "Pular documentos por agora")
					}
					disabled={isStreaming}
					data-testid="doc-skip"
				>
					Pular por agora
				</button>
			) : null}
		</div>
	);
}
