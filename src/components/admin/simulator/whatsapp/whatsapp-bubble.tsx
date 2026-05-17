import { CheckCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppBubbleProps {
	direction: "sent" | "received";
	text: string;
	createdAt: string;
}

/**
 * Bolha de mensagem no estilo WhatsApp. Verde (#d9fdd3 / #005c4b) pra sent,
 * branca/cinza pra received. Inclui timestamp e double-check (azul) em sent.
 */
export function WhatsAppBubble({ direction, text, createdAt }: WhatsAppBubbleProps) {
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
