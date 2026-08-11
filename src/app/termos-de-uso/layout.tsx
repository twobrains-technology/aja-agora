import type { Metadata } from "next";
import type { ReactNode } from "react";

// Documento jurídico: entra no índice (quem procura tem de achar), mas o resumo
// é descritivo e não de venda.
export const metadata: Metadata = {
	title: "Termos de Uso | AJA",
	description:
		"As condições que regem o uso do site e dos serviços de assessoria de consórcio da AJA: o que fazemos, o alcance das simulações e os seus direitos.",
	alternates: { canonical: "/termos-de-uso" },
};

export default function TermosDeUsoLayout({ children }: { children: ReactNode }) {
	return children;
}
