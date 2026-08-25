"use client";

// Coletor da landing. Monta uma vez por página e não renderiza nada.
//
// As três regras que moldam o arquivo:
//
// 1. **Não pode custar quadro de animação.** Todo listener é passivo, o scroll
//    só é lido dentro de `requestAnimationFrame`, e nada mede layout no caminho
//    do clique além do `getBoundingClientRect` do próprio alvo.
// 2. **Não pode perder o fim da sessão.** É justamente quem vai embora que
//    interessa — o despejo final é da fila (`fila.ts`), que sobrevive ao
//    fechamento da aba por `sendBeacon`.
// 3. **Nunca derruba a página.** Qualquer erro aqui é engolido: analytics não
//    tem o direito de quebrar a navegação de quem ia comprar.
//
// A fila e o envio saíram daqui em 18/08/2026, quando o chat também passou a
// emitir evento: o teatro é um portal fora desta árvore, e duas filas
// concorrentes partiriam a mesma sessão em dois lotes.
//
// Sobre consentimento: a landing já serve GTM, GA4 e Meta Pixel
// (`src/app/layout.tsx`), que rastreiam bem mais que isto e mandam pra fora.
// Este coletor grava no NOSSO banco. Se um dia entrar banner de consentimento,
// ele governa os quatro juntos — pôr trava só aqui daria a impressão de
// proteção sem mudar o que sai do navegador.

import { useEffect, useRef } from "react";
import { chatTocou } from "@/lib/heatmap/chat";
import { despejar, enfileirar } from "@/lib/heatmap/fila";
import { secaoFoiVista } from "@/lib/heatmap/secao-vista";
import {
	alvoDoClique,
	caminhoEstavel,
	ehSobreposto,
	rotuloDe,
	secaoDe,
} from "@/lib/heatmap/selector";

/**
 * Marcos de rolagem. Percentual contínuo não informa mais e multiplica linha.
 *
 * O 10 entrou em 24/08/2026 porque a home tem ~8.800px: no celular, 25% já são
 * quase três telas, e quem rolava uma ou duas não deixava marco nenhum. Em três
 * dias de produção só 27 de 608 pessoas apareceram com rolagem — não porque as
 * outras não rolaram, mas porque a régua começava longe demais.
 */
const MARCOS_SCROLL = [10, 25, 50, 75, 100];

/**
 * Os pontos em que o observador acorda.
 *
 * Precisa incluir frações BAIXAS: com `threshold: 0.5` sozinho, seção mais alta
 * que duas telas nunca dispara o callback, porque a fração visível dela jamais
 * chega a 50%. Quem decide se conta é `secaoFoiVista`; estes números só definem
 * quando a pergunta é feita.
 */
const PONTOS_DE_OBSERVACAO = [0, 0.1, 0.25, 0.5, 0.75];

export function HeatmapTracker({ path }: { path: string }) {
	// Refs e não estado: nada aqui deve provocar renderização.
	const secoesVistas = useRef(new Set<string>());
	const marcosAtingidos = useRef(new Set<number>());

	useEffect(() => {
		if (typeof window === "undefined") return;

		// Dentro de iframe não coleta. O painel embute a própria landing pra
		// desenhar a nuvem por cima dela (é same-origin, então dá) — sem esta
		// linha, cada operador que abrisse o mapa de calor injetaria os próprios
		// cliques nele, e a tela passaria a medir quem a estava lendo.
		if (window.self !== window.top) return;

		const aoClicar = (evento: MouseEvent) => {
			try {
				const alvo = alvoDoClique(evento.target as Element | null);
				if (!alvo) return;

				// O toque caiu dentro do teatro do chat (ou de um modal). Vira evento
				// de chat, e não ponto no mapa: o painel é `fixed`, então
				// `clientY + scrollY` desenharia a batida sobre uma seção da página
				// que a pessoa nunca tocou. O QUE foi tocado continua registrado.
				if (ehSobreposto(alvo)) {
					chatTocou({ selector: caminhoEstavel(alvo), label: rotuloDe(alvo) });
					return;
				}

				const caixa = alvo.getBoundingClientRect();
				const larguraPagina = document.documentElement.scrollWidth || window.innerWidth;

				enfileirar({
					type: "click",
					path,
					section: secaoDe(alvo),
					selector: caminhoEstavel(alvo),
					label: rotuloDe(alvo),
					// Relativas ao ALVO: é o que permite ver que o clique cai na borda
					// do botão, e não no meio dele.
					relX: caixa.width > 0 ? clamp((evento.clientX - caixa.left) / caixa.width) : 0,
					relY: caixa.height > 0 ? clamp((evento.clientY - caixa.top) / caixa.height) : 0,
					// Relativa à PÁGINA: é o que desenha a nuvem sobre a captura.
					pageRelX: clamp(evento.clientX / larguraPagina),
					pageY: Math.round(evento.clientY + window.scrollY),
				});
			} catch {
				// Nunca deixar o handler de clique estourar: ele roda ANTES do clique
				// chegar ao React, e uma exceção aqui mataria o CTA.
			}
		};

		let pendente = false;
		const aoRolar = () => {
			if (pendente) return;
			pendente = true;

			requestAnimationFrame(() => {
				pendente = false;
				try {
					const alcance = document.documentElement.scrollHeight - window.innerHeight;
					if (alcance <= 0) return;

					const pct =
						clamp((window.scrollY + window.innerHeight) / (alcance + window.innerHeight)) * 100;

					for (const marco of MARCOS_SCROLL) {
						if (pct >= marco && !marcosAtingidos.current.has(marco)) {
							marcosAtingidos.current.add(marco);
							enfileirar({ type: "scroll_depth", path, scrollPct: marco });
						}
					}
				} catch {
					// idem
				}
			});
		};

		// Seção vista: uma vez por carga. Repetir a cada volta do scroll faria a
		// seção do meio parecer mais vista que o topo, e o funil inverteria.
		const observador = new IntersectionObserver(
			(entradas) => {
				for (const entrada of entradas) {
					const nome = entrada.target.getAttribute("data-heat");
					if (!nome || !entrada.isIntersecting || secoesVistas.current.has(nome)) continue;

					// Metade da seção OU metade da tela — ver `secao-vista.ts`. A segunda
					// condição é a que faltava, e sem ela as seções altas da home
					// apareciam com zero visitante no painel.
					const alturaDaJanela = entrada.rootBounds?.height ?? window.innerHeight;
					if (
						!secaoFoiVista({
							fracaoDaSecao: entrada.intersectionRatio,
							alturaVisivelPx: entrada.intersectionRect.height,
							alturaDaJanelaPx: alturaDaJanela,
						})
					) {
						continue;
					}

					secoesVistas.current.add(nome);
					enfileirar({ type: "section_view", path, section: nome });
					observador.unobserve(entrada.target);
				}
			},
			{ threshold: PONTOS_DE_OBSERVACAO },
		);

		for (const secao of document.querySelectorAll("[data-heat]")) observador.observe(secao);

		document.addEventListener("click", aoClicar, { capture: true, passive: true });
		window.addEventListener("scroll", aoRolar, { passive: true });

		return () => {
			despejar();
			observador.disconnect();
			document.removeEventListener("click", aoClicar, { capture: true });
			window.removeEventListener("scroll", aoRolar);
		};
	}, [path]);

	return null;
}

function clamp(valor: number): number {
	if (!Number.isFinite(valor)) return 0;
	return Math.min(1, Math.max(0, valor));
}
