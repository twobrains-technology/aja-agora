import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// @react-pdf/renderer (geração da proposta em PDF, server-side) é ESM-only e
	// carrega deps nativas/WASM (yoga-layout, fontkit). Deixar como externo evita
	// que o bundler (Turbopack/webpack) tente empacotá-lo e quebre no build.
	// OTel/Langfuse: mesmo motivo do PostgresSaver (checkpointer.ts) — o SDK usa
	// APIs de node que o Turbopack empacota mal; externo resolve.
	serverExternalPackages: [
		"@react-pdf/renderer",
		"@langfuse/otel",
		"@langfuse/tracing",
		"@opentelemetry/sdk-trace-node",
	],
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
