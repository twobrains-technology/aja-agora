import { loadEnvFile } from "node:process";

// Carrega .env quando presente, sem falhar quando ausente (CI usa env nativo).
try {
	loadEnvFile(".env");
} catch {
	// .env opcional
}

// Sentinel DATABASE_URL pra módulos que importam @/db em testes que não tocam DB.
// Em testes que de fato consultam DB, override no próprio test ou via .env real.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test_sentinel";
}
