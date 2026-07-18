import type { Metadata } from "next";

import { lato, manrope, merriweather } from "./fonts";

export const metadata: Metadata = {
	title: "Aja Agora — Key Visual",
	description: "Réplica fiel do site (Figma Key Visual).",
};

// A landing Key Visual roda numa rota isolada (/kv) pra não mexer na landing de
// produção (/). O layout raiz já injeta Poppins (--font-sans); aqui só somamos as
// famílias de acento do comp e o fundo off-white do design (#FAFAF3).
export default function KvLayout({ children }: { children: React.ReactNode }) {
	return (
		<div
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} min-h-screen bg-[#FAFAF3] font-sans text-[#021628] antialiased`}
		>
			{children}
		</div>
	);
}
