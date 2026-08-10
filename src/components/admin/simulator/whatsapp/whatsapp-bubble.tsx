import { CheckCheckIcon, FileTextIcon, MicIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Anexo exibido dentro da bolha. `url` é o endpoint que assina e redireciona
 *  (`/api/admin/messages/[id]/media`) — nunca uma URL assinada guardada. */
export interface BubbleAttachment {
	tipo: "image" | "document" | "audio";
	url: string;
	filename?: string | null;
}

interface WhatsAppBubbleProps {
	direction: "sent" | "received";
	text: string;
	createdAt: string;
	attachment?: BubbleAttachment | null;
}

/**
 * Bolha de mensagem no estilo WhatsApp. Verde (#d9fdd3 / #005c4b) pra sent,
 * branca/cinza pra received. Inclui timestamp e double-check (azul) em sent.
 *
 * Com anexo, a bolha vira o container dele: imagem aparece inline (é o que o
 * atendente precisa ver sem clicar), documento e áudio viram bloco clicável —
 * áudio não usa `<audio>` porque a URL é assinada e de vida curta, e um player
 * que quebra no meio é pior do que abrir numa aba.
 */
export function WhatsAppBubble({ direction, text, createdAt, attachment }: WhatsAppBubbleProps) {
	const time = new Date(createdAt).toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const sent = direction === "sent";
	return (
		<div className={cn("flex w-full", sent ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"relative max-w-[80%] rounded-lg px-2.5 pt-1.5 pb-1 text-sm shadow-sm",
					sent
						? "bg-[#d9fdd3] text-[#111] dark:bg-[#005c4b] dark:text-white"
						: "bg-white text-[#111] dark:bg-[#202c33] dark:text-white",
				)}
			>
				{attachment && (
					<a href={attachment.url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
						{attachment.tipo === "image" ? (
							// biome-ignore lint/performance/noImgElement: URL assinada de vida curta e host dinâmico (S3/MinIO) — o otimizador do Next não a serve.
							<img
								src={attachment.url}
								alt={attachment.filename ?? "Imagem enviada na conversa"}
								className="max-h-64 w-full rounded object-cover"
							/>
						) : (
							<span className="flex items-center gap-2 rounded bg-black/5 px-2 py-1.5 dark:bg-white/10">
								{attachment.tipo === "audio" ? (
									<MicIcon className="size-4 shrink-0" aria-hidden />
								) : (
									<FileTextIcon className="size-4 shrink-0" aria-hidden />
								)}
								<span className="min-w-0 flex-1 truncate underline">
									{attachment.filename ?? (attachment.tipo === "audio" ? "Áudio" : "Documento")}
								</span>
							</span>
						)}
					</a>
				)}
				<div className="whitespace-pre-wrap break-words pr-12">{text}</div>
				<div
					className={cn(
						"pointer-events-none absolute right-2 bottom-1 flex items-center gap-1 text-[10px] opacity-70",
					)}
				>
					<span>{time}</span>
					{sent && <CheckCheckIcon className="size-3 text-sky-500" />}
				</div>
			</div>
		</div>
	);
}
