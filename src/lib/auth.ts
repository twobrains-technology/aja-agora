import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** Origens aceitas no login. Em dev o mesmo app responde por vários nomes —
 * `https://aja-app-<worktree>.orb.local` (o host que o OrbStack cria a partir do
 * `container_name`), o nome legado sem `app-`, e `localhost:3000`. O Better Auth
 * compara a origem do request com a `baseURL`: qualquer divergência de host OU
 * de protocolo derruba o login com "Invalid origin", que foi exatamente o que
 * aconteceu (config em `http://aja-...`, browser em `https://aja-app-...`). */
function origensConfiaveis(): string[] {
	const nomes = [process.env.BETTER_AUTH_URL, process.env.APP_URL].filter(
		(u): u is string => Boolean(u?.trim()),
	);
	const workspace = process.env.WORKSPACE_NAME?.trim();
	if (workspace) {
		for (const host of [`aja-app-${workspace}.orb.local`, `aja-${workspace}.orb.local`]) {
			nomes.push(`https://${host}`, `http://${host}`);
		}
	}
	nomes.push("http://localhost:3000");
	return [...new Set(nomes.map((u) => u.replace(/\/$/, "")))];
}

export const auth = betterAuth({
	trustedOrigins: origensConfiaveis(),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	session: {
		expiresIn: 60 * 60 * 24, // 24 hours
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "viewer",
				input: false,
			},
		},
	},
	plugins: [nextCookies()],
});
