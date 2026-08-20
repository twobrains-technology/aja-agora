"use client";

import { useEffect, useRef } from "react";

import { useTheater } from "@/components/chat/theater/theater-context";
import { lerValorDoBem } from "@/lib/catalogo/deep-link";
import { formatarReais } from "@/lib/catalogo/itens";

interface SementeDeCampanhaProps {
	/** Fala do cliente montada com o valor da carta, no vocabulário da vertical
	 * ("Quero um carro de R$ 50.000."). Vem do conteúdo da página, ao lado das
	 * outras sementes — texto de vertical não mora em componente. */
	semente: (valor: string) => string;
}

/**
 * Continua, dentro do chat, a conversa que o anúncio começou.
 *
 * O item do catálogo da Meta aponta para `/autos?bem=50000`; aqui a landing lê
 * esse valor e abre o Modo Teatro com a fala já pronta.
 *
 * A origem é `"digitada"`, e não `"chip"`, e isso decide se a feature funciona
 * no caso que mais importa. `theater-chat.tsx` descarta a semente de `"chip"`
 * quando existe conversa anterior ("só o que ele DIGITOU sobrevive à retomada")
 * e manda "Voltei" no lugar — regra certa para o botão genérico ("Quero comprar
 * um carro."), que não carrega informação nenhuma. Aqui carrega: o cliente
 * ESCOLHEU um card de R$ 200.000 agora. Como remarketing dinâmico de catálogo é
 * quase todo visitante recorrente, tratar isto como chip apagaria justamente o
 * valor anunciado em quem já conversou — o anúncio prometeria uma carta e a
 * conversa começaria com "Voltei". Trocar de faixa de valor no meio do funil é
 * re-descoberta legítima, e o próprio funil já sabe lidar com isso (FIX-68).
 *
 * Lê de `window.location`, e não de `useSearchParams`, de propósito: as
 * landings são estáticas, e `useSearchParams` num componente cliente força o
 * Next a sair do prerender da página inteira. O efeito só roda no navegador,
 * onde a URL sempre existe.
 */
export function SementeDeCampanha({ semente }: SementeDeCampanhaProps) {
	const { openTheater } = useTheater();
	// StrictMode monta duas vezes em desenvolvimento; sem a trava o teatro
	// receberia a mesma semente duas vezes.
	const jaSemeou = useRef(false);

	useEffect(() => {
		if (jaSemeou.current) return;

		const valor = lerValorDoBem(new URLSearchParams(window.location.search));
		if (valor === null) return;

		jaSemeou.current = true;
		openTheater(semente(formatarReais(valor)), null, "digitada");
	}, [openTheater, semente]);

	return null;
}
