import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: drizzle-kit requires DATABASE_URL at CLI runtime
		url: process.env.DATABASE_URL!,
	},
});
