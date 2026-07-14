import type { Metadata } from "next";
import { DM_Mono, Poppins } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import "./globals.css";

// Tags do time de anúncio (IDs públicos, não são segredo).
const GTM_ID = "GTM-KZXWKBZ3";
const GA4_ID = "G-SD0XH0VHED";

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
			<head>
				<Script id="gtm" strategy="afterInteractive">
					{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
				</Script>
				<Script
					src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
					strategy="afterInteractive"
				/>
				<Script id="ga4" strategy="afterInteractive">
					{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}');`}
				</Script>
			</head>
			<body className="min-h-full flex flex-col">
				<noscript>
					<iframe
						src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
						height="0"
						width="0"
						style={{ display: "none", visibility: "hidden" }}
						title="Google Tag Manager"
					/>
				</noscript>
				{/* App é light-only — tema escuro removido a pedido do produto. */}
				<ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
