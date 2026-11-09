import { novoUuid } from "./uuid";

// Mantido por compatibilidade: delega ao helper único (sem Math.random).
export function generateId(): string {
	return novoUuid();
}

// Validador de UUID v1-v5. Usado por handlers de API antes de query em
// colunas com type UUID — Postgres retorna 22P02 (invalid input syntax)
// se passar string fora desse formato. Bug descoberto pelo QA DEV em
// Bv2-08 round 1: POST /api/chat com conversationId="test-qa-001"
// crashava 500. Fix: validar antes, retornar 400.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_REGEX.test(value);
}
