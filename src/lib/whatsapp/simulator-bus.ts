/**
 * In-memory pub/sub for the dev attendant simulator.
 * Mirrors messages that proxy.ts sends to attendants over WhatsApp so they
 * can be displayed in /admin/simulator without needing a second phone.
 *
 * Single-process only. Dev tool — no persistence.
 *
 * The EventEmitter is stored on `globalThis` so HMR doesn't create a separate
 * instance each time `proxy.ts` is re-evaluated — without this, publishers
 * (re-imported on file save) end up emitting on a different bus than the
 * subscribers (already-open SSE connections), and `listeners=0`.
 */
import { EventEmitter } from "node:events";

export interface SimulatorMessage {
	id: string;
	text: string;
	createdAt: string;
}

const globalForBus = globalThis as unknown as { __simulatorBus?: EventEmitter };
const bus =
	globalForBus.__simulatorBus ??
	(() => {
		const e = new EventEmitter();
		e.setMaxListeners(1000);
		return e;
	})();
if (!globalForBus.__simulatorBus) {
	globalForBus.__simulatorBus = bus;
}

export function publishToAttendant(phone: string, text: string): void {
	const event = `sim:${phone}`;
	const listenerCount = bus.listenerCount(event);
	const message: SimulatorMessage = {
		id: crypto.randomUUID(),
		text,
		createdAt: new Date().toISOString(),
	};
	console.log(
		`[simulator-bus] publish phone=${phone} listeners=${listenerCount} text="${text.slice(0, 60)}"`,
	);
	bus.emit(event, message);
}

export function subscribeToAttendant(
	phone: string,
	callback: (message: SimulatorMessage) => void,
): () => void {
	const event = `sim:${phone}`;
	bus.on(event, callback);
	console.log(
		`[simulator-bus] subscribe phone=${phone} totalListeners=${bus.listenerCount(event)}`,
	);
	return () => {
		bus.off(event, callback);
		console.log(
			`[simulator-bus] unsubscribe phone=${phone} remainingListeners=${bus.listenerCount(event)}`,
		);
	};
}
