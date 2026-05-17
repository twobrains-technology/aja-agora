import { loadEnvFile } from "node:process";

// Carrega .env quando presente, sem falhar quando ausente (CI usa env nativo).
// Convenção Next.js: .env.local sobrepõe .env (carregado depois).
// Integration tests dependem de DATABASE_URL e LETTA_BASE_URL do .env.local.
try {
	loadEnvFile(".env");
} catch {
	// .env opcional
}
try {
	loadEnvFile(".env.local");
} catch {
	// .env.local opcional (CI/produção usam env nativo)
}
