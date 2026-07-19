// Fontes de acento da landing (design "Key Visual", a partir do Figma).
// Poppins (principal) já é carregada no layout raiz como --font-sans.
// Merriweather = serif de ÊNFASE dos títulos (palavra-chave em itálico bold/black),
// títulos de card, citações e headline do CTA. Lato = balões de chat do hero.
// Manrope = tags/labels da contemplação. (Fraunces foi removido: no comp todos os
// glifos daquele nó são override p/ Poppins+Merriweather, então nunca renderiza.)
import { Lato, Manrope, Merriweather } from "next/font/google";

export const merriweather = Merriweather({
	subsets: ["latin"],
	variable: "--font-merriweather",
	display: "swap",
	weight: ["300", "400", "700", "900"],
	style: ["normal", "italic"],
});

export const lato = Lato({
	subsets: ["latin"],
	variable: "--font-lato",
	display: "swap",
	weight: ["400", "700"],
});

export const manrope = Manrope({
	subsets: ["latin"],
	variable: "--font-manrope",
	display: "swap",
});
