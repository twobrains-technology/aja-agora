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
		<html lang="pt-BR" className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`} suppressHydrationWarning>
			<body className="min-h-full flex flex-col">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
