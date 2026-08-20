"use client";

import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, type FormEvent, useRef, useState } from "react";

import { AjaMark } from "@/components/brand/aja-mark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type HeroVerticalConteudo = {
	/** Selo escuro acima do título, com o lettermark da AJA. */
	badge: string;
	/**
	 * Título em segmentos: Poppins por padrão, Merriweather itálico onde
	 * `enfase`. É lista, e não `{ inicio, enfase, fim }`, porque nem todo título
	 * tem uma ênfase só — o de auto tem duas ("1 em cada 3" e "consórcio").
	 */
	titulo: { texto: string; enfase?: boolean }[];
	/**
	 * Subtítulo em segmentos, com `forte` no que vai em negrito. É lista pelo
	 * mesmo motivo do `titulo`: o negrito não fica sempre no meio — em moto ele
	 * abre a frase, e `{ inicio, destaque, fim }` obrigaria um `inicio` vazio.
	 */
	subtitulo: { texto: string; forte?: boolean }[];
	/**
	 * Largura da coluna de texto a partir de `lg`, em px. Não é preferência: cada
	 * vertical tem a sua no comp (535 em imóvel, 610 em auto), e é ela que decide
	 * onde a manchete quebra. Errar aqui muda o número de linhas do `h1`.
	 */
	larguraTexto?: number;
	/**
	 * Faixa opcional entre o subtítulo e o card ("ENCONTRE A PARCELA IDEAL PARA
	 * VOCÊ" + atalhos com ícone). Só a vertical de auto usa hoje.
	 */
	atalhos?: {
		eyebrow: string;
		itens: { icone: LucideIcon; label: string }[];
	};
	/** Card de simulação: pergunta e faixa de parcela. */
	card: {
		titulo: string;
		parcelaRotulo: string;
		parcelas: string[];
		cta: string;
	};
	/**
	 * Ilustração da coluna direita — PNG com fundo transparente, exportado do
	 * Figma e já aparado.
	 *
	 * `proporcao` é a do arquivo aparado (ex.: "2579/2047") e `largura` a medida
	 * que ela ocupa no comp. As duas mudam por vertical e andam juntas com o
	 * `sizes` do `next/image`: `sizes` menor que a caixa real entrega arquivo
	 * pequeno e o browser estica.
	 */
	ilustracao: { src: string; alt: string; proporcao: string; largura: number };
	/**
	 * Selo flutuante ("💸 Sem custo extra") desenhado por cima da ilustração.
	 *
	 * Opcional porque em algumas verticais o selo já vem achatado dentro da própria
	 * colagem — é o caso de imóvel. Passar mesmo assim renderiza o selo duas vezes.
	 */
	selo?: string;
	/** Frase de ENTRADA quando o cliente não escolheu parcela (origem "chip"). */
	sementeVazia: string;
	/** Fala do cliente montada a partir da parcela que ele escolheu (origem "digitada"). */
	semente: (parcela: string) => string;
	/**
	 * Fala do cliente montada a partir do VALOR DA CARTA, para quem chega de
	 * anúncio de catálogo (`/autos?bem=50000`). É outra frase, e não a `semente`
	 * acima, porque o que o anúncio prometeu foi o bem, não a parcela — repetir
	 * a fala de parcela aqui faria o chat responder a uma pergunta que a pessoa
	 * não fez.
	 */
	sementeDeValor: (valor: string) => string;
};

interface HeroVerticalProps {
	conteudo: HeroVerticalConteudo;
	onOpenChat: TheaterOpener;
}

// Agrupa os dígitos em milhar (pt-BR) enquanto a pessoa digita o valor do crédito.

// Hero das landings de vertical (Figma 'Consórcios - imóvel' 625:4133): coluna de
// texto com selo + manchete + card de simulação, e a ilustração da vertical à
// direita com o selo flutuante. Todo CTA abre o Modo Teatro com a fala do cliente
// já contextualizada na vertical.
export function HeroVertical({ conteudo, onOpenChat }: HeroVerticalProps) {
	const [parcela, setParcela] = useState(conteudo.card.parcelas[0] ?? "");
	const formRef = useRef<HTMLFormElement>(null);

	const submit = (e?: FormEvent) => {
		e?.preventDefault();
		const origem = formRef.current;
		if (parcela) {
			onOpenChat(conteudo.semente(parcela), origem, "digitada");
			return;
		}
		onOpenChat(conteudo.sementeVazia, origem, "chip");
	};

	return (
		<section className="relative overflow-hidden bg-[var(--aja-paper)]">
			{/* Blob coral desfocado no canto superior direito (Figma 'Blob' 720x757 @(945,-138)). */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-[280px] -top-[200px] h-[757px] w-[720px] rounded-full bg-[#FFE0E3] opacity-95 blur-[167px]"
			/>

			{/* A coluna de texto vem do conteúdo (535 em imóvel, 610 em auto) porque é
			    ela que decide onde a manchete quebra, e a sobra é o que a colagem
			    ocupa. Cuidado: o comp tem DUAS larguras aqui — o parágrafo vai até a
			    borda da coluna e só o card para em ~460. */}
			<KvContainer
				style={{ "--coluna-texto": `${conteudo.larguraTexto ?? 535}px` } as CSSProperties}
				className="grid max-w-[1350px] items-center gap-12 py-10 lg:grid-cols-[var(--coluna-texto)_1fr] lg:gap-[60px] lg:py-14"
			>
				{/* Coluna de texto — min-w-0 pra coluna de grid poder encolher abaixo do
				    min-content no mobile (senão o bloco vaza a gutter do container). */}
				{/* O cap de 560 vale só até `lg`, onde a grade é de uma coluna. A partir
				    de `lg` quem manda é a medida da vertical — sem isso o cap corta a
				    coluna e a manchete quebra numa linha a mais que o comp. */}
				<div className="min-w-0 max-w-[560px] lg:max-w-[var(--coluna-texto)]">
					<span className="inline-flex items-center gap-2 rounded-full bg-[var(--aja-ink)] py-1.5 pl-3.5 pr-4 text-[16px] font-semibold text-[var(--aja-paper)]">
						<AjaMark className="h-3 w-auto" />
						{conteudo.badge}
					</span>

					<h1 className="mt-6 text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[color:var(--aja-ink)] md:text-[56px] md:leading-[62px]">
						{conteudo.titulo.map((parte, i) => (
							<span key={parte.texto}>
								{i > 0 ? " " : ""}
								{parte.enfase ? <Em>{parte.texto}</Em> : parte.texto}
							</span>
						))}
					</h1>

					{/* #2D2D2D do comp = tinta a 85% sobre o papel. */}
					<p className="mt-6 max-w-[535px] text-[18px] leading-[1.3] tracking-[-0.02em] text-[color:var(--aja-ink)]/85 md:text-[22px] md:leading-[26px]">
						{conteudo.subtitulo.map((parte, i) => (
							// Mesma forma do `titulo` acima: o span externo não leva classe, senão o
							// espaço que separa os segmentos entraria em negrito junto.
							<span key={parte.texto}>
								{i > 0 ? " " : ""}
								{parte.forte ? (
									<strong className="font-semibold">{parte.texto}</strong>
								) : (
									parte.texto
								)}
							</span>
						))}
					</p>

					{conteudo.atalhos && (
						<div className="mt-6">
							<KvEyebrow className="tracking-[0.08em]">{conteudo.atalhos.eyebrow}</KvEyebrow>
							<ul className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2">
								{conteudo.atalhos.itens.map((item) => (
									<li
										key={item.label}
										className="flex items-center gap-2 text-[15px] leading-[22px] text-[color:var(--aja-ink)]/85"
									>
										<item.icone
											aria-hidden="true"
											className="size-4 shrink-0 text-[color:var(--aja-coral)]"
											strokeWidth={2.5}
										/>
										{item.label}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Card de simulação */}
					<form
						ref={formRef}
						onSubmit={submit}
						className={`mt-8 max-w-[463px] rounded-[12px] bg-white px-[18px] pb-5 pt-4 ${CARD_SHADOW}`}
					>
						<div className="flex items-center gap-3">
							<span className="flex size-[31px] shrink-0 items-center justify-center rounded-full bg-[var(--aja-ink)]">
								<AjaMark className="w-[18px] text-white" />
							</span>
							<span className="text-[18px] font-semibold text-[color:var(--aja-ink)]">
								{conteudo.card.titulo}
							</span>
						</div>

						{/* Um campo só: a parcela. O que a pessoa sabe responder de cabeça é
						    quanto cabe no mês; o valor do bem é justamente o que ela vem
						    descobrir aqui.

						    Divergência deliberada do comp: lá o campo tem 34px de altura e texto
						    de 10px (frame 'Selector', 428x34). Dez pixels não conversam com o
						    resto da página — o título deste mesmo card tem 18px e o corpo do
						    site, 16px —, e ficam abaixo do alvo de toque. Um tamanho só, em
						    todas as larguras, com os 16px que também evitam o zoom automático do
						    Safari do iPhone ao focar o controle. */}
						<label className="relative mt-4 flex h-11 items-center gap-1.5 rounded-[10px] bg-[#FBFBF9] pl-3 pr-8">
							<span className="whitespace-nowrap text-[16px] text-[color:var(--aja-ink)]">
								{conteudo.card.parcelaRotulo}
							</span>
							<select
								value={parcela}
								onChange={(e) => setParcela(e.target.value)}
								aria-label={conteudo.card.parcelaRotulo}
								className="w-full appearance-none bg-transparent text-[16px] text-[color:var(--aja-ink)] outline-none"
							>
								{conteudo.card.parcelas.map((opcao) => (
									<option key={opcao} value={opcao}>
										{opcao}
									</option>
								))}
							</select>
							{/* Triângulo cheio como no comp, no lugar da seta nativa do select,
							    que muda de forma em cada sistema operacional. */}
							<span
								aria-hidden="true"
								className="pointer-events-none absolute right-3 text-[11px] leading-none text-[color:var(--aja-ink)]"
							>
								▼
							</span>
						</label>

						<KvCtaButton type="submit" className="mt-3 h-12 w-full text-[15px]">
							{conteudo.card.cta}
						</KvCtaButton>
					</form>
				</div>

				{/* Ilustração da vertical (+ selo flutuante, quando não vem na arte) */}
				{/* A caixa É a arte visível: o PNG vem sem margem transparente, então não
				    há folga do `contain` pra descontar. */}
				<div
					className="relative mx-auto w-full min-w-0"
					style={{ maxWidth: `${conteudo.ilustracao.largura}px` }}
				>
					{/* Sem `overflow-hidden` nem raio: a colagem tem fundo transparente e
					    recorte próprio — arredondar aqui cortaria as pontas das diagonais. */}
					<div className="relative w-full" style={{ aspectRatio: conteudo.ilustracao.proporcao }}>
						<Image
							src={conteudo.ilustracao.src}
							alt={conteudo.ilustracao.alt}
							fill
							sizes={`(min-width: 1024px) ${conteudo.ilustracao.largura}px, 90vw`}
							priority
							className="object-contain"
						/>
					</div>
					{conteudo.selo && (
						<span className="absolute -top-2 right-0 inline-flex items-center rounded-full border border-white/20 bg-[var(--aja-coral)] px-5 py-2.5 font-[family-name:var(--font-merriweather)] text-[16px] font-bold italic text-white shadow-[0_7px_14px_-3px_rgba(0,0,0,0.15)] md:text-[18px]">
							{conteudo.selo}
						</span>
					)}
				</div>
			</KvContainer>
		</section>
	);
}
