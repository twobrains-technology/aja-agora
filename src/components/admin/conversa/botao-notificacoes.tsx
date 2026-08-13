"use client";

/**
 * Liga os avisos de mensagem nova (som + notificação do sistema).
 *
 * Existe como BOTÃO, e não como pedido automático no load, por dois motivos que
 * se somam: o navegador exige gesto do usuário pra tocar áudio, e permissão de
 * notificação pedida sem contexto é negada por reflexo — e negada não dá pra
 * pedir de novo pela API, o usuário teria que ir no cadeado da barra de
 * endereço. Um clique resolve as duas coisas de uma vez.
 *
 * ## Nenhum estado some da tela
 *
 * Este componente já retornou `null` quando o navegador não tinha a API de
 * notificação. Pra quem estava do outro lado, isso era "não tem botão nenhum
 * aqui" — a queixa de "não consigo ativar" sem nada pra investigar, porque o
 * caso que mais causa o sumiço (página fora de HTTPS, iframe, iOS sem o painel
 * na tela de início) é justamente o que não se enxerga. Agora cada estado se
 * explica em português e deixa registro no log do servidor.
 */

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	type AmbienteDeAviso,
	motivoDeBloqueio,
	motivoDeIndisponibilidade,
	registrarDiagnostico,
	snapshotDeAvisos,
} from "@/lib/telemetry/diagnostico-notificacoes";

import {
	estadoDaNotificacao,
	type PermissaoNotificacao,
	pedirPermissao,
	prepararAudio,
	tocarAviso,
} from "./alerta-de-mensagem";

/**
 * Quanto se espera o navegador responder antes de assumir que ele engoliu o
 * pedido. Achado pilotando: o Chrome suprime o prompt (o "quiet UI") pra quem
 * costuma bloquear notificações, e aí a promise NUNCA resolve — sem este prazo,
 * o botão fica desabilitado em "Pedindo permissão…" pelo resto da sessão.
 */
const ESPERA_MAXIMA_MS = 20_000;

export function BotaoNotificacoes() {
	// Começa como "indisponivel" e só consulta no efeito: `Notification` não
	// existe no servidor, e ler no render quebraria a hidratação.
	const [permissao, setPermissao] = useState<PermissaoNotificacao>("indisponivel");
	const [ambiente, setAmbiente] = useState<AmbienteDeAviso | null>(null);
	const [pedindo, setPedindo] = useState(false);
	const [semResposta, setSemResposta] = useState(false);

	useEffect(() => {
		setPermissao(estadoDaNotificacao());
		const amb = snapshotDeAvisos();
		setAmbiente(amb);
		// Retrato de quem abriu o painel. É a linha que responde "o que essa pessoa
		// tem de diferente" quando o aviso funciona pra uns e não pra outros.
		registrarDiagnostico("montagem", { permissao: amb.permissao });
	}, []);

	if (permissao === "indisponivel") {
		// Antes da leitura do efeito não há o que dizer — evita piscar um aviso de
		// erro em quem está com tudo funcionando.
		if (!ambiente) return null;

		return (
			<span
				className="inline-flex items-start gap-1.5 text-xs text-muted-foreground"
				title={motivoDeIndisponibilidade(ambiente) ?? undefined}
				data-testid="notificacoes-indisponiveis"
			>
				<BellOff className="size-3.5 mt-0.5 shrink-0" aria-hidden />
				<span>
					Avisos indisponíveis neste navegador.{" "}
					{motivoDeIndisponibilidade(ambiente) ?? "Fale com o suporte."}
				</span>
			</span>
		);
	}

	if (permissao === "granted") {
		return (
			<span
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
				data-testid="notificacoes-ativas"
			>
				<BellRing className="size-3.5" aria-hidden />
				Avisos ligados
			</span>
		);
	}

	if (permissao === "denied") {
		const motivo = ambiente ? motivoDeBloqueio(ambiente) : null;
		return (
			<span
				className="inline-flex items-start gap-1.5 text-xs text-muted-foreground"
				// Sem ícone sozinho: estado nunca se comunica só por cor ou desenho.
				title={motivo ?? undefined}
				data-testid="notificacoes-bloqueadas"
			>
				<BellOff className="size-3.5 mt-0.5 shrink-0" aria-hidden />
				<span>Avisos bloqueados. {motivo}</span>
			</span>
		);
	}

	return (
		<span className="inline-flex flex-col items-start gap-1">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={pedindo}
				className="h-7 gap-1.5 text-xs"
				data-testid="ativar-notificacoes"
				onClick={async () => {
					setPedindo(true);
					setSemResposta(false);
					registrarDiagnostico("clique", { permissaoAntes: estadoDaNotificacao() });

					// Prazo de espera: sem ele, um prompt que o navegador nunca mostra
					// deixa o botão desabilitado pra sempre. O pedido em si NÃO é
					// cancelado — se a resposta vier depois, o estado ainda se corrige.
					const prazo = setTimeout(() => {
						setPedindo(false);
						setSemResposta(true);
						registrarDiagnostico("permissao", {
							resultado: "sem-resposta",
							motivo: "prompt-nao-respondido",
						});
					}, ESPERA_MAXIMA_MS);

					try {
						// O clique é o gesto que destrava o áudio — aproveitado aqui mesmo.
						prepararAudio();
						const r = await pedirPermissao();
						setPermissao(r);
						registrarDiagnostico("clique", { resultado: r });
						// Toca uma vez pra pessoa saber que som vai ouvir, e pra confirmar
						// que o áudio realmente destravou neste navegador.
						if (r === "granted") tocarAviso();
					} catch (err) {
						// O pedido pode estourar (política de empresa, extensão, webview).
						// Cair aqui não pode levar o painel junto: o estado vira "bloqueado",
						// que é o que a pessoa está vivendo, e o erro vai pro log.
						registrarDiagnostico("falha", { onde: "BotaoNotificacoes", erro: String(err) });
						setPermissao("denied");
					} finally {
						clearTimeout(prazo);
						setPedindo(false);
					}
				}}
			>
				<Bell className="size-3.5" aria-hidden />
				{pedindo ? "Pedindo permissão…" : "Ativar avisos de mensagem"}
			</Button>
			{semResposta && (
				<span className="text-xs text-muted-foreground" data-testid="notificacoes-sem-resposta">
					O navegador não mostrou o pedido. Abra o cadeado ao lado do endereço e libere as
					notificações deste site.
				</span>
			)}
		</span>
	);
}
