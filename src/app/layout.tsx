import type { Metadata } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const inter = Inter({
	variable: "--font-sans",
	subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
	variable: "--font-serif",
	subsets: ["latin"],
	weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Aja Agora | Consórcio inteligente com IA",
	description:
		"Diga o que você quer e receba uma recomendação personalizada de consórcio. Sem formulário, sem corretor, 100% digital.",
	keywords: [
		"consórcio",
		"consórcio digital",
		"consórcio IA",
		"consórcio online",
		"consórcio sem corretor",
		"simulação consórcio",
	],
	openGraph: {
		title: "Aja Agora | Consórcio sem juros, parcela que cabe no seu mês",
		description:
			"Diga o que você quer realizar e receba recomendações de consórcio com a parcela ideal pro seu mês. Sem juros, sem corretor, sem formulário.",
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
		<html lang="pt-BR" className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`} suppressHydrationWarning>
			<body className="min-h-full flex flex-col">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
