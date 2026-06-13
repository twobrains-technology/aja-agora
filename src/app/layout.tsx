import type { Metadata } from "next";
import { DM_Mono, Poppins } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const poppins = Poppins({
	variable: "--font-sans",
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
});

export const metadata: Metadata = {
	title: "Aja Agora | Seu consórcio, resolvido numa conversa",
	description:
		"Consultoria de consórcio independente. Diga o que você quer conquistar e receba uma recomendação personalizada, sem juros, sem formulário e sem corretor.",
	keywords: [
		"consórcio",
		"consórcio digital",
		"consórcio sem juros",
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
		<html
			lang="pt-BR"
			className={`${poppins.variable} ${dmMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col">
				{/* App é light-only — tema escuro removido a pedido do produto. */}
				<ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
