"use client";

// Coletor do mapa de calor. Monta uma vez por landing e não renderiza nada.
//
// As três regras que moldam o arquivo:
//
// 1. **Não pode custar quadro de animação.** Todo listener é passivo, o scroll
//    só é lido dentro de `requestAnimationFrame`, e nada mede layout no caminho
//    do clique além do `getBoundingClientRect` do próprio alvo.
// 2. **Não pode perder o fim da sessão.** É justamente quem vai embora que
//    interessa. Por isso o despejo final vai por `sendBeacon` no `pagehide` e no
//    `visibilitychange`, que sobrevivem ao fechamento da aba — `fetch` comum
//    seria cancelado.
// 3. **Nunca derruba a página.** Qualquer erro aqui é engolido: analytics não
//    tem o direito de quebrar a navegação de quem ia comprar.
//
// Sobre consentimento: a landing já serve GTM, GA4 e Meta Pixel
// (`src/app/layout.tsx`), que rastreiam bem mais que isto e mandam pra fora.
// Este coletor grava menos, no NOSSO banco, sem PII (ver `sanitizeLabel`). Se um
// dia entrar banner de consentimento, ele governa os quatro juntos — pôr trava
// só aqui daria a impressão de proteção sem mudar o que sai do navegador.

import { useEffect, useRef } from "react";
import { MAX_EVENTS_POR_LOTE } from "@/lib/heatmap/events";
import { alvoDoClique, caminhoEstavel, rotuloDe, secaoDe } from "@/lib/heatmap/selector";

const ENDPOINT = "/api/track";

/** Intervalo do despejo periódico. Mais curto encheria a rede à toa. */
const INTERVALO_FLUSH_MS = 5_000;

/** Marcos de rolagem. Percentual contínuo não informa mais e multiplica linha. */
const MARCOS_SCROLL = [25, 50, 75, 100];

/** Parte da seção visível que conta como "viu". Metade evita contar raspão. */
const LIMIAR_SECAO = 0.5;

type EventoCru = Record<string, unknown>;

export function HeatmapTracker({ path }: { path: string }) {
	// Refs e não estado: nada aqui deve provocar renderização.
	const fila = useRef<EventoCru[]>([]);
	const secoesVistas = useRef(new Set<string>());
	const marcosAtingidos = useRef(new Set<number>());

	useEffect(() => {
		if (typeof window === "undefined") return;

		// Dentro de iframe não coleta. O painel embute a própria landing pra
		// desenhar a nuvem por cima dela (é same-origin, então dá) — sem esta
		// linha, cada operador que abrisse o mapa de calor injetaria os próprios
		// cliques nele, e a tela passaria a medir quem a estava lendo.
		if (window.self !== window.top) return;

		const viewport = () => ({
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
		});

		const enfileirar = (evento: EventoCru) => {
			fila.current.push({ ...evento, path, at: Date.now(), ...viewport() });
			if (fila.current.length >= MAX_EVENTS_POR_LOTE) despejar();
		};

		/**
		 * Manda o que estiver na fila. `sendBeacon` primeiro porque é o único que
		 * sobrevive ao fechamento da aba; `fetch` com `keepalive` é a reserva pra
		 * navegador que recusa o beacon (payload grande, por exemplo).
		 */
		const despejar = () => {
			if (fila.current.length === 0) return;

			const lote = fila.current;
			fila.current = [];

			try {
				const corpo = JSON.stringify({ events: lote });
				const enviou = navigator.sendBeacon?.(
					ENDPOINT,
					new Blob([corpo], { type: "application/json" }),
				);

				if (!enviou) {
					void fetch(ENDPOINT, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: corpo,
						keepalive: true,
					}).catch(() => {});
				}
			} catch {
				// Evento perdido é evento perdido. A página segue.
			}
		};

		const aoClicar = (evento: MouseEvent) => {
			try {
				const alvo = alvoDoClique(evento.target as Element | null);
				if (!alvo) return;

				const caixa = alvo.getBoundingClientRect();
				const larguraPagina = document.documentElement.scrollWidth || window.innerWidth;

				enfileirar({
					type: "click",
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
							enfileirar({ type: "scroll_depth", scrollPct: marco });
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
					enfileirar({ type: "section_view", section: nome });
					observador.unobserve(entrada.target);
				}
			},
			{ threshold: LIMIAR_SECAO },
		);

		for (const secao of document.querySelectorAll("[data-heat]")) observador.observe(secao);

		const aoEsconder = () => {
			if (document.visibilityState === "hidden") despejar();
		};

		document.addEventListener("click", aoClicar, { capture: true, passive: true });
		window.addEventListener("scroll", aoRolar, { passive: true });
		document.addEventListener("visibilitychange", aoEsconder);
		window.addEventListener("pagehide", despejar);

		const timer = window.setInterval(despejar, INTERVALO_FLUSH_MS);

		return () => {
			despejar();
			observador.disconnect();
			window.clearInterval(timer);
			document.removeEventListener("click", aoClicar, { capture: true });
			window.removeEventListener("scroll", aoRolar);
			document.removeEventListener("visibilitychange", aoEsconder);
			window.removeEventListener("pagehide", despejar);
		};
	}, [path]);

	return null;
}

function clamp(valor: number): number {
	if (!Number.isFinite(valor)) return 0;
	return Math.min(1, Math.max(0, valor));
}
