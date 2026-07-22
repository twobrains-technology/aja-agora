// biome-ignore-all lint/suspicious/noExplicitAny: sonda descartável de investigação (roda solta com tsx, não entra no build). Versionada por engano — pode ser apagada.
(async () => {
	const { db } = await import("@/db");
	const { conversations } = await import("@/db/schema");
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web" } as any)
		.returning();
	const { runTurnLangGraph } = await import("@/lib/agent/langgraph/run-turn");
	const tipos: string[] = [];
	try {
		for await (const ev of runTurnLangGraph({
			channel: "web",
			conversationId: conv.id,
			userText: "quero comprar um carro",
			isUserTurn: true,
			contactName: null,
		} as any)) {
			const e: any = ev;
			tipos.push(
				e.type + (e.gate ? `(${e.gate})` : "") + (e.artifactType ? `(${e.artifactType})` : ""),
			);
		}
	} catch (e: any) {
		console.log("ERRO:", e?.message?.slice(0, 160));
	}
	console.log("EVENTOS:", JSON.stringify(tipos));
})();
