"use client";

/**
 * O BLOCO "RÉGUA DE REMARKETING" DA FICHA.
 *
 * A ficha responde "quem é esta pessoa e o que aconteceu"; a régua é o único
 * fato da conversa cuja próxima ação é automática. Mostrar isso aqui evita o
 * salto para a tela da Régua só para ver em que pé está a sequência — e permite
 * Segurar/Soltar do lugar onde o operador já está olhando.
 *
 * O que a linha do tempo mostra é o que o banco tem: quantos toques saíram, o
 * instante do último e do próximo, e a situação. NÃO existe histórico toque a
 * toque no banco (`remarketing_touches` guarda só o último), então inventar
 * "Toque 1 · entregue · lido" seria ficção — o que não se sabe, não se escreve.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { HandIcon, Megaphone, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcaoDaRegua, LinhaDaTela, Situacao } from "@/lib/admin/remarketing-tela";

type Resposta = {
	linha: LinhaDaTela | null;
	proximoToqueISO: string | null;
	situacao: Situacao | null;
};

const VARIANTE: Record<Situacao, "success" | "warning" | "secondary" | "outline" | "destructive"> =
	{
		ativo: "secondary",
		segurado: "warning",
		respondeu: "success",
		esgotado: "warning",
		optout: "destructive",
		converteu: "success",
	};

function instante(iso: string): string {
	return format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
}

export function BlocoDaRegua({ conversationId }: { conversationId: string }) {
	const [dados, setDados] = useState<Resposta | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [ocupado, setOcupado] = useState(false);

	const carregar = useCallback(async () => {
		try {
			const res = await fetch(`/api/admin/remarketing/${conversationId}`, { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setDados((await res.json()) as Resposta);
			setErro(null);
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Falha ao carregar a régua");
		}
	}, [conversationId]);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	async function agir(acao: AcaoDaRegua) {
		if (ocupado) return;
		setOcupado(true);
		try {
			const res = await fetch(`/api/admin/remarketing/${conversationId}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ acao }),
			});
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			await carregar();
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Não consegui completar a ação.");
		} finally {
			setOcupado(false);
		}
	}

	if (erro) {
		return (
			<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
				Régua: {erro}
			</div>
		);
	}

	if (dados === null) {
		return <Skeleton className="h-16 w-full" />;
	}

	const { linha } = dados;
	if (!linha) {
		return (
			<div className="rounded-md border p-3 text-sm text-muted-foreground">
				<span className="font-medium text-foreground">Régua de remarketing</span>
				<p className="mt-1">
					Esta conversa não está na régua — ela não passou nas guardas de entrada (canal, contato,
					telefone, silêncio entre 90 min e 7 dias). O motivo aparece na lista de Conversas, na
					coluna Remarketing.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-md border p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Megaphone className="size-4 text-muted-foreground" aria-hidden="true" />
					Régua de remarketing
				</div>
				<Badge variant={VARIANTE[linha.situacao]}>{linha.rotuloDaSituacao}</Badge>
			</div>

			<dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">Toques enviados</dt>
				<dd className="tabular-nums">{linha.passoLegivel}</dd>
				<dt className="text-muted-foreground">Último toque</dt>
				<dd className="tabular-nums">
					{linha.ultimoToqueISO ? instante(linha.ultimoToqueISO) : "ainda não saiu"}
				</dd>
				<dt className="text-muted-foreground">Próximo toque</dt>
				<dd className="tabular-nums">
					{dados.proximoToqueISO ? instante(dados.proximoToqueISO) : "nenhum a caminho"}
				</dd>
				{linha.objetivo && (
					<>
						<dt className="text-muted-foreground">Bem</dt>
						<dd>{linha.rotuloDoObjetivo}</dd>
					</>
				)}
				{linha.motivoLegivel && (
					<>
						<dt className="text-muted-foreground">Motivo</dt>
						<dd>{linha.motivoLegivel}</dd>
					</>
				)}
			</dl>

			{(linha.podeSegurar || linha.podeSoltar) && (
				<div className="mt-3 flex flex-wrap gap-2">
					{linha.podeSegurar && (
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5"
							disabled={ocupado}
							onClick={() => void agir("segurar")}
							title="Parar a régua para esta pessoa até alguém soltar"
						>
							<HandIcon className="size-3.5" aria-hidden="true" />
							Segurar
						</Button>
					)}
					{linha.podeSoltar && (
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5"
							disabled={ocupado}
							onClick={() => void agir("soltar")}
							title="Devolver esta conversa para a régua"
						>
							<PlayIcon className="size-3.5" aria-hidden="true" />
							Soltar
						</Button>
					)}
				</div>
			)}

			{linha.situacao === "segurado" && !linha.podeSoltar && linha.motivoDeNaoSoltar && (
				<p className="mt-2 text-xs text-muted-foreground">{linha.motivoDeNaoSoltar}</p>
			)}
		</div>
	);
}
