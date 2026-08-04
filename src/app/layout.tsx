import type { Metadata } from "next";
import { DM_Mono, Poppins } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { merriweather } from "@/components/kv/fonts";
import "./globals.css";

// Tags do time de anúncio (IDs públicos, não são segredo).
const GTM_ID = "GTM-KZXWKBZ3";
const GA4_ID = "G-SD0XH0VHED";
// Meta Pixel — por env var porque o ID muda por ambiente e ainda não existe em
// dev. Sem a variável, nada é renderizado: melhor não ter pixel do que ter um
// pixel apontando pra conta de anúncio errada. A atribuição do nosso lado não
// depende dele (é gravada server-side em `visits`); o pixel serve pra Meta
// otimizar entrega e montar público.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

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
	title: "Aja Agora | Compare consórcios entre diversas administradoras",
	description:
		"Parceria independente de consórcio. Compare administradoras num único lugar e receba uma recomendação personalizada, sem juros, sem formulário e sem corretor.",
	keywords: [
		"consórcio",
		"comparar consórcio",
		"comparação de consórcio",
		"consórcio digital",
		"consórcio sem juros",
		"consórcio online",
		"consórcio sem corretor",
		"simulação consórcio",
	],
	openGraph: {
		title: "Aja Agora | Compare consórcios entre diversas administradoras",
		description:
			"Comparar tudo sozinho leva tempo e aumenta a chance de uma escolha ruim. A Aja reúne as administradoras num único lugar para facilitar sua decisão.",
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
			className={`${poppins.variable} ${dmMono.variable} ${merriweather.variable} h-full antialiased`}
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
				{META_PIXEL_ID && (
					<Script id="meta-pixel" strategy="afterInteractive">
						{`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
					</Script>
				)}
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
					{META_PIXEL_ID && (
						// biome-ignore lint/performance/noImgElement: pixel de rastreio 1x1 — next/image aqui quebraria o propósito
						<img
							height="1"
							width="1"
							style={{ display: "none" }}
							alt=""
							src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
						/>
					)}
				</noscript>
				{/* App é light-only — tema escuro removido a pedido do produto. */}
				<ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
