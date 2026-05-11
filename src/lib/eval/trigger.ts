// Fire-and-forget helper pra disparar avaliação a partir de marcos da conversa
// (handoff fechado, lead capturado por qualquer caminho). Erros não propagam —
// loga e segue. Use como `void triggerEvalScoring(...)`.

export async function triggerEvalScoring(conversationId: string, source: string): Promise<void> {
	try {
		const { scoreConversation } = await import("./scorer");
		const outcome = await scoreConversation(conversationId, { forceImmediate: true });
		if (outcome.skipped) {
			console.log(`[eval-trigger:${source}] skipped ${conversationId}: ${outcome.reason}`);
		} else if (outcome.success) {
			console.log(
				`[eval-trigger:${source}] scored ${conversationId} score=${outcome.overallScore.toFixed(2)}`,
			);
		} else {
			console.warn(
				`[eval-trigger:${source}] judge failed for ${conversationId} (eval=${outcome.evaluationId})`,
			);
		}
	} catch (err) {
		console.error(`[eval-trigger:${source}] failed for ${conversationId}:`, err);
	}
}
