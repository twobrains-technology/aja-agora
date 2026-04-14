/**
 * In-memory pub/sub for real-time message delivery.
 * Used to bridge WhatsApp vendor replies → SSE → web user.
 *
 * Single-process only (Docker/VPS deployment).
 * For multi-process, swap for Redis pub/sub or Postgres LISTEN/NOTIFY.
 */
import { EventEmitter } from "node:events";

export interface BusMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	agentName?: string;
	createdAt: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(1000); // support many concurrent SSE connections

/**
 * Publish a new message to a conversation's subscribers.
 */
export function publishMessage(conversationId: string, message: BusMessage): void {
	bus.emit(`msg:${conversationId}`, message);
}

/**
 * Subscribe to new messages for a conversation.
 * Returns an unsubscribe function.
 */
export function subscribeMessages(
	conversationId: string,
	callback: (message: BusMessage) => void,
): () => void {
	const event = `msg:${conversationId}`;
	bus.on(event, callback);
	return () => bus.off(event, callback);
}
