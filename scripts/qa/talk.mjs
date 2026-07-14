#!/usr/bin/env node
// Fala UM turno com o agente e imprime a resposta em texto limpo.
// Uso:  node scripts/qa/talk.mjs <conversationId> "<mensagem do usuário>"
//
// Existe pra que o COLETOR (Haiku) não precise montar curl/parsear SSE na mão —
// ele só manda a frase e lê a resposta. Determinístico, sem LLM aqui dentro.
// Imprime também os CARDS emitidos e o gate, que é evidência que o juiz precisa.

const BASE = process.env.AJA_BASE_URL ?? "http://aja-refactor-desamarra-agente.orb.local";
const [, , conversationId, text] = process.argv;

if (!conversationId || !text) {
	console.error('uso: node scripts/qa/talk.mjs <conversationId> "<mensagem>"');
	process.exit(2);
}

const res = await fetch(`${BASE}/api/chat`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({
		conversationId,
		messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }],
	}),
	signal: AbortSignal.timeout(180_000),
});

if (!res.ok) {
	console.error(`HTTP ${res.status}`);
	process.exit(1);
}

const raw = await res.text();
// Um "balão" = um bloco de texto (text-start → deltas → text-end). Agrupamos por
// id e separamos os balões com linha em branco — do contrário os deltas de blocos
// diferentes chegam colados ("Madalena.Qual carro...") e o juiz reportaria um bug
// de formatação que é artefato do coletor, não do produto.
const baloes = new Map();
const ordem = [];
const cards = [];
let gate = null;

for (const linha of raw.split("\n")) {
	if (!linha.startsWith("data: ")) continue;
	let ev;
	try {
		ev = JSON.parse(linha.slice(6));
	} catch {
		continue;
	}
	if (ev.type === "text-delta" && ev.delta) {
		const id = ev.id ?? "_";
		if (!baloes.has(id)) {
			baloes.set(id, "");
			ordem.push(id);
		}
		baloes.set(id, baloes.get(id) + ev.delta);
	}
	if (ev.type === "data-transition" && ev.data?.bridgeText) {
		const id = `_sys_${ordem.length}`;
		baloes.set(id, `[sistema] ${ev.data.bridgeText}`);
		ordem.push(id);
	}
	if (ev.type === "data-artifact" && ev.data?.type) cards.push(ev.data.type);
	if (ev.type === "data-gate" && ev.data?.gate) gate = ev.data.gate;
}

const texto = ordem
	.map((id) => (baloes.get(id) ?? "").trim())
	.filter(Boolean)
	.join("\n\n")
	.trim();
console.log("=== AGENTE ===");
console.log(texto || "(sem texto)");
if (cards.length) console.log(`\n=== CARDS === ${cards.join(", ")}`);
if (gate) console.log(`=== GATE === ${gate}`);
