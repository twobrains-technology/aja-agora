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
};

export default nextConfig;
