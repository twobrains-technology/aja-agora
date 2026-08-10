"use client";

/**
 * Liga os avisos de mensagem nova (som + notificação do sistema).
 *
 * Existe como BOTÃO, e não como pedido automático no load, por dois motivos que
 * se somam: o navegador exige gesto do usuário pra tocar áudio, e permissão de
 * notificação pedida sem contexto é negada por reflexo — e negada não dá pra
 * pedir de novo pela API, o usuário teria que ir no cadeado da barra de
 * endereço. Um clique resolve as duas coisas de uma vez.
 */

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	estadoDaNotificacao,
	type PermissaoNotificacao,
	pedirPermissao,
	prepararAudio,
	tocarAviso,
} from "./alerta-de-mensagem";

export function BotaoNotificacoes() {
	// Começa como "indisponivel" e só consulta no efeito: `Notification` não
	// existe no servidor, e ler no render quebraria a hidratação.
	const [permissao, setPermissao] = useState<PermissaoNotificacao>("indisponivel");

	useEffect(() => {
		setPermissao(estadoDaNotificacao());
	}, []);

	if (permissao === "indisponivel") return null;

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
		return (
			<span
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
				// Sem ícone sozinho: estado nunca se comunica só por cor ou desenho.
				title="O navegador bloqueou as notificações deste site. Para reativar, use o cadeado na barra de endereço."
				data-testid="notificacoes-bloqueadas"
			>
				<BellOff className="size-3.5" aria-hidden />
				Avisos bloqueados pelo navegador
			</span>
		);
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-7 gap-1.5 text-xs"
			data-testid="ativar-notificacoes"
			onClick={async () => {
				// O clique é o gesto que destrava o áudio — aproveitado aqui mesmo.
				prepararAudio();
				const r = await pedirPermissao();
				setPermissao(r);
				// Toca uma vez pra pessoa saber que som vai ouvir, e pra confirmar
				// que o áudio realmente destravou neste navegador.
				if (r === "granted") tocarAviso();
			}}
		>
			<Bell className="size-3.5" aria-hidden />
			Ativar avisos de mensagem
		</Button>
	);
}
