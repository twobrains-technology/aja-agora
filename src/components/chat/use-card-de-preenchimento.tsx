"use client";

import { Check } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useChatContext } from "@/lib/chat/provider";

// Comportamento ÚNICO dos cards de preenchimento do chat web (valor, nome,
// celular, CPF). Três regras, num lugar só:
//   1. nasce habilitado e com o foco no campo principal (`useFocoAoMontar`);
//   2. Enter envia: cada card é um <form onSubmit>, sem handler solto;
//   3. depois de respondido — pelo card ou digitando na conversa — o card sela
//      (`useRespondidoNaConversa` + `CardRespondido`), nunca fica ativo e velho.

/** Foco no campo quando o card monta (e quando volta a ficar ativo). Efeito, não
 * `autoFocus`: o do React só vale na montagem e some com campo `disabled`. */
export function useFocoAoMontar(
	ref: RefObject<HTMLElement | null>,
	ativo: boolean,
	// Muda quando o campo principal troca (ex.: "Usar outros dados" reabre o input).
	chave?: unknown,
) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: `chave` só reexecuta o foco.
	useEffect(() => {
		if (ativo) ref.current?.focus();
	}, [ativo, ref, chave]);
}

/** `true` quando o cliente respondeu pela conversa (digitando) depois que o card
 * apareceu. Duas leituras, qualquer uma sela:
 *  - chegou fala de usuário que não existia quando o card montou;
 *  - a ÚLTIMA mensagem da conversa é do cliente: o card vive na mensagem do
 *    agente, então se a última é dele, a pergunta já foi respondida. Esta cobre
 *    o card remontado depois da resposta (o snapshot já nasceria com ela). */
export function useRespondidoNaConversa(): boolean {
	const { messages } = useChatContext();
	const idsAoMontar = useRef<string[] | null>(null);
	const [chegouFalaNova, setChegouFalaNova] = useState(false);
	useEffect(() => {
		const ids = messages.filter((m) => m.role === "user").map((m) => m.id);
		if (idsAoMontar.current === null) {
			idsAoMontar.current = ids;
			return;
		}
		const conhecidos = idsAoMontar.current;
		if (ids.some((id) => !conhecidos.includes(id))) setChegouFalaNova(true);
	}, [messages]);
	const ultima = messages[messages.length - 1];
	return chegouFalaNova || ultima?.role === "user";
}

/** Estado "respondido" com TEXTO visível (não depende de cor). */
export function CardRespondido({ texto = "Respondido" }: { texto?: string }) {
	return (
		<output
			data-testid="card-respondido"
			data-sealed="true"
			className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground"
		>
			<Check className="size-3.5" aria-hidden="true" />
			{texto}
		</output>
	);
}
