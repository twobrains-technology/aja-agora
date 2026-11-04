"use client";

import { ChatMessage } from "@/components/chat/chat-message";
import type { TurnoDaSimulacao } from "@/lib/playground/simulacao/tipos";
import { turnoParaMensagens } from "./eventos-para-mensagem";

/** Leitura da conversa: cliente (IA) e vendedor com selo de texto; cards só para ver. */
export function Transcricao({ turnos }: { turnos: TurnoDaSimulacao[] }) {
	if (turnos.length === 0) {
		return <p className="text-muted-foreground text-sm">Nenhum turno ainda.</p>;
	}
	return (
		<ol aria-label="Transcrição da simulação" className="space-y-4">
			{turnos.map((t) => {
				const [usuario, vendedor] = turnoParaMensagens(t, `turno-${t.indice}`);
				const promessas = t.vendedor.baloesFinais.filter((b) => b.promessa !== null);
				return (
					<li key={t.indice} className="space-y-2 rounded border p-2">
						<div className="text-muted-foreground text-xs">
							Turno {t.indice + 1} · {Math.round(t.duracaoMs)} ms
						</div>
						<div className="space-y-1">
							<div className="text-xs font-medium">Cliente (IA) · fala {t.cliente.origem}</div>
							<ChatMessage message={usuario} />
						</div>
						<div className="space-y-1">
							<div className="text-xs font-medium">
								Vendedor
								{t.vendedor.erro ? ` · ERRO: ${t.vendedor.erro}` : ""}
							</div>
							{vendedor ? (
								<ChatMessage message={vendedor} />
							) : (
								<p className="text-sm">(sem resposta do vendedor)</p>
							)}
							{promessas.map((b) => (
								<div key={b.texto} className="text-xs font-bold">
									PROMESSA DE CONTEMPLAÇÃO · {b.promessa?.rotulo}
								</div>
							))}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
