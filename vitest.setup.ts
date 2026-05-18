import { loadEnvFile } from "node:process";

// Ordem importa: loadEnvFile NÃO sobrescreve vars já setadas.
// Carrega prioridade mais alta PRIMEIRO (local-dev/test) e .env como baseline.
// Integration tests dependem de DATABASE_URL e LETTA_BASE_URL do .env.local
// (workspace OrbStack aponta Postgres em 5434; .env legacy aponta 5433).
try {
	loadEnvFile(".env.local");
} catch {
	// .env.local opcional (CI/produção usam env nativo)
}
try {
	loadEnvFile(".env.test");
} catch {
	// .env.test opcional (override explícito de teste)
}
try {
	loadEnvFile(".env");
} catch {
	// .env opcional (baseline; só preenche o que ainda não foi setado)
}

// Sentinel DATABASE_URL pra módulos que importam @/db em testes que não tocam DB.
// Em testes que de fato consultam DB, override no próprio test ou via .env real.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test_sentinel";
}
