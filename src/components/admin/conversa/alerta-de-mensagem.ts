"use client";

/**
 * Aviso de mensagem nova pro atendente: som curto + notificação do sistema.
 *
 * ## Por que o som é SINTETIZADO e não o arquivo do WhatsApp
 *
 * O bipe do WhatsApp é obra da Meta — embutir o arquivo deles no nosso bundle
 * seria uso de material protegido. O que se copia aqui é a FUNÇÃO (um toque
 * curto, discreto, reconhecível), não o áudio. Web Audio API resolve em ~20
 * linhas, sem binário no repositório e sem request extra pra tocar.
 *
 * ## Autoplay
 *
 * Navegador não deixa tocar áudio antes de o usuário interagir com a página. O
 * `AudioContext` nasce suspenso e só é retomado depois de um clique — por isso
 * `prepararAudio()` é chamado no primeiro gesto, e não no load.
 */

let ctx: AudioContext | null = null;

/** Cria/retoma o contexto de áudio. Chamar num gesto do usuário (clique). */
export function prepararAudio(): void {
	if (typeof window === "undefined") return;
	const AudioCtor =
		window.AudioContext ??
		(window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AudioCtor) return;
	if (!ctx) ctx = new AudioCtor();
	if (ctx.state === "suspended") void ctx.resume();
}

/**
 * Toca o aviso: duas notas curtas, subindo. Sem dependência e sem arquivo.
 *
 * Volume baixo (0.12) de propósito — quem atende fica com isso o dia inteiro no
 * ouvido, e alerta estridente vira motivo pra desligar o som.
 */
export function tocarAviso(): void {
	prepararAudio();
	if (!ctx || ctx.state !== "running") return;

	const agora = ctx.currentTime;
	// Duas senoides curtas (880Hz → 1175Hz): sobe, o que o ouvido lê como
	// "chegou algo", em vez de descer, que soa como erro.
	for (const [i, freq] of [880, 1174.66].entries()) {
		const osc = ctx.createOscillator();
		const ganho = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = freq;

		const inicio = agora + i * 0.09;
		const fim = inicio + 0.09;
		// Envelope: sem o fade, o corte seco do oscilador estala no alto-falante.
		ganho.gain.setValueAtTime(0.0001, inicio);
		ganho.gain.exponentialRampToValueAtTime(0.12, inicio + 0.012);
		ganho.gain.exponentialRampToValueAtTime(0.0001, fim);

		osc.connect(ganho).connect(ctx.destination);
		osc.start(inicio);
		osc.stop(fim + 0.02);
	}
}

export type PermissaoNotificacao = "indisponivel" | "default" | "granted" | "denied";

export function estadoDaNotificacao(): PermissaoNotificacao {
	if (typeof window === "undefined" || !window.Notification) return "indisponivel";
	return Notification.permission as PermissaoNotificacao;
}

/**
 * Pede permissão. SÓ chamar a partir de um clique.
 *
 * Pedir no carregamento da página é o caminho mais curto pro usuário negar por
 * reflexo — e negado não dá pra perguntar de novo pela API; ele teria que ir no
 * cadeado da barra de endereço.
 */
export async function pedirPermissao(): Promise<PermissaoNotificacao> {
	if (typeof window === "undefined" || !window.Notification) return "indisponivel";
	if (Notification.permission !== "default") return Notification.permission as PermissaoNotificacao;
	try {
		return (await Notification.requestPermission()) as PermissaoNotificacao;
	} catch {
		return "denied";
	}
}

/**
 * Notificação do sistema. Só quando a aba NÃO está à vista.
 *
 * Com a conversa aberta na frente do atendente, o balão do sistema é ruído puro
 * — ele já está vendo a mensagem chegar. É o mesmo critério do WhatsApp Web.
 */
export function notificarMensagem(de: string, texto: string): void {
	if (typeof window === "undefined" || !window.Notification) return;
	if (Notification.permission !== "granted") return;
	if (typeof document !== "undefined" && document.visibilityState === "visible") return;

	try {
		const n = new Notification(`Mensagem de ${de}`, {
			body: texto.slice(0, 140),
			icon: "/favicon.ico",
			// `tag` fixa por conversa: mensagens seguidas SUBSTITUEM o balão em vez
			// de empilhar dez avisos de um cliente falante.
			tag: `aja-conversa-${de}`,
			silent: true, // o som é o nosso; dois toques ao mesmo tempo soa quebrado
		});
		n.onclick = () => {
			window.focus();
			n.close();
		};
	} catch {
		// Notificação é conforto, nunca caminho crítico — falhar aqui é silencioso.
	}
}
