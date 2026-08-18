"use client";

// O visor: a landing de verdade, com o mapa desenhado por cima e a régua de
// rolagem colada à esquerda.
//
// É a peça protagonista da tela, como em toda ferramenta de heatmap — o
// operador não lê uma tabela para depois imaginar a página; ele olha a página.
//
// A landing entra num `<iframe>` same-origin, o que só é possível porque a
// página é nossa: o Clarity bloqueia o embed do heatmap dele, e por isso lá o
// mapa mora no site da Microsoft, não no seu painel.
//
// ── A medição que faz a régua valer algo ────────────────────────────────────
//
// As faixas de rolagem são posicionadas pela posição REAL de cada `[data-heat]`
// dentro do iframe, não por fatias iguais. Régua dividida em partes iguais
// mentiria: `kv-hero` ocupa 1.100px e `kv-menu` ocupa 80, e alinhar "68% chegou
// aqui" com o pedaço errado da página manda mexer na seção errada.
//
// O coletor não roda dentro do iframe (`window.self !== window.top` em
// `heatmap-tracker.tsx`) — senão abrir esta tela injetaria cliques no mapa.

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DegrauDoFunil } from "@/lib/heatmap/aggregate";
import { PARAM_PREVIEW } from "@/lib/heatmap/events";
import type { PontoDoMapa } from "@/lib/heatmap/queries";
import { NOME_DA_SECAO } from "./nomes";

/** Raio do borrão de cada clique, em px do documento. */
const RAIO = 26;

/** Altura do visor. Cabe numa tela de notebook sem esmagar a página. */
const ALTURA_VISOR = 720;

/**
 * Resolução do canvas em relação ao documento.
 *
 * A landing tem 8.810px de altura: a 1:1 o canvas ficava com 11,3 MILHÕES de
 * pixels (~45 MB de bitmap), e medindo em 17/08/2026 isso travou o renderer a
 * ponto de o próprio `Page.captureScreenshot` estourar 30s de timeout. Pela
 * metade são 2,8 M — e o desenho não perde nada, porque tudo que se pinta aqui
 * é borrão de gradiente, não traço fino.
 */
const RESOLUCAO = 0.5;

/** Largura em que a landing é renderizada antes de encolher para caber. */
const LARGURA_DESKTOP = 1280;

export type ModoDoMapa = "cliques" | "rolagem";

interface PosicaoSecao {
	nome: string;
	topo: number;
	altura: number;
}

interface Props {
	path: string;
	modo: ModoDoMapa;
	pontos: PontoDoMapa[];
	funil: DegrauDoFunil[];
}

export function VisorDoMapa({ path, modo, pontos, funil }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const janelaRef = useRef<HTMLDivElement>(null);

	const [alturaPagina, setAlturaPagina] = useState<number | null>(null);
	const [larguraPagina, setLarguraPagina] = useState(LARGURA_DESKTOP);
	const [larguraJanela, setLarguraJanela] = useState(0);
	const [secoes, setSecoes] = useState<PosicaoSecao[]>([]);

	// A landing é renderizada na largura de um desktop (é assim que ela se
	// comporta de verdade) e depois encolhida para caber. Sem isto o operador via
	// só a faixa esquerda: medido em 17/08/2026, 1.280px dentro de 572px.
	useEffect(() => {
		const janela = janelaRef.current;
		if (!janela) return;

		const medir = () => setLarguraJanela(janela.clientWidth);
		medir();

		const observador = new ResizeObserver(medir);
		observador.observe(janela);
		return () => observador.disconnect();
	}, []);

	// Nunca amplia: página estreita num visor largo ficaria borrada à toa.
	const escala = larguraJanela > 0 ? Math.min(1, larguraJanela / larguraPagina) : 1;

	const medirPagina = useCallback(() => {
		const doc = iframeRef.current?.contentDocument;
		if (!doc) return;

		try {
			setAlturaPagina(doc.documentElement.scrollHeight);
			setLarguraPagina(doc.documentElement.scrollWidth || LARGURA_DESKTOP);

			setSecoes(
				Array.from(doc.querySelectorAll("[data-heat]")).map((elemento) => {
					const caixa = elemento.getBoundingClientRect();
					return {
						nome: elemento.getAttribute("data-heat") ?? "",
						topo: caixa.top + doc.documentElement.scrollTop,
						altura: caixa.height,
					};
				}),
			);
		} catch {
			// Só ocorreria se a página deixasse de ser same-origin. Sem fundo e sem
			// régua o mapa ainda desenha — em altura arbitrária, mas desenha.
			setAlturaPagina(3000);
		}
	}, []);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		iframe.addEventListener("load", medirPagina);
		// A landing tem imagem e fonte que mudam a altura DEPOIS do `load`. Sem esta
		// segunda medida, a régua fica alinhada com um layout que não existe mais.
		const remedida = window.setTimeout(medirPagina, 1200);

		return () => {
			iframe.removeEventListener("load", medirPagina);
			window.clearTimeout(remedida);
		};
	}, [medirPagina]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || alturaPagina === null) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// O bitmap é menor que o documento e o CSS o estica de volta (ver RESOLUCAO).
		canvas.width = Math.round(larguraPagina * RESOLUCAO);
		canvas.height = Math.round(alturaPagina * RESOLUCAO);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		// Escalado uma vez: as coordenadas do documento entram sem conversão em cada
		// ponto, e o raio do borrão encolhe junto.
		ctx.scale(RESOLUCAO, RESOLUCAO);

		if (modo === "rolagem") {
			desenharRolagem(ctx, secoes, funil, larguraPagina);
		} else {
			desenharCliques(ctx, pontos, larguraPagina);
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}, [modo, pontos, funil, secoes, alturaPagina, larguraPagina]);

	const carregando = alturaPagina === null;

	const alturaEncolhida = (alturaPagina ?? ALTURA_VISOR) * escala;

	return (
		// A régua vive DENTRO do mesmo container de scroll da página, e não ao lado
		// dele: fora daqui ela ficaria parada enquanto o preview rola, e a partir do
		// primeiro giro do dedo passaria a apontar "68% chegou aqui" para uma seção
		// que não é aquela — pior que não ter régua.
		<div
			className="relative overflow-y-auto overflow-x-hidden rounded-lg border bg-muted/30 [color-scheme:light]"
			style={{ height: ALTURA_VISOR }}
		>
			<div className="flex" style={{ height: alturaEncolhida }}>
				<ReguaDeRolagem secoes={secoes} funil={funil} escala={escala} />

				{/* Duas camadas: a de fora reserva a altura JÁ ENCOLHIDA (é ela que o
				    scroll enxerga), a de dentro mantém o tamanho real da página para que
				    o canvas siga usando as coordenadas em que os cliques foram gravados.
				    Escalar só o iframe desalinharia a nuvem do conteúdo. */}
				<div ref={janelaRef} className="relative min-w-0 flex-1">
					<div
						className="absolute top-0 left-0 origin-top-left"
						style={{
							height: alturaPagina ?? ALTURA_VISOR,
							width: larguraPagina,
							transform: `scale(${escala})`,
						}}
					>
						<iframe
							ref={iframeRef}
							// `PARAM_PREVIEW` diz ao proxy que isto é uma página sendo OLHADA,
							// não visitada — sem ele, cada abertura desta tela criava uma linha
							// em `visits` e colocava o operador dentro do funil.
							src={`${path}?${PARAM_PREVIEW}=1`}
							title={`Pré-visualização de ${path}`}
							// `pointer-events-none`: a landing aqui é fundo, não aplicação. Sem
							// isto o operador abriria o chat ao tentar rolar o mapa.
							className="pointer-events-none absolute inset-0 h-full w-full border-0"
							scrolling="no"
							sandbox="allow-same-origin allow-scripts"
						/>
						<canvas
							ref={canvasRef}
							aria-hidden
							className="pointer-events-none absolute inset-0 h-full w-full"
						/>
					</div>
				</div>
			</div>

			{carregando && <Skeleton className="absolute inset-0" />}
		</div>
	);
}

/**
 * A régua de rolagem: cada seção da página vira uma faixa, na altura que ela
 * ocupa de verdade, com o percentual de quem chegou lá.
 *
 * O número vem escrito em cada faixa, e não só codificado em intensidade: cor
 * sozinha não é sinal, e aqui ela é apenas o reforço do que está por extenso.
 */
function ReguaDeRolagem({
	secoes,
	funil,
	escala,
}: {
	secoes: PosicaoSecao[];
	funil: DegrauDoFunil[];
	escala: number;
}) {
	// Estreita no celular: em 420px de tela, 128px de régua comem um quinto do
	// espaço da página, que é justamente o que se veio olhar.
	if (secoes.length === 0) return <div className="w-16 shrink-0 sm:w-32" />;

	const porSecao = new Map(funil.map((d) => [d.section, d]));

	return (
		<div className="relative w-16 shrink-0 border-border border-e bg-card sm:w-32">
			{secoes.map((secao) => {
				const pct = porSecao.get(secao.nome)?.pct ?? 0;
				const topo = secao.topo * escala;
				const altura = Math.max(secao.altura * escala, 2);

				return (
					<div
						key={secao.nome}
						className="absolute right-0 left-0 border-border/60 border-b px-2 py-1"
						style={{
							top: topo,
							height: altura,
							// Mesma matiz, opacidade proporcional — o que se lê é o número; a
							// intensidade só ajuda a varrer a coluna com os olhos.
							backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(pct * 0.55)}%, transparent)`,
						}}
					>
						{/* Faixa curta não comporta duas linhas de texto; escrever mesmo
						    assim produziria rótulos empilhados por cima do vizinho. */}
						{altura > 30 && (
							<>
								<p className="font-medium text-[11px] leading-tight tabular-nums">{pct}%</p>
								<p className="truncate text-[10px] text-muted-foreground leading-tight">
									{NOME_DA_SECAO[secao.nome] ?? secao.nome}
								</p>
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}

/** Nuvem de cliques: gradientes radiais somados formam a mancha contínua. */
function desenharCliques(
	ctx: CanvasRenderingContext2D,
	pontos: PontoDoMapa[],
	larguraPagina: number,
) {
	const pico = pontos.reduce((maior, p) => Math.max(maior, p.peso), 0);
	if (pico === 0) return;

	ctx.globalCompositeOperation = "lighter";

	for (const ponto of pontos) {
		const x = ponto.x * larguraPagina;
		const y = ponto.y;
		// Raiz quadrada porque um alvo campeão achataria todo o resto numa escala
		// linear, e o mapa viraria um ponto aceso num campo apagado.
		const intensidade = Math.sqrt(ponto.peso / pico);

		const gradiente = ctx.createRadialGradient(x, y, 0, x, y, RAIO);
		// Dois tons para clique e raiva, mas cor NUNCA é o único sinal: quem
		// distingue os dois é a lista de alvos, com rótulo e contagem.
		const cor = ponto.raiva > 0 ? "168, 85, 247" : "239, 68, 68";
		gradiente.addColorStop(0, `rgba(${cor}, ${0.7 * intensidade})`);
		gradiente.addColorStop(1, `rgba(${cor}, 0)`);

		ctx.fillStyle = gradiente;
		ctx.beginPath();
		ctx.arc(x, y, RAIO, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.globalCompositeOperation = "source-over";
}

/**
 * Mapa de rolagem: escurece a página na medida em que a audiência a abandona.
 *
 * O véu é mais forte onde MENOS gente chegou — o inverso é que seria enganoso,
 * porque destacaria o rodapé vazio como se fosse o ponto quente da página.
 */
function desenharRolagem(
	ctx: CanvasRenderingContext2D,
	secoes: PosicaoSecao[],
	funil: DegrauDoFunil[],
	larguraPagina: number,
) {
	const porSecao = new Map(funil.map((d) => [d.section, d]));

	for (const secao of secoes) {
		const pct = porSecao.get(secao.nome)?.pct ?? 0;
		const veu = (1 - pct / 100) * 0.72;

		ctx.fillStyle = `rgba(2, 22, 40, ${veu})`;
		ctx.fillRect(0, secao.topo, larguraPagina, secao.altura);
	}
}
