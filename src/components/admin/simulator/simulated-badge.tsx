import { FlaskConicalIcon } from "lucide-react";

/**
 * Header de "conversa simulada" — sempre visível em cima do chat do simulador
 * pra deixar 100% claro que nada do que rolar aqui é cliente real.
 */
export function SimulatedBadge({ authorName }: { authorName: string | null }) {
	return (
		<div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
			<FlaskConicalIcon className="size-3.5 text-amber-600" />
			<span className="font-medium">SIMULAÇÃO</span>
			{authorName && <span className="text-muted-foreground">— criada por {authorName}</span>}
		</div>
	);
}
