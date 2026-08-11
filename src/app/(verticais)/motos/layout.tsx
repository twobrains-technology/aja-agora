import type { Metadata } from "next";
import type { ReactNode } from "react";

// Ver a explicação em `../autos/layout.tsx`: página cliente não exporta
// `metadata`, então cada vertical ganha a sua aqui.
export const metadata: Metadata = {
	title: "Consórcio de moto | Compare administradoras e simule a parcela",
	description:
		"Compare consórcio de moto entre administradoras autorizadas pelo Banco Central. Simule a parcela para moto nova ou usada, de qualquer cilindrada, sem juros e sem entrada obrigatória.",
	alternates: { canonical: "/motos" },
	openGraph: {
		title: "Consórcio de moto | Compare administradoras e simule a parcela",
		description:
			"O consórcio lidera a compra de motos novas no Brasil. Compare as opções e encontre a parcela que cabe no seu bolso.",
		url: "/motos",
		type: "website",
		locale: "pt_BR",
	},
};

export default function MotosLayout({ children }: { children: ReactNode }) {
	return children;
}
