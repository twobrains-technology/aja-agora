// FIX-110 — onError uniforme pra TODO createUIMessageStream do chat.
//
// Helper único usado por todos os streams do route (web SSE). Garante que um
// erro lançado dentro do `execute` feche o turno com um error part tipado e uma
// mensagem estável — em vez de cada path repetir a expressão inline (alguns
// paths nem tinham onError). Nunca devolve string vazia ao client (Error sem
// message cai no fallback), o que manteria a UI sem texto de erro pra mostrar.

export function streamErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return "Erro interno no servidor";
}
