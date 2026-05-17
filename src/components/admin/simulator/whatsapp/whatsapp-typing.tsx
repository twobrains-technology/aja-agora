/**
 * Bolha de "digitando..." (3 dots animados). Renderizada do lado received.
 */
export function WhatsAppTyping() {
	return (
		<div className="flex w-full justify-start">
			<div className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-[#202c33]">
				<span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
				<span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
				<span className="size-2 animate-bounce rounded-full bg-muted-foreground" />
			</div>
		</div>
	);
}
