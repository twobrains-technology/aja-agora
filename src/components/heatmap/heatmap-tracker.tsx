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
import {
	alvoDoClique,
	caminhoEstavel,
	ehSobreposto,
	rotuloDe,
	secaoDe,
} from "@/lib/heatmap/selector";

/** Marcos de rolagem. Percentual contínuo não informa mais e multiplica linha. */
const MARCOS_SCROLL = [25, 50, 75, 100];

/** Parte da seção visível que conta como "viu". Metade evita contar raspão. */
const LIMIAR_SECAO = 0.5;

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

					secoesVistas.current.add(nome);
					enfileirar({ type: "section_view", path, section: nome });
					observador.unobserve(entrada.target);
				}
			},
			{ threshold: LIMIAR_SECAO },
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
