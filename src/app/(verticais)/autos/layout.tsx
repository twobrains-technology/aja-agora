import type { Metadata } from "next";
import type { ReactNode } from "react";

// A página é `"use client"` (precisa do Modo Teatro), e página cliente não
// exporta `metadata`. O layout é o lugar certo: continua no servidor, envolve só
// esta rota e dá a ela título e descrição próprios.
//
// Sem isto as três verticais herdavam o título genérico do layout raiz — as três
// disputando o mesmo resultado de busca, cada uma sem dizer do que trata.
export const metadata: Metadata = {
	title: "Consórcio de carro | Compare administradoras e simule a parcela",
	description:
		"Compare consórcio de carro entre administradoras autorizadas pelo Banco Central. Simule a parcela do crédito que cabe no seu orçamento, sem juros e sem entrada obrigatória.",
	alternates: { canonical: "/autos" },
	openGraph: {
		title: "Consórcio de carro | Compare administradoras e simule a parcela",
		description:
			"Quase 1 em cada 3 carros novos no Brasil passou por consórcio. Compare as opções e encontre a parcela ideal para o seu momento.",
		url: "/autos",
		type: "website",
		locale: "pt_BR",
	},
};

export default function AutosLayout({ children }: { children: ReactNode }) {
	return children;
}
