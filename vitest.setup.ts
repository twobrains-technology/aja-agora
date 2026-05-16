import { loadEnvFile } from "node:process";

// Carrega .env quando presente, sem falhar quando ausente (CI usa env nativo).
try {
	loadEnvFile(".env");
} catch {
	// .env opcional
}
