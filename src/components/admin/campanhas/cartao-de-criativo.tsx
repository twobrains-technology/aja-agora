"use client";

import { ImageOffIcon, MegaphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LinhaCriativo } from "@/lib/admin/campanhas-queries";
import { decodificarChaveDeCampanha } from "@/lib/meta-ads/rotulo-legivel";
import { inteiro } from "./formato";

/**
 * O cartão de criativo — o ÚNICO lugar do produto que desenha criativo.
 *
 * O pedido (22/09): os criativos da tela de campanhas passam a seguir um padrão
 * visual único em vez de "cada um com seu tamanho, seu enquadramento, seu jeito
 * de mostrar imagem, título e métrica". A tela de campanhas deixa de ter desenho
 * próprio — ela monta a lista e entrega aqui. Se o padrão mudar, muda num lugar
 * só, sem tocar na tela.
 *
 * **O dado é o mesmo de antes.** Padronizar é desenho, não curadoria: imagem,
 * título e as três métricas continuam exatamente as que a tela mostrava —
 * nenhum campo novo, nenhum campo escondido.
 *
 * **Faltando imagem, o cartão declara.** Em vez de um quadrado vazio (que o
 * olho lê como defeito de carregamento), a moldura diz "Sem imagem" e o motivo
 * em `title`. Título sem nome resolvido sai como o id decodificado + badge
 * "Nome pendente" — nunca cru, nunca em branco.
 */

function Miniatura({ url, titulo }: { url: string | null; titulo: string }) {
	if (!url) {
		return (
			<div
				className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 text-[10px] text-muted-foreground"
				title="A Meta não devolveu miniatura para esta peça."
			>
				<ImageOffIcon className="size-4" aria-hidden="true" />
				Sem imagem
			</div>
		);
	}

	return (
		// biome-ignore lint/performance/noImgElement: miniatura vem do CDN da Meta; next/image exigiria configurar o domínio da Graph API
		<img
			src={url}
			alt={`Miniatura do criativo ${titulo}`}
			width={56}
			height={56}
			className="size-14 shrink-0 rounded-md border border-border object-cover"
		/>
	);
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: number }) {
	return (
		<div className="flex flex-col">
			<span className="text-xs text-muted-foreground">{rotulo}</span>
			<span className="text-sm font-medium tabular-nums">{inteiro(valor)}</span>
		</div>
	);
}

export function CartaoDeCriativo({ criativo }: { criativo: LinhaCriativo }) {
	const titulo =
		criativo.nomeResolvido && criativo.nome
			? criativo.nome
			: decodificarChaveDeCampanha(criativo.chave);

	return (
		<div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
			<Miniatura url={criativo.thumbnailUrl} titulo={titulo} />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex min-w-0 flex-col gap-1">
					<span className="truncate text-sm font-medium" title={criativo.chave}>
						{titulo}
					</span>
					{!criativo.nomeResolvido && (
						<Badge
							variant="outline"
							className="w-fit gap-1 font-normal text-xs"
							title="A Meta ainda não espelhou o nome da peça. O rótulo é o id do anúncio que veio na visita."
						>
							<MegaphoneIcon className="size-3" aria-hidden="true" />
							Nome pendente
						</Badge>
					)}
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-1">
					<Metrica rotulo="Visitas" valor={criativo.visitas} />
					<Metrica rotulo="Iniciaram conversa" valor={criativo.conversas} />
					<Metrica rotulo="Identificados" valor={criativo.identificados} />
				</div>
			</div>
		</div>
	);
}

/** A lista de criativos de uma campanha, no cartão padronizado. */
export function ListaDeCriativos({ criativos }: { criativos: LinhaCriativo[] }) {
	if (criativos.length === 0) {
		return (
			<p className="py-2 text-xs text-muted-foreground">Criativo não informado pelo anúncio.</p>
		);
	}

	return (
		<div className="py-2">
			<p className="mb-2 text-xs font-medium text-muted-foreground">Criativos</p>
			<div className="grid gap-2 lg:grid-cols-2">
				{criativos.map((c) => (
					<CartaoDeCriativo key={c.chave} criativo={c} />
				))}
			</div>
		</div>
	);
}
