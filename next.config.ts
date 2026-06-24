import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	allowedDevOrigins: [
		"aja-agora.twobrainstechnology.com",
		// HMR via DNS local OrbStack (padrão dev-stack DNS-first).
		"*.orb.local",
		"aja-*.orb.local",
	],
	images: {
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
