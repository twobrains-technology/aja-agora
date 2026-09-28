"use client";

/**
 * O RESUMO DA RÉGUA — o primeiro bloco da tela (AJA-04).
 *
 * A Bruna abria a Régua para ver "quantos toques saíram" e encontrava seis
 * cartões contando CONVERSAS por situação, no quarto bloco, abaixo de duas
 * tabelas analíticas. Aqui a pergunta dela vem primeiro: quantas mensagens a
 * régua disparou, quantas responderam, quantas pediram para sair, quantas
 * esgotaram os três toques, quantas esperam o próximo e quantas ainda estão na
 * fila de entrada.
 *
 * `Power` "Ligada" / `PowerOff` "Desligada" vem do interruptor real
 * (`REMARKETING_ATIVO`, lido no servidor) — não do fato de haver linha na
 * tabela, que confundiria "régua desligada agora" com "nunca ligou". A data de
 * ligação não é persistida em lugar nenhum; por isso NÃO se escreve "Ligada
 * desde…" quando não há a data (inventar seria pior que omitir).
 */

import { Clock, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ResumoDaRegua } from "@/lib/admin/remarketing-tela";

const nf = new Intl.NumberFormat("pt-BR");
const nfDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function diaMes(iso: string): string {
	const d = new Date(iso);
	return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Cartao({
	titulo,
	valor,
	detalhe,
	title,
	onClick,
}: {
	titulo: string;
	valor: string;
	detalhe?: string;
	title?: string;
	/** Quando existe, o cartão vira a porta para a lista que responde o número. */
	onClick?: () => void;
}) {
	const conteudo = (
		<>
			<span className="block text-xs text-muted-foreground">{titulo}</span>
			<span className="mt-0.5 block font-heading text-2xl font-semibold tabular-nums">{valor}</span>
			{detalhe && <span className="mt-0.5 block text-xs text-muted-foreground">{detalhe}</span>}
		</>
	);

	return (
		<Card size="sm" className="gap-0" title={title}>
			{onClick ? (
				<button
					type="button"
					onClick={onClick}
					className="w-full px-4 text-left transition-colors hover:bg-muted/50"
					title={
						title ? `${title} Clique para ver a lista.` : "Clique para ver a lista destes toques"
					}
				>
					{conteudo}
				</button>
			) : (
				<div className="px-4">{conteudo}</div>
			)}
		</Card>
	);
}

export function BlocoResumoDaRegua({
	resumo,
	ligada,
	onFiltrarToques,
}: {
	resumo: ResumoDaRegua;
	ligada: boolean;
	/**
	 * Leva à lista de quem recebeu toque — a primeira metade da pergunta do dono
	 * ("para quem que foi?"), logo no número que ele lê primeiro.
	 */
	onFiltrarToques?: () => void;
}) {
	const { aguardando } = resumo;
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Badge variant={ligada ? "success" : "outline"} className="gap-1.5">
					{ligada ? (
						<Power className="size-3" aria-hidden="true" />
					) : (
						<PowerOff className="size-3" aria-hidden="true" />
					)}
					{ligada ? "Ligada" : "Desligada"}
				</Badge>
				{!ligada && (
					<span className="text-xs text-muted-foreground">
						A régua não dispara enquanto a chave operacional estiver desligada.
					</span>
				)}
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
				<Cartao
					titulo="Toques enviados"
					valor={nf.format(resumo.toquesEnviados)}
					onClick={onFiltrarToques}
					title="Mensagens que a régua disparou no período, somando os 3 passos."
				/>
				<Cartao
					titulo="Responderam"
					valor={nf.format(resumo.responderam)}
					detalhe={
						resumo.responderamPercentual === null
							? "sem toque no período"
							: `${nfDecimal.format(resumo.responderamPercentual)}% dos toques`
					}
					title="Quantas pessoas responderam depois de um toque — a sequência para para elas."
				/>
				<Cartao
					titulo="Pediram para sair"
					valor={nf.format(resumo.pediramSair)}
					title="Opt-out: não recebem mais toque automático, por decisão do cliente."
				/>
				<Cartao
					titulo="Esgotaram os 3 toques"
					valor={nf.format(resumo.esgotaram)}
					title="Os três toques saíram sem resposta."
				/>
				<Cartao
					titulo="Aguardando o próximo toque"
					valor={nf.format(aguardando.n)}
					detalhe={
						aguardando.proximoEm ? `próximo ${diaMes(aguardando.proximoEm)}` : "nenhum a caminho"
					}
					title="Conversas que ainda vão receber toque, com a data mais próxima."
				/>
				<Cartao
					titulo="Elegíveis que ainda não entraram"
					valor={nf.format(resumo.elegiveisFora)}
					detalhe="entram no próximo ciclo"
					title="Conversas de WhatsApp em silêncio há mais de 90 min que entram no próximo ciclo da régua."
				/>
			</div>

			{resumo.toquesEnviados === 0 && ligada && (
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Clock className="size-3.5" aria-hidden="true" />
					Nenhum toque saiu no período escolhido. O resumo conta o recorte do filtro acima — amplie
					o período para ver o histórico.
				</p>
			)}
		</div>
	);
}
