"use client";

// As tags de anúncio (GTM, GA4, Meta Pixel), com uma trava: NUNCA dentro de um
// iframe.
//
// O painel embute a própria landing para desenhar o mapa de calor por cima dela
// (`visor-do-mapa.tsx`). Sem esta trava, cada abertura daquela tela carregava um
// SEGUNDO GTM dentro do iframe e contava um pageview da landing — medido em
// 18/08/2026: 2 scripts do googletagmanager, `dataLayer` populado e `gtag` vivo
// lá dentro. Em produção o Meta Pixel iria junto, e aí não é só relatório sujo:
// é sinal falso alimentando o algoritmo que decide para quem mostrar o anúncio.
//
// A trava é aqui, e não no componente do visor, porque protege qualquer embed —
// inclusive um que alguém venha a criar amanhã sem lembrar deste detalhe.
//
// Cliente e não servidor de propósito: ler o request no layout tornaria a
// landing inteira dinâmica, trocando um defeito de medição por um custo de
// performance na página que mais importa.

import Script from "next/script";

const GTM_ID = "GTM-KZXWKBZ3";
const GA4_ID = "G-SD0XH0VHED";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/** `false` durante o SSR (não há janela) e dentro de qualquer iframe. */
function ehJanelaDeTopo(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.self === window.top;
	} catch {
		// Cross-origin lança ao ler `window.top` — se lançou, é iframe.
		return false;
	}
}

export function AnalyticsScripts() {
	if (!ehJanelaDeTopo()) return null;

	return (
		<>
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
		</>
	);
}
