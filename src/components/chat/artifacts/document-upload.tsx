"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { DocumentUploadPayload } from "@/lib/chat/types";

// Upload de documento direto no chat (sem redirect) — é AQUI que a ficha termina.
//
// FIX-10 (teste manual Kairo 2026-06-05): cada slot sobe SILENCIOSO via
// endpoint dedicado (/api/chat/document) — nada de "Enviei meu documento" a
// cada arquivo. A conclusão é EXPLÍCITA: botão "Pronto, enviei tudo" (action
// documents-done) ou automática quando frente E verso completam. Antes, subir
// só a frente já disparava a mensagem e o bot respondia "ficha completa" sem
// dar tempo do verso. Documentos são opcionais → oferece "pular".

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

type SlotState = { ok: boolean; fallbackLink?: string | null };

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
		void sendAction(
			{ kind: "documents-done", sentSlots },
			"Enviei meus documentos",
		);
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
			const data = (await res.json().catch(() => ({ ok: false }))) as {
				ok?: boolean;
				fallbackLink?: string | null;
			};
			setSent((s) => {
				const next: Record<string, SlotState> = {
					...s,
					[slot]: { ok: data.ok === true, fallbackLink: data.fallbackLink ?? null },
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
	const fallbackLinks = SLOTS.map(({ slot }) => sent[slot]?.fallbackLink).filter(
		(l): l is string => typeof l === "string" && l.length > 0,
	);

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				<p className="text-sm font-medium">Envie seu documento (RG ou CNH)</p>
				<p className="text-xs text-muted-foreground">
					Frente e verso. É opcional — você pode enviar depois.
				</p>

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
							<Button
								type="button"
								variant={sent[slot]?.ok ? "secondary" : "outline"}
								size="sm"
								className="w-full justify-start gap-2 min-h-[44px]"
								onClick={() => inputs.current[slot]?.click()}
								disabled={isStreaming || busy === slot || finished}
								data-testid={`doc-upload-${slot}`}
							>
								{busy === slot ? (
									<Loader2 className="size-4 animate-spin" />
								) : sent[slot]?.ok ? (
									<Check className="size-4 text-primary" />
								) : (
									<Upload className="size-4" />
								)}
								{sent[slot]?.ok ? `${label} — enviado` : label}
							</Button>
						</div>
					))}
				</div>

				{fallbackLinks.length > 0 ? (
					<p className="text-xs text-muted-foreground">
						Não consegui anexar por aqui — finalize neste link:{" "}
						<a
							href={fallbackLinks[0]}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2"
						>
							{fallbackLinks[0]}
						</a>
					</p>
				) : null}

				{anySent && !finished ? (
					<Button
						type="button"
						size="sm"
						className="w-full min-h-[44px]"
						onClick={() => finish(sent)}
						disabled={isStreaming}
						data-testid="doc-done"
					>
						Pronto, enviei tudo
					</Button>
				) : null}

				{payload.optional && !finished ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="w-full"
						onClick={() =>
							!isStreaming && void sendAction({ kind: "document-skip" }, "Pular documentos por agora")
						}
						disabled={isStreaming}
						data-testid="doc-skip"
					>
						Pular por agora
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}
