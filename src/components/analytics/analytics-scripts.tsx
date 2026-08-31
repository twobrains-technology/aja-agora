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
//
// ── DUAS ESTRATÉGIAS, E A DIFERENÇA É DE NEGÓCIO (30/08/2026) ───────────────
//
// Lighthouse mobile contra produção (Chrome headless em container, não aba em
// segundo plano): **score 29, LCP 7,7 s, FCP 7,7 s, TBT 2.890 ms**. FCP e LCP
// iguais significam que NADA pinta até 7,7 s — não é a imagem do hero, é o
// JavaScript. Dos 1.094 KB de script da home, **510 KB são estas quatro tags**,
// e elas consomem 1.878 ms de execução na main thread:
//
//   gtag/GA4 .... 171 KB · 829 ms      GTM ......... 114 KB · 191 ms
//   fbevents .... 105 KB · 442 ms      fb signals .. 120 KB · 416 ms
//
// Isso casa com o Connect Rate de 94% da planilha: 6 de cada 100 cliques pagos
// não viram sessão, o que em 2.473 cliques/mês são ~149 pessoas pagas que
// esperam oito segundos de tela branca e voltam.
//
// **GTM e GA4 vão para `lazyOnload`; o Meta Pixel FICA em `afterInteractive`.**
// A divisão não é técnica, é de consequência:
//
//   • o Pixel alimenta a mídia paga. É dele que saem `PageView` e
//     `ChatIniciado`, é ele que a Conversions API deduplica (`meta-pixel.ts`) e
//     é a partir dele que a verba é decidida. Atrasá-lo trocaria performance
//     por sinal de otimização — o oposto do que esta campanha quer;
//   • GTM e GA4 são analytics de leitura. Chegar meio segundo depois custa, no
//     pior caso, o pageview de quem sai antes do `load` — as mesmas pessoas
//     que hoje já são perdidas INTEIRAS nos oito segundos de espera.
//
// O que sobra depois disto (584 KB de JS próprio, 314 KB de fonte, TBT ainda
// alto) é bloco de performance com orçamento e medição antes/depois — não cabia
// numa campanha de conversão, e está registrado no dossiê de 30/08.
//
// ⚠️ EFEITO COLATERAL QUE PRECISA SER AVISADO ANTES DO DEPLOY.
//
// `lazyOnload` dispara no `window.load` — e quem sai aos oito segundos NUNCA o
// alcança. Ou seja: **as sessões do GA4 vão cair**, e a queda é de medição, não
// de tráfego. Sem avisar, a agência lê isso como público sumindo bem no meio da
// avaliação da campanha, e a conclusão errada é fácil de tirar.
//
// E há uma pergunta que só a agência responde: se houver tag de CONVERSÃO
// dentro do container do GTM, ela passa a não disparar em bounce. Isso é
// decisão do Gustavo antes do deploy, não descoberta depois — está no passo a
// passo do dossiê.
//
// O Meta Pixel não entra nessa conta, e é por isso que ele ficou onde estava.

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
			{/* `lazyOnload`: sobe depois do `load`, fora do caminho crítico. */}
			<Script id="gtm" strategy="lazyOnload">
				{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
			</Script>
			<Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="lazyOnload" />
			<Script id="ga4" strategy="lazyOnload">
				{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}');`}
			</Script>
			{/* O PIXEL NÃO SE MEXE. Ver o cabeçalho: é ele que decide a verba. */}
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
