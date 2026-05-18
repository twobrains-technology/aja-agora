/**
 * In-memory pub/sub for the dev simulators.
 *
 * Two independent channels:
 *  - `sim:attendant:<phone>` — mirrors messages proxy.ts would send to a human
 *    attendant's WhatsApp, so /admin/simulator/attendant can display them
 *    without a second phone.
 *  - `sim:client:<waId>`     — mirrors what would go to a client over Meta when
 *    the conversation's waId is synthetic (SIM-<uuid>), so /admin/simulator/whatsapp
 *    can display them.
 *
 * Single-process only. Dev tool — no persistence.
 *
 * The EventEmitter is stored on `globalThis` so HMR doesn't create a separate
 * instance each time this module is re-evaluated — without this, publishers
 * (re-imported on file save) end up emitting on a different bus than the
 * subscribers (already-open SSE connections), and `listeners=0`.
 */
import { EventEmitter } from "node:events";

export interface SimulatorMessage {
	id: string;
	text: string;
	createdAt: string;
	/** True when origem é conversa simulada — atendente vê badge 🧪 SIMULAÇÃO. */
	simulated?: boolean;
}

/** Variantes de evento que publishToClient aceita (sem id/createdAt — gerados aqui). */
export type SimulatorClientEventInput =
	| { type: "text"; text: string }
	| { type: "interactive"; interactive: Record<string, unknown> }
	| { type: "typing"; on: boolean };

/** Evento entregue ao subscriber (input + id + createdAt). */
export type SimulatorClientEvent = SimulatorClientEventInput & {
	id: string;
	createdAt: string;
};

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

// ─── Attendant channel (já existente) ──────────────────────────────────────

export function publishToAttendant(
	phone: string,
	text: string,
	options: { simulated?: boolean } = {},
): void {
	const event = `sim:attendant:${phone}`;
	const listenerCount = bus.listenerCount(event);
	const message: SimulatorMessage = {
		id: crypto.randomUUID(),
		text,
		createdAt: new Date().toISOString(),
		simulated: options.simulated,
	};
	console.log(
		`[simulator-bus] publish attendant phone=${phone} listeners=${listenerCount} simulated=${options.simulated ?? false} text="${text.slice(0, 60)}"`,
	);
	bus.emit(event, message);
}

export function subscribeToAttendant(
	phone: string,
	callback: (message: SimulatorMessage) => void,
): () => void {
	const event = `sim:attendant:${phone}`;
	bus.on(event, callback);
	console.log(
		`[simulator-bus] subscribe attendant phone=${phone} totalListeners=${bus.listenerCount(event)}`,
	);
	return () => {
		bus.off(event, callback);
		console.log(
			`[simulator-bus] unsubscribe attendant phone=${phone} remainingListeners=${bus.listenerCount(event)}`,
		);
	};
}

// ─── Client channel (novo — pra simulador WhatsApp do cliente) ────────────

export function publishToClient(waId: string, event: SimulatorClientEventInput): void {
	const channel = `sim:client:${waId}`;
	const listenerCount = bus.listenerCount(channel);
	const payload: SimulatorClientEvent = {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		...event,
	};
	const preview =
		payload.type === "text"
			? `text="${payload.text.slice(0, 60)}"`
			: payload.type === "typing"
				? `typing=${payload.on}`
				: "interactive";
	console.log(`[simulator-bus] publish client waId=${waId} listeners=${listenerCount} ${preview}`);
	bus.emit(channel, payload);
}

export function subscribeToClient(
	waId: string,
	callback: (event: SimulatorClientEvent) => void,
): () => void {
	const channel = `sim:client:${waId}`;
	bus.on(channel, callback);
	console.log(
		`[simulator-bus] subscribe client waId=${waId} totalListeners=${bus.listenerCount(channel)}`,
	);
	return () => {
		bus.off(channel, callback);
		console.log(
			`[simulator-bus] unsubscribe client waId=${waId} remainingListeners=${bus.listenerCount(channel)}`,
		);
	};
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * waId começa com `SIM-` quando a conversa foi criada pelo simulador do backoffice.
 * Single source of truth pra detectar destinatário simulado em qualquer ponto do código.
 */
export function isSimulatedWaId(waId: string | null | undefined): boolean {
	return typeof waId === "string" && waId.startsWith("SIM-");
}
