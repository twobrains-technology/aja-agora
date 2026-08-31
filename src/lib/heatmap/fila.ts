// src/lib/heatmap/fila.ts
//
// A fila de eventos do navegador — uma só, compartilhada pela landing e pelo
// chat. Client-only.
//
// Ela nasceu presa dentro do `useEffect` do `HeatmapTracker`, e ficou pequena
// demais no dia em que o chat também passou a emitir evento (18/08/2026): o
// teatro é um portal fora da árvore do tracker, e sem um ponto comum cada um
// teria a própria fila, o próprio timer e o próprio `sendBeacon` — dois lotes
// concorrentes, com a mesma sessão partida em dois.
//
// As três regras herdadas do coletor original valem inteiras aqui:
//
// 1. **Não pode custar quadro de animação.** Nada aqui mede layout nem bloqueia.
// 2. **Não pode perder o fim da sessão.** É quem vai embora que interessa mais,
//    então o despejo final vai por `sendBeacon` no `pagehide`/`visibilitychange`
//    — `fetch` comum seria cancelado junto com a aba.
// 3. **Nunca derruba a página.** Todo caminho é engolido: analytics não tem o
//    direito de quebrar a navegação de quem ia comprar.

import { MAX_EVENTS_POR_LOTE } from "./events";

const ENDPOINT = "/api/track";

/** Intervalo do despejo periódico. Mais curto encheria a rede à toa. */
const INTERVALO_FLUSH_MS = 5_000;

type EventoCru = Record<string, unknown>;

let fila: EventoCru[] = [];
let instalada = false;

function viewport() {
	return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
}

/**
 * O `_fbp` que o pixel gravou NESTE navegador, se ele já rodou.
 *
 * Vai de carona no despejo (item B2, 30/08/2026). O proxy tenta ler este mesmo
 * cookie na chegada, mas na PRIMEIRA visita de um navegador ele ainda não
 * existe: quem o grava é o pixel, depois que a página carregou. Como quase todo
 * tráfego pago é primeira visita, o campo ficava nulo justamente onde vale —
 * 683 de 46.135 visitas em produção (1,5%).
 *
 * De carona e não em requisição própria: este beacon já dispara em toda visita
 * e o servidor já resolveu o cookie da visita ali. Um endpoint só para isto
 * seria uma requisição a mais por visitante para completar um campo.
 *
 * Não é PII e a Meta exige que ele viaje SEM hash — é um id de navegador que o
 * próprio pixel dela criou.
 */
function fbpDoNavegador(): string | null {
	const achado = document.cookie.match(/(?:^|;\s*)_fbp=([^;]*)/);
	return achado ? decodeURIComponent(achado[1]) : null;
}

/**
 * Manda o que estiver na fila. `sendBeacon` primeiro porque é o único que
 * sobrevive ao fechamento da aba; `fetch` com `keepalive` é a reserva pra
 * navegador que recusa o beacon (payload grande, por exemplo).
 */
export function despejar(): void {
	if (typeof window === "undefined" || fila.length === 0) return;

	const lote = fila;
	fila = [];

	try {
		const fbp = fbpDoNavegador();
		const corpo = JSON.stringify({ events: lote, ...(fbp ? { fbp } : {}) });
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
}

/**
 * Instala timer e listeners UMA vez por carga de página.
 *
 * Preguiçoso de propósito: o teatro do chat pode emitir antes de qualquer
 * montagem do tracker (a landing serve a home, mas o chat abre de qualquer
 * seção), e um evento que chega com a fila desligada ficaria preso até o
 * próximo despejo que talvez nunca viesse.
 *
 * Nunca é desinstalada. A fila vive o que a página viver — desligar no unmount
 * de um componente derrubaria a coleta do outro.
 */
function instalar(): void {
	if (instalada || typeof window === "undefined") return;
	instalada = true;

	const aoEsconder = () => {
		if (document.visibilityState === "hidden") despejar();
	};

	document.addEventListener("visibilitychange", aoEsconder);
	window.addEventListener("pagehide", despejar);
	window.setInterval(despejar, INTERVALO_FLUSH_MS);
}

/**
 * Põe um evento na fila, completando o que todo evento carrega: a página, o
 * instante e o tamanho da tela.
 *
 * `path` sai de `location` por padrão — assim quem emite (o chat, um card, um
 * botão qualquer) não precisa saber em que landing está. O servidor confere
 * contra a allowlist de páginas de qualquer jeito.
 */
export function enfileirar(evento: EventoCru): void {
	if (typeof window === "undefined") return;

	instalar();

	fila.push({
		path: window.location.pathname,
		at: Date.now(),
		...viewport(),
		...evento,
	});

	if (fila.length >= MAX_EVENTS_POR_LOTE) despejar();
}

/** Só pra teste: devolve o que está esperando despejo. */
export function filaAtual(): readonly EventoCru[] {
	return fila;
}

/** Só pra teste: zera fila e instalação entre casos. */
export function resetarFila(): void {
	fila = [];
	instalada = false;
}
