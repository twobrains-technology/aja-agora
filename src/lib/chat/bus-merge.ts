import type { AjaUIMessage } from "./ui-message";

/**
 * Dedupe por id ao mesclar uma mensagem vinda do bus (SSE) no estado local do
 * chat. FIX-31: a bolha do usuário duplicava porque o eco do branch handed_off
 * publicava com um id novo (`crypto.randomUUID()`) que nunca casava com o id
 * otimista do useChat. Com o id original preservado no eco (ver route.ts), este
 * merge passa a reconhecer a própria mensagem e não a re-appenda. Para mensagens
 * de outra aba / do consultor (id ainda não visto) o append acontece normalmente.
 */
export function appendBusMessage(prev: AjaUIMessage[], incoming: AjaUIMessage): AjaUIMessage[] {
	if (prev.some((p) => p.id === incoming.id)) return prev;
	return [...prev, incoming];
}
