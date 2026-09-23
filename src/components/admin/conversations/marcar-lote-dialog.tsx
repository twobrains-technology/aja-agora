"use client";

/**
 * A CONFIRMAÇÃO DO LOTE — marcar (ou voltar) N conversas como teste.
 *
 * **Por que existe uma confirmação, e não um botão direto.** Marcar teste tira a
 * conversa do funil, das métricas e da régua — e a lista de conversas é uma tela
 * de operação, onde um clique errado com "selecionar todos" marcado levaria a
 * página inteira junto. A confirmação diz o TAMANHO da operação ("12 conversas")
 * antes de ela acontecer, e é reversível depois: desmarcar volta as conversas a
 * contar (as linhas da régua seguradas não voltam — ver o PATCH de `[id]`).
 *
 * O texto usa o mesmo vocabulário do controle individual (`.Marcar como teste`),
 * para o dono não ter que descobrir que é a mesma coisa com outro nome.
 */

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface Props {
	ids: string[];
	/** `true` marca como teste; `false` devolve ao funil. */
	isSimulated: boolean;
	open: boolean;
	onOpenChange: (aberto: boolean) => void;
	/** Chamado só quando a operação deu certo — quem usa recarrega a lista. */
	onConcluido: (resultado: { conversas: number; leadsMarcados: number }) => void;
}

export function MarcarLoteDialog({ ids, isSimulated, open, onOpenChange, onConcluido }: Props) {
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setErro(null);
	}, [open]);

	const total = ids.length;
	const verbo = isSimulated ? "Marcar" : "Voltar a contar";
	const substantivo = total === 1 ? "conversa" : "conversas";

	async function confirmar() {
		setEnviando(true);
		setErro(null);
		try {
			const res = await fetch("/api/admin/conversations", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ids, isSimulated }),
			});
			if (!res.ok) {
				let mensagem = `HTTP ${res.status}`;
				try {
					const corpo = (await res.json()) as { error?: string };
					if (corpo.error) mensagem = corpo.error;
				} catch {
					// corpo sem JSON: fica o HTTP
				}
				setErro(mensagem);
				return;
			}
			const resultado = (await res.json()) as { conversas: number; leadsMarcados: number };
			onConcluido(resultado);
			onOpenChange(false);
		} catch (err) {
			setErro(err instanceof Error ? err.message : String(err));
		} finally {
			setEnviando(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{verbo} {total} {substantivo} {isSimulated ? "como teste" : "a contar"}?
					</DialogTitle>
					<DialogDescription className="space-y-2 pt-2">
						{isSimulated ? (
							<>
								<span className="block">
									As conversas saem do funil e das métricas, e os leads delas junto. A régua para de
									mandar toque para elas.
								</span>
								<span className="block">
									Nada é apagado, e dá para voltar atrás depois — mas quem já saiu da régua não
									volta a receber toque automático.
								</span>
							</>
						) : (
							<span className="block">
								As conversas voltam a contar no funil e nas métricas, e os leads junto. A régua não
								religa sozinha: quem foi segurado continua segurado.
							</span>
						)}
					</DialogDescription>
				</DialogHeader>

				{erro && (
					<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<span>Não foi possível concluir: {erro}</span>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
						Cancelar
					</Button>
					<Button
						variant={isSimulated ? "default" : "destructive"}
						onClick={confirmar}
						disabled={enviando}
					>
						{enviando ? "Aplicando…" : `${verbo} ${total}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
