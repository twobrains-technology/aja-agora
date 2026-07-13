// chat-client.mjs — cliente SSE do /api/chat do aja-agora (Node ESM, sem deps).
//
// Fato de arquitetura (confirmado lendo src/app/api/chat/route.ts):
//   A route lê SÓ a última mensagem `user` do payload (lastUserText). O histórico
//   da conversa é SERVER-SIDE, keyed por conversationId (saveMessage/
//   loadConversationHistory). Logo o cliente é STATELESS por turno — basta reusar
//   o MESMO conversationId em todos os turnos; NÃO reenviamos o histórico.
//
// Um turno é:
//   { text: "..." }                      -> mensagem de texto livre
//   { action: {kind:...}, label: "..." } -> clique de botão/gate (body.action + label)
//
// Retorno de sendTurn:
//   { userMsg, agentText, artifacts:[{type,data}], error, httpStatus, elapsedMs, rawEvents }

export const DEFAULT_BASE_URL =
	process.env.AJA_BASE_URL || "http://aja-app-develop.orb.local";

/** Descreve o "userMsg" legível de um turno (o que o usuário mandou). */
function describeUserMsg(turn) {
	if (turn.text != null) return String(turn.text);
	if (turn.action) {
		const label = turn.label ?? turn.action.label ?? "";
		return label ? `[ação ${turn.action.kind}] ${label}` : `[ação ${turn.action.kind}]`;
	}
	return "";
}

/** Monta o body do POST /api/chat pro turno. */
function buildBody(conversationId, turn) {
	if (turn.action) {
		const label = turn.label ?? turn.action.label ?? turn.action.kind;
		return {
			conversationId,
			action: turn.action,
			// A route persiste o label do botão via lastUserText(body.messages).
			messages: [
				{ role: "user", id: crypto.randomUUID(), parts: [{ type: "text", text: label }] },
			],
		};
	}
	return {
		conversationId,
		messages: [
			{ role: "user", id: crypto.randomUUID(), parts: [{ type: "text", text: String(turn.text ?? "") }] },
		],
	};
}

/** Classifica um evento SSE `data-*` num rótulo de tipo útil pro dossiê. */
function artifactTypeOf(obj) {
	if (obj.type === "data-artifact") return obj.data?.type ?? "artifact";
	if (obj.type === "data-gate") return `gate:${obj.data?.gate ?? obj.data?.kind ?? "?"}`;
	if (obj.type === "data-transition") return `transition:${obj.data?.toCategory ?? "?"}`;
	if (obj.type === "data-welcome") return "welcome";
	if (obj.type === "data-handoff") return "handoff";
	if (obj.type === "data-tool") return `tool:${obj.data?.tool ?? "?"}`;
	return obj.type; // qualquer data-* futuro
}

/**
 * Envia UM turno e coleta a resposta SSE inteira.
 * @param {string} baseUrl
 * @param {string} conversationId
 * @param {{text?:string, action?:object, label?:string}} turn
 * @param {{timeoutMs?:number}} [opts]
 */
export async function sendTurn(baseUrl, conversationId, turn, opts = {}) {
	const timeoutMs = opts.timeoutMs ?? 90_000;
	const userMsg = describeUserMsg(turn);
	const body = buildBody(conversationId, turn);
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	const started = Date.now();

	const result = {
		userMsg,
		agentText: "",
		artifacts: [],
		error: null,
		httpStatus: null,
		elapsedMs: 0,
		rawEvents: [],
	};

	try {
		const res = await fetch(`${baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: ctrl.signal,
		});
		result.httpStatus = res.status;
		result.conversationId = res.headers.get("x-conversation-id") ?? conversationId;

		if (!res.ok || !res.body) {
			const txt = await res.text().catch(() => "");
			result.error = `HTTP ${res.status}${txt ? `: ${txt.slice(0, 300)}` : ""}`;
			return result;
		}

		const decoder = new TextDecoder();
		let buffer = "";
		const reader = res.body.getReader();
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let nl;
			// eslint-disable-next-line no-cond-assign
			while ((nl = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, nl);
				buffer = buffer.slice(nl + 1);
				const trimmed = line.trimEnd();
				if (!trimmed.startsWith("data:")) continue;
				const payload = trimmed.slice(5).trim();
				if (payload === "[DONE]") {
					buffer = "";
					break;
				}
				let obj;
				try {
					obj = JSON.parse(payload);
				} catch {
					continue;
				}
				if (!obj || typeof obj.type !== "string") continue;
				result.rawEvents.push(obj.type);
				if (obj.type === "text-delta") {
					if (typeof obj.delta === "string") result.agentText += obj.delta;
				} else if (obj.type.startsWith("data-")) {
					result.artifacts.push({ type: artifactTypeOf(obj), data: obj.data ?? null });
				}
			}
		}
	} catch (err) {
		result.error =
			err?.name === "AbortError"
				? `timeout apos ${timeoutMs}ms`
				: `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`;
	} finally {
		clearTimeout(timer);
		result.elapsedMs = Date.now() - started;
	}
	return result;
}
