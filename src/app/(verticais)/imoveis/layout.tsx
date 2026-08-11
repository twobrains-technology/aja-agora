import type { Metadata } from "next";
import type { ReactNode } from "react";

// Ver a explicação em `../autos/layout.tsx`: página cliente não exporta
// `metadata`, então cada vertical ganha a sua aqui.
export const metadata: Metadata = {
	title: "Consórcio de imóvel | Compare administradoras e use o FGTS",
	description:
		"Compare consórcio de imóvel entre administradoras autorizadas pelo Banco Central. Simule a parcela, entenda o lance e saiba como usar o FGTS para complementar a carta de crédito.",
	alternates: { canonical: "/imoveis" },
	openGraph: {
		title: "Consórcio de imóvel | Compare administradoras e use o FGTS",
		description:
			"Sem juros de financiamento e com parcela previsível. Compare as opções de consórcio de imóvel e descubra o que cabe no seu planejamento.",
		url: "/imoveis",
		type: "website",
		locale: "pt_BR",
	},
};

export default function ImoveisLayout({ children }: { children: ReactNode }) {
	return children;
}
