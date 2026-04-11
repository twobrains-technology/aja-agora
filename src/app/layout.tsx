import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Aja Agora | Consorcio inteligente com IA",
	description:
		"Diga o que voce quer e receba uma recomendacao personalizada de consorcio. Sem formulario, sem corretor, 100% digital.",
	keywords: [
		"consorcio",
		"consorcio digital",
		"consorcio IA",
		"consorcio online",
		"consorcio sem corretor",
		"simulacao consorcio",
	],
	openGraph: {
		title: "Aja Agora | Consorcio inteligente com IA",
		description:
			"Seu consultor de consorcio com inteligencia artificial. Recomendacoes personalizadas em segundos.",
		type: "website",
		locale: "pt_BR",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
			<body className="min-h-full flex flex-col">{children}</body>
		</html>
	);
}
