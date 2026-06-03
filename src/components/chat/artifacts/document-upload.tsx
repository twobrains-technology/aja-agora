"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { DocumentUploadPayload } from "@/lib/chat/types";

// Upload de documento direto no chat (sem redirect) — é AQUI que a ficha termina.
// O arquivo vai em base64 via action document-upload; o servidor manda pro portal
// CONEXIA (POC). Documentos são opcionais → oferece "pular".

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

export function DocumentUpload({ payload }: { payload: DocumentUploadPayload }) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [sent, setSent] = useState<Record<string, boolean>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const inputs = useRef<Record<string, HTMLInputElement | null>>({});

	const onPick = async (slot: Slot, file: File | undefined) => {
		if (!file) return;
		setBusy(slot);
		try {
			const fileBase64 = await fileToBase64(file);
			await sendAction(
				{ kind: "document-upload", slot, fileBase64, filename: file.name, mimeType: file.type || "image/jpeg" },
				"Enviei meu documento",
			);
			setSent((s) => ({ ...s, [slot]: true }));
		} finally {
			setBusy(null);
		}
	};

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
								variant={sent[slot] ? "secondary" : "outline"}
								size="sm"
								className="w-full justify-start gap-2 min-h-[44px]"
								onClick={() => inputs.current[slot]?.click()}
								disabled={isStreaming || busy === slot}
								data-testid={`doc-upload-${slot}`}
							>
								{busy === slot ? (
									<Loader2 className="size-4 animate-spin" />
								) : sent[slot] ? (
									<Check className="size-4 text-primary" />
								) : (
									<Upload className="size-4" />
								)}
								{sent[slot] ? `${label} — enviado` : label}
							</Button>
						</div>
					))}
				</div>

				{payload.optional ? (
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
