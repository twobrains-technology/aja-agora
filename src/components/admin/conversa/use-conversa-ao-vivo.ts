"use client";

/**
 * Mantém a conversa do atendente viva na tela.
 *
 * Duas fontes, de propósito:
 *
 * 1. **SSE** (`/api/admin/conversations/[id]/stream`) — o caminho rápido. A
 *    mensagem do cliente aparece no mesmo segundo, que é o que faz a tela
 *    parecer um WhatsApp em vez de um relatório.
 * 2. **Polling de baixa frequência** — a rede embaixo. O bus que alimenta o SSE
 *    é in-memory e single-process: hoje prod roda uma task e funciona, mas no dia
 *    em que escalar, o evento publicado numa instância não chega ao SSE aberto na
 *    outra — e a falha seria SILENCIOSA, a tela só pararia de atualizar. O
 *    polling também cobre conexão caída e aba que voltou do background.
 *
 * O polling não briga com o SSE: ele só pede o histórico de novo, e quem
 * consolida é o `onNovaMensagem` do chamador (que deduplica por id).
 */

import { useEffect, useRef } from "react";

/** Intervalo da rede de segurança. Baixo o bastante pra não pesar, alto o bastante pra não substituir o SSE. */
const POLL_MS = 15_000;

interface Opts {
	/** Conversa a acompanhar. `null` = nada aberto, não conecta. */
	conversationId: string | null;
	/** Chamado quando chega mensagem nova pelo SSE ou quando o poll deve recarregar. */
	onAtualizar: () => void;
	/**
	 * Chamado SÓ pelo SSE, com a mensagem que chegou. É por aqui que sai o alerta
	 * (som/notificação): o polling não serve pra isso, porque ele não sabe se
	 * algo mudou — alertaria a cada 15 segundos, mensagem nova ou não.
	 */
	onMensagem?: (mensagem: { role?: string; content?: string }) => void;
	/** `false` desliga tudo (modal fechado) — sem isso o SSE fica aberto à toa. */
	ativo?: boolean;
}

export function useConversaAoVivo({ conversationId, onAtualizar, onMensagem, ativo = true }: Opts) {
	// As callbacks mudam a cada render do pai; guardá-las numa ref evita
	// reconectar o SSE a cada digitação — reconexão em loop derrubaria o stream.
	const cb = useRef(onAtualizar);
	cb.current = onAtualizar;
	const cbMensagem = useRef(onMensagem);
	cbMensagem.current = onMensagem;

	useEffect(() => {
		if (!conversationId || !ativo) return;

		let fechado = false;

		// `EventSource` não existe em todo ambiente (SSR e o happy-dom dos testes
		// não têm). Sem o guard, o componente inteiro quebrava com ReferenceError.
		// Faltando o SSE, o polling sozinho já mantém a tela viva — mais lento,
		// nunca morto.
		const source =
			typeof EventSource !== "undefined"
				? new EventSource(`/api/admin/conversations/${conversationId}/stream`)
				: null;

		if (source) {
			source.onmessage = (ev) => {
				try {
					const payload = JSON.parse(ev.data) as {
						type?: string;
						message?: { role?: string; content?: string };
					};
					// `connected` e `ping` são só sinal de vida — não mexem na lista.
					if (payload.type !== "message") return;
					cb.current();
					if (payload.message) cbMensagem.current?.(payload.message);
				} catch {
					// Frame malformado não pode derrubar o stream inteiro.
				}
			};

			source.onerror = () => {
				// O EventSource já reconecta sozinho. Nada de fechar aqui: fechar na
				// primeira falha de rede transformaria um soluço em tela morta até o
				// próximo mount — e é justamente o polling que segura a queda.
			};
		}

		const poll = setInterval(() => {
			if (!fechado) cb.current();
		}, POLL_MS);

		return () => {
			fechado = true;
			clearInterval(poll);
			source?.close();
		};
	}, [conversationId, ativo]);
}
