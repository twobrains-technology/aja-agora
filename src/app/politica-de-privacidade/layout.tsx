import type { Metadata } from "next";
import type { ReactNode } from "react";

// Ver `../termos-de-uso/layout.tsx`: documento jurídico é indexável, com resumo
// descritivo.
export const metadata: Metadata = {
	title: "Política de Privacidade | AJA",
	description:
		"Como a AJA coleta, trata, armazena e protege os seus dados pessoais, em conformidade com a LGPD, e como exercer os seus direitos de titular.",
	alternates: { canonical: "/politica-de-privacidade" },
};

export default function PoliticaDePrivacidadeLayout({ children }: { children: ReactNode }) {
	return children;
}
