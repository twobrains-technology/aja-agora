"use client";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

/** Cor do passo. Tinge a forma de fundo e a pill juntas, como no comp. */
export type TomPasso = "creme" | "navy" | "coral";

export type BlocoPassosConteudo = {
	eyebrow: string;
	titulo: { inicio: string; enfase: string; fim?: string };
	texto: { inicio: string; forte: string; fim: string };
	passos: {
		/** "PASSO 01" por extenso — não um índice, para o componente nunca contar. */
		rotulo: string;
		/**
		 * Quebra de linha (`\n`) é respeitada. No comp as duas linhas de cada
		 * título são escolha do designer e não sobra natural de largura: na coluna
		 * de 265px "A moto no seu nome" cabe inteiro numa linha, e ainda assim o
		 * comp a parte em duas. Estreitar a caixa até quebrar sozinha seria número
		 * mágico que erra num título de comprimento diferente.
		 */
		titulo: string;
		/**
		 * Sem `proporcao`/`largura`, ao contrário do hero: aqui a arte é `h-auto`
		 * dentro de uma caixa que já tem a proporção do chevron, então quem manda é
		 * a proporção natural do arquivo.
		 */
		ilustracao: { src: string; alt: string };
		tom: TomPasso;
		descricao: string;
	}[];
	cta: string;
	semente: string;
};

interface BlocoPassosProps {
	conteudo: BlocoPassosConteudo;
	onOpenChat: TheaterOpener;
}

/**
 * Chevron ">" que fica atrás da ilustração de cada passo.
 *
 * É `clip-path` e não arte porque as arestas são retas e as três cores são
 * tokens que já existem — exportar PNG enterraria hex cru num raster, que o
 * CLAUDE.md trata como defeito, e ainda daria três arquivos para manter.
 *
 * Os números saem do comp: braço com 62px de aresta vertical numa caixa de
 * 270×306, e inclinação `dx/dy` de 1,76 nas duas bordas — daí o vértice em
 * 50% da altura e o entalhe em 59% da largura.
 */
const RECORTE_CHEVRON = "polygon(0% 0%, 100% 50%, 0% 100%, 0% 80%, 59% 50%, 0% 20%)";

const TOM = {
	creme: { forma: "bg-[var(--aja-cream)]", pill: "bg-[var(--aja-cream)] text-[var(--aja-ink)]" },
	navy: { forma: "bg-[var(--aja-navy)]", pill: "bg-[var(--aja-navy)] text-white" },
	coral: { forma: "bg-[var(--aja-coral)]", pill: "bg-[var(--aja-coral)] text-white" },
} as const satisfies Record<TomPasso, { forma: string; pill: string }>;

// Bloco "Para quem a moto é renda" (Figma 'Consórcios - moto' 625:3679): três
// passos lado a lado, cada um com a arte sobre um chevron colorido.
//
// É GRADE, não composição — e é por isso que aqui não existe um `POSICAO[i]`
// como no `BlocoUpgrade`. Lá os três grupos orbitam o veículo amarrados pela
// fita, e a geometria é irredutível; aqui as colunas são independentes. O
// componente nunca lê o índice: a cor vem de `tom` e o número vem de `rotulo`.
// Um quarto passo entra quebrando linha, sem tocar neste arquivo.
export function BlocoPassos({ conteudo, onOpenChat }: BlocoPassosProps) {
	return (
		<section className="relative overflow-hidden bg-[var(--aja-paper)] py-16 md:py-24">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-[120px] bottom-0 size-[420px] rounded-full bg-[#FFE0E3] opacity-60 blur-[75px]"
			/>

			<KvContainer className="max-w-[1280px]">
				<div className="mx-auto flex max-w-[1091px] flex-col items-center gap-4 text-center">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.eyebrow}</KvEyebrow>
					<h2 className="text-[32px] font-normal leading-[1.2] text-[color:var(--aja-ink)] md:text-[44px] md:leading-[62px]">
						{conteudo.titulo.inicio} <Em w="black">{conteudo.titulo.enfase}</Em>
						{conteudo.titulo.fim}
					</h2>
					<p className="max-w-[760px] text-[16px] leading-[26px] text-[color:var(--aja-stone)]">
						{conteudo.texto.inicio}{" "}
						<strong className="font-semibold text-[color:var(--aja-ink)]">
							{conteudo.texto.forte}
						</strong>{" "}
						{conteudo.texto.fim}
					</p>
				</div>

				{/* Colunas estreitas com corredor largo: no comp cada passo mede ~265px
				    dentro de uma faixa de 1050, e é isso que faz o título quebrar em
				    duas linhas. Com a coluna larga ele cabe numa linha só e a seção
				    deixa de parecer o comp. */}
				<ol className="mx-auto mt-14 grid max-w-[1050px] gap-12 md:grid-cols-3 md:gap-x-32">
					{conteudo.passos.map((passo) => (
						<li key={passo.rotulo} className="flex flex-col">
							{/* Alinhado à direita: no comp as duas linhas do título terminam no
							    mesmo x, encostando na ilustração que vem embaixo. Em coluna única
							    isso não vale — o título ficaria à direita com a descrição à
							    esquerda logo abaixo, desalinhado sem motivo. */}
							<h3 className="whitespace-pre-line text-left md:text-right text-[20px] font-semibold leading-[1.3] text-[color:var(--aja-ink)]">
								{passo.titulo}
							</h3>

							{/* A caixa toma a proporção do CHEVRON (270×306 no comp), não a da
							    arte. É ele o elemento mais alto dos três, e sem isso ele vaza
							    da caixa e cobre o título em cima e o texto embaixo. */}
							<div className="relative mt-4 aspect-[270/306]">
								<div
									aria-hidden="true"
									className={`pointer-events-none absolute inset-0 ${TOM[passo.tom].forma}`}
									style={{ clipPath: RECORTE_CHEVRON }}
								/>

								{/* biome-ignore lint/performance/noImgElement: arte estática, exibida no tamanho do comp */}
								<img
									src={passo.ilustracao.src}
									alt={passo.ilustracao.alt}
									className="absolute right-[-5%] top-1/2 block h-auto w-[72%] -translate-y-1/2"
								/>

								{/* A pill pendura para FORA da coluna, à esquerda — no comp ela
								    começa antes da aresta do chevron e o texto de baixo é que
								    fica rente a essa aresta. Só a partir de `md`: na coluna
								    única do celular esse recuo vazaria a seção. */}
								<span
									className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.06em] md:-left-16 ${TOM[passo.tom].pill}`}
								>
									{passo.rotulo}
								</span>
							</div>

							<p className="mt-6 text-[15px] leading-[24px] text-[color:var(--aja-stone)]">
								{passo.descricao}
							</p>
						</li>
					))}
				</ol>

				<div className="mt-14 flex justify-center">
					<KvCtaButton
						variant="outline"
						// O rótulo é longo ("Quero comparar as melhores alternativas") e o átomo
						// tem `whitespace-nowrap`: com o `px-8` dele sobravam 261px de caixa
						// para 270px de texto em 375px, e a frase era cortada. Respiro e fonte
						// menores no celular; do `md` em diante vale o tamanho do sistema.
						className="h-12 w-full max-w-[516px] px-4 text-[14px] md:h-[52px] md:px-8 md:text-[16px]"
						onClick={(e) => onOpenChat(conteudo.semente, e.currentTarget, "chip")}
					>
						{conteudo.cta}
					</KvCtaButton>
				</div>
			</KvContainer>
		</section>
	);
}
