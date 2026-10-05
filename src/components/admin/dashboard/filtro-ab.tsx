"use client";

// O filtro de recorte A/B do painel — o irmão do `<DateRangeFilter/>`.
//
// Ele escolhe um RECORTE (por experimento) e o grava nos dois lados de uma vez:
// a URL (`?ab=<experimento>:<braço>`, para o link carregar o recorte e para as
// rotas o lerem) e o cookie `aja_ab` (para ele sobreviver à navegação, que não
// carrega a querystring). A precedência que o servidor resolve é a mesma:
// URL > cookie > nenhum (`filtro-variante.ts`).
//
// ── Genérico por experimento (D4) ────────────────────────────────────────────
//
// O componente NÃO conhece o teste do telefone: ele lê o REGISTRO
// (`@/lib/experimentos/registro`) e monta UM SELETOR POR EXPERIMENTO. Com o
// registro real, um seletor; com dois experimentos, dois seletores — sem tocar
// aqui. É por isso que o teste injeta um registro fictício pela prop `registro`.
//
// ── Cookie de SESSÃO, sem `max-age` ──────────────────────────────────────────
//
// Ao contrário do período (ano de validade), o recorte NÃO é preferência de
// trabalho: ele é a lente de uma leitura. Um cookie com prazo faria a Bruna
// abrir o painel amanhã vendo "só A" sem saber por quê. Sem `max-age`, o recorte
// acompanha a navegação e morre com o navegador.
//
// ── O valor inválido na URL não desce para o cookie ─────────────────────────
//
// `?ab=x:y` é link velho ou adulterado. `lerRecorteAB` descarta o par, o que dá
// "nenhum recorte", e o controle mostra "Todas" — o mesmo que o servidor faz. Se
// ele descesse para o cookie, tela e servidor mostrariam recortes diferentes.

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { valorDoCookie } from "@/lib/admin/periodo";
import {
	COOKIE_DO_RECORTE_AB,
	EXPERIMENTOS,
	type Experimento,
	lerRecorteAB,
	PARAMETRO_DO_RECORTE_AB,
	type RecorteAB,
	rotuloDoRecorte,
	SEM_BRACO,
	serializarRecorteAB,
} from "@/lib/experimentos/registro";
import { cn } from "@/lib/utils";

/**
 * O `null` ("todas") não cabe num `SelectItem`, então o controle fala a língua
 * do `Select` com uma string e traduz na borda do registro.
 */
const TODAS = "todas";

/** O texto de uma escolha do seletor — "Todas", o rótulo do braço, ou "Sem variante". */
function rotuloDaEscolha(experimento: Experimento, braco: string | null): string {
	if (braco === null) return "Todas";
	if (braco === SEM_BRACO) return "Sem variante";
	return experimento.rotulosDosBracos[braco] ?? braco;
}

/**
 * Grava o recorte no cookie de sessão. Nenhum recorte APAGA o cookie (voltar
 * para "Todas" tem que sumir dos DOIS lados, senão a navegação seguinte o traria
 * de volta).
 */
function gravarCookie(recorte: RecorteAB) {
	const valor = serializarRecorteAB(recorte);
	// biome-ignore lint/suspicious/noDocumentCookie: o desenho é cookie `httpOnly: false` justamente para o cliente gravar; a Cookie Store API é assíncrona e não é o mecanismo decidido.
	document.cookie =
		valor === null
			? `${COOKIE_DO_RECORTE_AB}=; path=/; max-age=0; samesite=lax`
			: `${COOKIE_DO_RECORTE_AB}=${encodeURIComponent(valor)}; path=/; samesite=lax`;
}

/**
 * As frases que explicam DE QUEM é o braço, uma por tipo de tela (D10).
 *
 * Elas vivem aqui, e não espalhadas pelas páginas, por dois motivos: o texto é o
 * mesmo em todas as telas de funil (e a cópia divergiria), e o lugar onde ele
 * aparece é decidido por quem sabe que o recorte está ativo — o próprio filtro.
 */
export const NOTA_DO_BRACO_DA_PESSOA =
	"O braço é o da conversa em que a pessoa se identificou; nas etapas seguintes ela segue no mesmo braço.";
export const NOTA_DO_BRACO_DA_CONVERSA =
	"Nesta tela o braço é o da própria conversa — aqui a linha é uma conversa, não uma pessoa.";
export const NOTA_DA_EXPORTACAO =
	"No percurso o braço é o da pessoa; nas conversas e nos toques, o da própria conversa.";

/**
 * A frase do D6 — o custo não se divide por braço de teste.
 *
 * Mora aqui, com as outras frases do recorte, porque aparece em DUAS telas
 * (Performance e Campanhas) e porque é a explicação do recorte, não do bloco de
 * custos. Duas cópias divergiriam calado.
 */
export const FRASE_CUSTO_NAO_APLICAVEL =
	"Custo não se divide por braço de teste: o investimento da Meta é do período inteiro.";

export function FiltroAB({
	registro = EXPERIMENTOS,
	nota,
	className,
}: {
	/** Os experimentos oferecidos. Injetável para o teste provar que o componente
	 *  é genérico (dois experimentos ⇒ dois seletores, sem mudar código). */
	registro?: readonly Experimento[];
	/** A frase que explica de quem é o braço NESTA tela (D10). Só aparece com
	 *  recorte ativo — sem recorte ela seria ruído sobre uma lente que ninguém
	 *  ligou. */
	nota?: string;
	className?: string;
}) {
	// Sem `withDefault`: o valor cru diz se a querystring trouxe o recorte. Um
	// valor inválido também é "trouxe" — e ele vale "nenhum", sem descer para o
	// cookie.
	const [daUrl, setDaUrl] = useQueryState(PARAMETRO_DO_RECORTE_AB, parseAsString);

	// O recorte do cookie, lido na hidratação. Sem ele, quem escolheu "A" e
	// navegou pelo menu (que monta `href` puro, sem querystring) veria o controle
	// dizendo "Todas" enquanto o servidor filtra A.
	const [doCookie, setDoCookie] = useState<RecorteAB>([]);
	const hidratado = useRef(false);
	useEffect(() => {
		if (hidratado.current) return;
		hidratado.current = true;

		// Quem chegou com `?ab=` já disse o que quer — inclusive se disse um par
		// inválido.
		if (daUrl !== null) return;

		setDoCookie(lerRecorteAB(valorDoCookie(document.cookie, COOKIE_DO_RECORTE_AB), registro));
	}, [daUrl, registro]);

	const recorte = daUrl !== null ? lerRecorteAB(daUrl, registro) : doCookie;

	const gravar = (proximo: RecorteAB) => {
		setDoCookie(proximo);
		// `null` REMOVE o parâmetro da URL (não escreve `ab=` vazio, que o servidor
		// leria como valor desconhecido).
		void setDaUrl(serializarRecorteAB(proximo));
		gravarCookie(proximo);
	};

	// Trocar UM experimento preserva o recorte dos outros: o estado é uma lista de
	// pares, e cada seletor só mexe no par do seu experimento. `null` é o "sem
	// valor" do base-ui — aqui vale o mesmo que "Todas" (nenhum par).
	// O parâmetro é o BRAÇO escolhido, não uma `escolha` de contrato: o nome
	// `braco` não colide com o campo `escolha`/`contractOffer` do funil que o
	// guard `quem-assina-contrato` vigia (filtro de painel não amarra cota).
	const trocar = (experimento: Experimento, braco: string | null) => {
		const outros = recorte.filter((par) => par.experimento !== experimento.id);
		if (braco === null || braco === TODAS) return gravar(outros);
		gravar([...outros, { experimento: experimento.id, braco }]);
	};

	const rotulo = rotuloDoRecorte(recorte, registro);

	return (
		<div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
			{registro.map((experimento) => {
				const atual = recorte.find((par) => par.experimento === experimento.id)?.braco ?? null;
				return (
					<span key={experimento.id} className="flex items-center gap-2">
						<span className="hidden text-muted-foreground text-sm sm:inline">
							{experimento.rotulo}:
						</span>

						<Select
							value={atual ?? TODAS}
							onValueChange={(braco) => trocar(experimento, braco)}
						>
							<SelectTrigger size="sm" aria-label={`Recorte do ${experimento.rotulo}`}>
								{/* O rótulo entra explícito: o `SelectValue` sozinho só o
								    encontra depois que a lista abre, e a tela mostraria o
								    valor cru. */}
								<SelectValue>{rotuloDaEscolha(experimento, atual)}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={TODAS}>Todas</SelectItem>
								{experimento.bracos.map((braco) => (
									<SelectItem key={braco} value={braco}>
										{rotuloDaEscolha(experimento, braco)}
									</SelectItem>
								))}
								<SelectItem value={SEM_BRACO}>Sem variante</SelectItem>
							</SelectContent>
						</Select>
					</span>
				);
			})}

			{/* O recorte ativo escrito na tela — nunca só a cor do controle (o dono
			    é daltônico). */}
			{rotulo !== null && (
				<>
					<span
						className="inline-flex h-8 items-center rounded-md border border-dashed border-input px-3 text-xs text-muted-foreground"
						title="O painel está recortado por este experimento"
					>
						{rotulo}
					</span>
					{nota && (
						<span data-testid="nota-do-recorte" className="w-full text-xs text-muted-foreground">
							{nota}
						</span>
					)}
				</>
			)}
		</div>
	);
}
