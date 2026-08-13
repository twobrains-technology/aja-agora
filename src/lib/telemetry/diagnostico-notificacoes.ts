"use client";

/**
 * Rastro de por que o aviso de mensagem nova não ligou na máquina do atendente.
 *
 * ## Por que existe
 *
 * "Não consigo ativar a notificação" chegava sem nenhuma evidência. E os três
 * jeitos de isso acontecer são MUDOS por natureza:
 *
 * 1. **Sem a API** — `window.Notification` não existe fora de contexto seguro,
 *    dentro de iframe cross-origin, e no iOS enquanto o painel não estiver
 *    instalado na tela de início. O botão simplesmente não renderiza: pra pessoa,
 *    "não tem botão nenhum".
 * 2. **Permissão negada** — negada não dá pra pedir de novo pela API. Do lado de
 *    cá o clique parece não ter feito nada.
 * 3. **Construtor que lança** — em Chrome no Android, `new Notification(...)`
 *    joga `TypeError: Illegal constructor` (lá só vale
 *    `ServiceWorkerRegistration.showNotification`). O `catch` engolia.
 *
 * ## A regra desta camada
 *
 * Diagnóstico NUNCA pode ser o motivo de uma queda. Tudo aqui é best-effort:
 * sem `fetch`, com rede caindo, sem `Notification`, sem `AudioContext` — o
 * painel segue de pé e o atendente não vê erro nenhum. Por isso cada caminho é
 * embrulhado, e a promessa do envio é descartada com `.catch`.
 *
 * O evento vai a DOIS destinos: `console.info` (o DevTools de quem estiver
 * junto) e o servidor (o log do container, que é onde a gente consegue olhar
 * sem depender de print de ninguém).
 */

const ROTA = "/api/admin/diagnostico/notificacoes";

/** Janela de silêncio por evento repetido. O painel fica aberto o dia inteiro. */
const JANELA_MS = 60_000;

/** Teto de envios por carregamento de página — rede de segurança contra loop. */
const MAX_ENVIOS = 60;

/** Eventos que o usuário PROVOCA. São raros e são justamente o que se investiga. */
const SEMPRE_ENVIA = new Set<EtapaDeDiagnostico>(["clique", "permissao"]);

export type EtapaDeDiagnostico =
	| "montagem"
	| "clique"
	| "permissao"
	| "audio"
	| "aviso"
	// O stream entra aqui porque "não recebo aviso" tem DUAS causas com o mesmo
	// sintoma: o aviso não saiu, ou a mensagem nunca chegou à tela. Sem o estado
	// da conexão, as duas se parecem no log — e o conserto de cada uma é outro.
	| "stream"
	| "falha";

export interface AmbienteDeAviso {
	temApiDeNotificacao: boolean;
	/** `granted` | `denied` | `default` | `sem-api` */
	permissao: string;
	contextoSeguro: boolean;
	protocolo: string;
	host: string;
	/** Notificação dentro de iframe cross-origin é bloqueada pelo navegador. */
	emIframe: boolean;
	visibilidade: string;
	comFoco: boolean;
	temApiDeAudio: boolean;
	temServiceWorker: boolean;
	instaladoComoApp: boolean;
	pareceIOS: boolean;
	pareceAndroid: boolean;
	navegador: string;
	idioma: string;
}

type Detalhe = Record<string, string | number | boolean | null | undefined>;

const ultimoEnvio = new Map<string, number>();
let enviados = 0;

/** Zera throttle e teto. Existe para os testes — produção recarrega a página. */
export function zerarDiagnostico(): void {
	ultimoEnvio.clear();
	enviados = 0;
}

function texto(valor: unknown, limite = 240): string {
	return String(valor ?? "").slice(0, limite);
}

export function snapshotDeAvisos(): AmbienteDeAviso {
	const vazio: AmbienteDeAviso = {
		temApiDeNotificacao: false,
		permissao: "sem-api",
		contextoSeguro: false,
		protocolo: "sem-janela",
		host: "sem-janela",
		emIframe: false,
		visibilidade: "sem-janela",
		comFoco: false,
		temApiDeAudio: false,
		temServiceWorker: false,
		instaladoComoApp: false,
		pareceIOS: false,
		pareceAndroid: false,
		navegador: "sem-janela",
		idioma: "sem-janela",
	};
	if (typeof window === "undefined") return vazio;

	try {
		const w = window as typeof window & {
			webkitAudioContext?: unknown;
		};
		const ua = texto(navigator?.userAgent);
		const temApi = Boolean(w.Notification);

		return {
			temApiDeNotificacao: temApi,
			permissao: temApi ? texto(Notification.permission, 20) : "sem-api",
			contextoSeguro: Boolean(w.isSecureContext),
			protocolo: texto(location?.protocol, 12),
			host: texto(location?.host, 120),
			// `window.top` de outra origem lança ao ser lido — o próprio throw é a
			// resposta: está em iframe cross-origin, onde o aviso não vai funcionar.
			emIframe: ehIframe(),
			visibilidade: texto(document?.visibilityState, 20),
			comFoco: typeof document?.hasFocus === "function" ? document.hasFocus() : false,
			temApiDeAudio: Boolean(w.AudioContext ?? w.webkitAudioContext),
			temServiceWorker: Boolean(navigator?.serviceWorker),
			instaladoComoApp: estaInstalado(),
			pareceIOS: /iphone|ipad|ipod/i.test(ua),
			pareceAndroid: /android/i.test(ua),
			navegador: ua,
			idioma: texto(navigator?.language, 20),
		};
	} catch {
		return vazio;
	}
}

function ehIframe(): boolean {
	try {
		return window.top !== window.self;
	} catch {
		return true;
	}
}

function estaInstalado(): boolean {
	try {
		if ((navigator as { standalone?: boolean }).standalone) return true;
		return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);
	} catch {
		return false;
	}
}

/**
 * O que dizer ao atendente quando o navegador não oferece o aviso.
 *
 * Retorna `null` quando a API existe — aí o problema (se houver) é outro, e
 * quem fala é o próprio botão.
 */
export function motivoDeIndisponibilidade(amb: AmbienteDeAviso): string | null {
	if (amb.temApiDeNotificacao) return null;
	if (!amb.contextoSeguro) {
		return "Esta página não está num endereço seguro (HTTPS) — o navegador só libera avisos assim.";
	}
	if (amb.emIframe) {
		return "O painel está aberto dentro de outra página; abra em uma aba própria para ligar os avisos.";
	}
	if (amb.pareceIOS && !amb.instaladoComoApp) {
		return "No iPhone/iPad os avisos só funcionam com o painel adicionado à tela de início.";
	}
	return "Este navegador não oferece avisos do sistema. Use o Chrome ou o Edge no computador.";
}

/**
 * O que dizer quando a permissão está NEGADA.
 *
 * Fora de HTTPS o Chrome recusa o pedido sem nem mostrar o prompt, e a permissão
 * fica `denied` na hora. Mandar a pessoa "liberar no cadeado" nesse caso é uma
 * volta inteira em falso: não existe o que liberar lá — o endereço é que precisa
 * ser seguro.
 */
export function motivoDeBloqueio(amb: AmbienteDeAviso): string {
	if (!amb.contextoSeguro) {
		return "Esta página não está num endereço seguro (HTTPS), e o navegador recusa avisos assim. Fale com o suporte para acessar pelo endereço correto.";
	}
	return "O navegador bloqueou as notificações deste site. Para reativar, use o cadeado na barra de endereço.";
}

function podeEnviar(etapa: EtapaDeDiagnostico, detalhe: Detalhe): boolean {
	if (enviados >= MAX_ENVIOS) return false;
	if (SEMPRE_ENVIA.has(etapa)) return true;

	// A chave inclui o motivo: "aviso suprimido porque a aba estava à vista" e
	// "aviso suprimido por falta de permissão" são achados diferentes, e calar o
	// segundo por causa do primeiro esconderia justo o que se procura.
	const chave = `${etapa}:${detalhe.motivo ?? detalhe.resultado ?? ""}`;
	const agora = Date.now();
	const ultimo = ultimoEnvio.get(chave);
	if (ultimo !== undefined && agora - ultimo < JANELA_MS) return false;
	ultimoEnvio.set(chave, agora);
	return true;
}

function enviarAoServidor(corpo: unknown): void {
	try {
		if (typeof fetch !== "function") return;
		enviados++;
		// `keepalive`: o evento costuma sair junto de uma troca de aba ou de um
		// fechamento — sem isso o navegador cancela o POST no meio.
		void fetch(ROTA, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(corpo),
			credentials: "same-origin",
			keepalive: true,
		})?.catch(() => {});
	} catch {
		// Diagnóstico não derruba tela. Nem esta linha.
	}
}

export function registrarDiagnostico(etapa: EtapaDeDiagnostico, detalhe: Detalhe = {}): void {
	try {
		const ambiente = snapshotDeAvisos();
		// Prefixo fixo: é por `[notificacoes]` que se filtra no CloudWatch e no
		// DevTools. Mudar o prefixo cega a busca de quem for investigar depois.
		console.info(`[notificacoes] ${etapa}`, { ...detalhe, ambiente });

		if (!podeEnviar(etapa, detalhe)) return;
		enviarAoServidor({
			etapa,
			quando: new Date().toISOString(),
			detalhe,
			ambiente,
		});
	} catch {
		// idem
	}
}
