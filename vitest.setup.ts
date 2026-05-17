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

// Sentinel DATABASE_URL pra módulos que importam @/db em testes que não tocam DB.
// Em testes que de fato consultam DB, override no próprio test ou via .env real.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test_sentinel";
}
