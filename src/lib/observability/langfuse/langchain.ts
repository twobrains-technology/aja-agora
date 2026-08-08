// CallbackHandler do LangChain por TURNO (nunca global — handler global
// vazaria contexto entre turnos concorrentes). Os atributos do trace
// (sessionId/userId/tags) já vêm do withLangfuseTurn via updateActiveTrace;
// o handler só liga as generations/chains do LangChain no trace ativo.
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { CallbackHandler } from "@langfuse/langchain";
import { isLangfuseConfigured } from "./env";

export function makeLangfuseCallbackHandler(): BaseCallbackHandler | undefined {
	if (!isLangfuseConfigured()) return undefined;
	try {
		return new CallbackHandler() as unknown as BaseCallbackHandler;
	} catch (err) {
		console.error("[langfuse] CallbackHandler falhou — turno segue sem spans LangChain:", err);
		return undefined;
	}
}
