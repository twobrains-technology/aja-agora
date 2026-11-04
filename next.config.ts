import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// @react-pdf/renderer (geração da proposta em PDF, server-side) é ESM-only e
	// carrega deps nativas/WASM (yoga-layout, fontkit). Deixar como externo evita
	// que o bundler (Turbopack/webpack) tente empacotá-lo e quebre no build.
	// O PI entra aqui pelo mesmo motivo: o pacote do harness é ESM-only, lê o
	// disco (models.json/auth.json) e arrasta `quickjs-wasi` (do codemode) — que
	// carrega um `.wasm` com imports `wasi_snapshot_preview1`. Empacotado, o
	// webpack tenta resolver esses imports e o build morre com "Module not
	// found: wasi_snapshot_preview1" (medido em 19/10/2026). Externo, ele é
	// `require` em runtime e o ESM é resolvido pelo Node do container.
	// As SKILL.md do vendedor são lidas do disco em runtime (`pi/skills`). Sem
	// esta linha elas não entram na imagem standalone e o vendedor perde o
	// conhecimento da Bevi EM SILÊNCIO — o turno funciona e responde pior.
	outputFileTracingIncludes: {
		"/api/**": ["src/lib/agent/pi/skills/**/*.md"],
		"/**": ["src/lib/agent/pi/skills/**/*.md"],
	},
	serverExternalPackages: [
		"@react-pdf/renderer",
		"@earendil-works/pi-coding-agent",
		"@earendil-works/pi-agent-core",
		"@earendil-works/pi-ai",
		"@earendil-works/pi-codemode",
		"quickjs-wasi",
	],
	// O plugin de observabilidade do Pi (D-0014) é carregado por CAMINHO, pelo jiti do
	// próprio Pi (`additionalExtensionPaths` — ver `src/lib/agent/pi/langfuse.ts`), e não
	// por `import()`. Duas consequências que já custaram um build vermelho em 27/10/2026:
	//  · ele NÃO entra em `serverExternalPackages` nem em bundling: o pacote publicado é
	//    TypeScript cru, sem `main`/`exports`; transpilado aqui, o `tsc` seguiria o fonte
	//    dele e o `next build` morreria em "Failed to type check" (o defeito #54 do plugin,
	//    `event.prompt` na variante `custom` de `before_agent_start`);
	//  · mas ele PRECISA existir em `node_modules` no runtime, e o file tracer do Next não
	//    o enxerga (não há import estático; `outputFileTracingIncludes` com glob de
	//    `node_modules` também não resolveu — medido no dev). Quem o leva para a imagem é
	//    um COPY explícito no `Dockerfile`.
	allowedDevOrigins: [
		"aja-agora.twobrainstechnology.com",
		// HMR via DNS local OrbStack (padrão dev-stack DNS-first).
		"*.orb.local",
		"aja-*.orb.local",
	],
	images: {
		// Next 16 só aceita os `quality` que estiverem nesta lista — o default é
		// [75], e um `quality={100}` fora dela não dá erro: o componente cai
		// calado para 75 no srcset. Era o que acontecia com a colagem da hero
		// (kv-hero.tsx), arte com texto fino nos balões, servida em WebP 75.
		qualities: [75, 100],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "cdn.shadcnstudio.com",
			},
		],
	},
	// A rota /chat foi removida — o chat vive só no modal (teatro) da home.
	// Redirect 308 preserva bookmarks/links antigos sem dar 404.
	async redirects() {
		return [
			{
				source: "/chat",
				destination: "/",
				permanent: true,
			},
		];
	},
};

export default nextConfig;
