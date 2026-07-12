#!/usr/bin/env node
// send-turn.mjs — envia UM turno ao /api/chat e imprime o dossiê do turno (JSON).
//
// Uso:
//   node send-turn.mjs <conversationId> '<mensagem de texto>'
//   node send-turn.mjs <conversationId> '{"kind":"category","category":"imovel"}' [label]
//
// A 2ª arg: se for JSON com campo `kind`, vira body.action (clique de botão/gate);
// senão é tratada como texto livre. O conversationId é responsabilidade do chamador
// (o histórico é server-side; reuse o mesmo id entre turnos da mesma conversa).
//
// Base URL: env AJA_BASE_URL (default http://aja-app-develop.orb.local).

import { DEFAULT_BASE_URL, sendTurn } from "./chat-client.mjs";

const [, , conversationId, message, labelArg] = process.argv;

if (!conversationId || message == null) {
	console.error("uso: node send-turn.mjs <conversationId> '<mensagem ou JSON de acao>' [label]");
	process.exit(2);
}

function parseTurn(msg, label) {
	const t = msg.trim();
	if (t.startsWith("{") || t.startsWith("[")) {
		try {
			const parsed = JSON.parse(t);
			if (parsed && typeof parsed === "object" && typeof parsed.kind === "string") {
				return { action: parsed, label: label ?? parsed.label };
			}
		} catch {
			/* não é JSON de ação — cai pra texto */
		}
	}
	return { text: msg };
}

const turn = parseTurn(message, labelArg);
const out = await sendTurn(DEFAULT_BASE_URL, conversationId, turn);
console.log(
	JSON.stringify(
		{
			userMsg: out.userMsg,
			agentText: out.agentText,
			artifacts: out.artifacts,
			error: out.error,
			httpStatus: out.httpStatus,
			elapsedMs: out.elapsedMs,
		},
		null,
		2,
	),
);
