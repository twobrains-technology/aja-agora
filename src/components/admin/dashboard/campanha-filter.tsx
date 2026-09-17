"use client";

// O filtro de CAMPANHA — múltiplo, e com o estado na URL.
//
// Antes disto, campanha era valor único na querystring (`?campanha=camp-1`), e
// o recorte vivia em `useState` em algumas telas. As duas coisas davam o mesmo
// defeito de família: um recorte que morre quando você navega e que não cabe
// num link. O período do painel já tinha apanhado disso (o filtro voltava para
// "hoje" sozinho ao trocar de tela); aqui a cura é a mesma e por construção —
// quem lê o recorte é a URL (`?campanha=camp-1,camp-2`), e um link a carrega.
//
// ── Por que o componente lê a URL sozinho e não recebe `value`/`onChange` ──
//
// Ser `useQueryState` por dentro é o que permite usá-lo em qualquer barra de
// filtro sem cada tela manter o seu próprio par de estado e sem duas cópias
// divergirem. Duas telas montam o mesmo parametro `campanha`, e as duas leem a
// mesma coisa.
//
// A LISTA VAZIA é o contrato delicado: seleção vazia vira `null` na URL (o
// parâmetro some), e aí "sem filtro" continua significando "mostre tudo". Uma
// seleção vazia que escrevesse `?campanha=` viraria um `IN ()` disfarçado e não
// casaria nada — ver o aviso em `campanhas.ts`.

import { CheckIcon, TagIcon, XIcon } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Uma campanha oferecida ao filtro: o valor que vai para a URL e o rótulo de leitura. */
export interface OpcaoDeCampanha {
	valor: string;
	rotulo: string;
}

/** O nome do parâmetro — um só, para todas as telas que montam este filtro. */
export const PARAMETRO_DE_CAMPANHA = "campanha";

/**
 * O parser da querystring: `?campanha=a,b,c`.
 *
 * O separador padrão do `parseAsArrayOf` já é a vírgula, e isso é o combinado
 * na URL (não repetir o parâmetro). O parser é exportado para as telas que só
 * LEEM a lista (a tabela de conversas) usarem exatamente o mesmo.
 */
export const parserDeCampanha = parseAsArrayOf(parseAsString);

export function CampanhaFilter({
	opcoes,
	rotulo = "Campanha",
	className,
}: {
	/** As campanhas que a tela sabe oferecer. Pode ser vazia: o que veio na URL ainda aparece. */
	opcoes: readonly OpcaoDeCampanha[];
	/** Como o gatilho se chama na tela ("Campanha", "Campanhas"). */
	rotulo?: string;
	className?: string;
}) {
	const [selecionadas, setSelecionadas] = useQueryState(PARAMETRO_DE_CAMPANHA, parserDeCampanha);
	const atuais = selecionadas ?? [];

	const conhecidas = new Map(opcoes.map((opcao) => [opcao.valor, opcao.rotulo]));

	// O que a tela mostra: as opções que ela conhece MAIS os valores que vieram
	// na URL sem opção correspondente. Isso é deliberado — um link velho ou
	// montado por outra tela continua visível e removível, em vez de filtrar
	// escondido (o mesmo raciocínio do `null` em `filtro-origem`).
	const itens: OpcaoDeCampanha[] = [
		...opcoes,
		...atuais.filter((valor) => !conhecidas.has(valor)).map((valor) => ({ valor, rotulo: valor })),
	];

	const escolhidas: OpcaoDeCampanha[] = atuais.map((valor) => ({
		valor,
		rotulo: conhecidas.get(valor) ?? valor,
	}));

	const gravar = (proxima: string[]) => {
		// `null` remove o parâmetro; `[]` seria um `?campanha=` que não casa nada.
		void setSelecionadas(proxima.length > 0 ? proxima : null);
	};

	const alternar = (valor: string) => {
		gravar(atuais.includes(valor) ? atuais.filter((atual) => atual !== valor) : [...atuais, valor]);
	};

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			<Popover>
				<PopoverTrigger
					render={
						<Button
							variant={atuais.length > 0 ? "secondary" : "outline"}
							size="sm"
							className="h-8 gap-1.5 text-xs"
							title="Escolher uma ou mais campanhas"
						/>
					}
				>
					<TagIcon className="size-3.5" aria-hidden="true" />
					{rotulo}
					{atuais.length > 0 && (
						<Badge variant="default" className="h-4 px-1.5 text-[10px] tabular-nums">
							{atuais.length}
						</Badge>
					)}
				</PopoverTrigger>

				<PopoverContent align="start" className="w-72 gap-1 p-1.5">
					{itens.length === 0 ? (
						<p className="px-2 py-1.5 text-muted-foreground text-xs">
							Nenhuma campanha disponível.
						</p>
					) : (
						<div className="flex max-h-72 flex-col overflow-y-auto">
							{itens.map((item) => {
								const ativo = atuais.includes(item.valor);
								return (
									<Button
										key={item.valor}
										variant="ghost"
										size="sm"
										className="h-8 justify-start gap-2 px-2 font-normal text-xs"
										aria-pressed={ativo}
										onClick={() => alternar(item.valor)}
									>
										<CheckIcon
											className={cn("size-3.5 shrink-0", ativo ? "opacity-100" : "opacity-0")}
											aria-hidden="true"
										/>
										<span className="truncate" title={item.rotulo}>
											{item.rotulo}
										</span>
									</Button>
								);
							})}
						</div>
					)}

					{atuais.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 w-full justify-start gap-2 px-2 font-normal text-muted-foreground text-xs"
							onClick={() => gravar([])}
						>
							<XIcon className="size-3.5" aria-hidden="true" />
							Limpar campanhas
						</Button>
					)}
				</PopoverContent>
			</Popover>

			{/* As escolhidas ficam visíveis na barra, cada uma saível por si — é o
			    mesmo gesto do chip único de antes, agora com N campanhas. */}
			{escolhidas.map((item) => (
				<Badge key={item.valor} variant="secondary" className="h-8 gap-1.5 px-2.5 font-normal">
					<span className="text-muted-foreground">Campanha:</span>
					<span className="max-w-56 truncate" title={item.rotulo}>
						{item.rotulo}
					</span>
					<button
						type="button"
						onClick={() => alternar(item.valor)}
						aria-label={`Remover a campanha ${item.rotulo}`}
						className="text-muted-foreground hover:text-foreground"
					>
						<XIcon className="size-3.5" aria-hidden="true" />
					</button>
				</Badge>
			))}
		</div>
	);
}
