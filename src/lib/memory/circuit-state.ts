// src/lib/memory/circuit-state.ts
//
// Estado compartilhado do circuit breaker do Letta. Separado pra evitar
// dependência circular entre `index.ts` (factory) e `letta-adapter.ts`
// (que precisa reportar success/failure).
//
// Comportamento (endurecimento do R13 do QA plan):
// - 2 falhas consecutivas em janela curta abrem o circuito SÍNCRONAMENTE.
// - Após `_circuitOpenUntil`, o factory permite 1 tentativa de probe
//   (half-open). Sucesso fecha o circuito; falha reabre por mais 60s.
// - Sucesso reseta o contador de falhas.

const FAILURE_THRESHOLD = 2;
const OPEN_DURATION_MS = 60_000;

let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

export function isLettaCircuitOpen(): boolean {
	if (_circuitOpenUntil === 0) return false;
	if (Date.now() >= _circuitOpenUntil) {
		// Half-open: permitir uma tentativa. O resultado dela vai chamar
		// markLettaSuccess ou markLettaFailure.
		return false;
	}
	return true;
}

export function markLettaFailure(reason?: string): void {
	_consecutiveFailures += 1;
	if (_consecutiveFailures >= FAILURE_THRESHOLD && _circuitOpenUntil < Date.now()) {
		_circuitOpenUntil = Date.now() + OPEN_DURATION_MS;
		console.warn(
			`[memory] circuit OPEN (failures=${_consecutiveFailures}, reopens in ${OPEN_DURATION_MS}ms)${
				reason ? `, reason="${reason}"` : ""
			}`,
		);
	}
}

export function markLettaSuccess(): void {
	if (_circuitOpenUntil > 0 || _consecutiveFailures > 0) {
		_consecutiveFailures = 0;
		_circuitOpenUntil = 0;
	}
}

/** Reset — usado pelos testes pra isolar estado entre suites. */
export function resetLettaCircuit(): void {
	_consecutiveFailures = 0;
	_circuitOpenUntil = 0;
}

export function getLettaCircuitState(): {
	open: boolean;
	consecutiveFailures: number;
	openUntilMs: number;
} {
	return {
		open: isLettaCircuitOpen(),
		consecutiveFailures: _consecutiveFailures,
		openUntilMs: _circuitOpenUntil,
	};
}
