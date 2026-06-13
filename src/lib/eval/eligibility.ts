export const MIN_USER_TURNS = 4;
export const ACTIVE_IDLE_HOURS = 12;
export const HANDED_OFF_IDLE_HOURS = 48;

export type EligibilityInput = {
	status: "active" | "handed_off" | "closed";
	updatedAt: Date;
	userTurnCount: number;
};

export type EligibilityResult = {
	eligible: boolean;
	reason: string;
};

export type EligibilityOptions = {
	/** Pula a regra de inatividade (usado em triggers síncronos como closeHandoff e capture_lead). */
	forceImmediate?: boolean;
};

export function isEligibleForEval(
	input: EligibilityInput,
	now: Date = new Date(),
	options: EligibilityOptions = {},
): EligibilityResult {
	if (input.userTurnCount < MIN_USER_TURNS) {
		return {
			eligible: false,
			reason: `${input.userTurnCount} turnos do user (< ${MIN_USER_TURNS} requeridos)`,
		};
	}

	if (options.forceImmediate) {
		return { eligible: true, reason: "trigger síncrono (idle bypass)" };
	}

	const idleHours = (now.getTime() - input.updatedAt.getTime()) / (1000 * 60 * 60);

	if (input.status === "handed_off") {
		if (idleHours < HANDED_OFF_IDLE_HOURS) {
			return {
				eligible: false,
				reason: `handed_off com idle ${idleHours.toFixed(1)}h (< ${HANDED_OFF_IDLE_HOURS}h)`,
			};
		}
		return { eligible: true, reason: `handed_off + idle ${idleHours.toFixed(1)}h` };
	}

	// active or closed (closed segue mesmas regras de active)
	if (idleHours < ACTIVE_IDLE_HOURS) {
		return {
			eligible: false,
			reason: `${input.status} com idle ${idleHours.toFixed(1)}h (< ${ACTIVE_IDLE_HOURS}h)`,
		};
	}

	return { eligible: true, reason: `${input.status} + idle ${idleHours.toFixed(1)}h` };
}
