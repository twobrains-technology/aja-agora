// Abre a ocorrência do alerta no Cortex (tb-cortex.twobrainstechnology.com).
//
// O Cortex expõe as ações como MCP sobre HTTP (JSON-RPC 2.0 em `/api/mcp`), e é
// por aí que falamos com ele daqui — o mesmo `abrir_ocorrencia` que o assistente
// usa na sessão do Kairo, agora disparado pelo servidor quando um monitor
// alerta. Não há SDK: é um POST de `tools/call`.
//
// Duas regras da casa que valem aqui:
//   • a descrição é TEXTO PURO — markdown vira lixo na tela do card;
//   • o Cortex NÃO tem editar/excluir ocorrência, então nada de abrir card de
//     teste em projeto real.
//
// Sem `CORTEX_MCP_URL`/`CORTEX_MCP_TOKEN` a função é no-op silencioso: alerta
// nunca pode depender de integração de terceiro para chegar ao e-mail.
export type OcorrenciaDoAlerta = {
	titulo: string;
	descricao: string;
	/** `urgent` só para severidade ALERT — inflação de urgência mata alerta. */
	prioridade: "low" | "medium" | "high" | "urgent";
};

const PROJETO_PADRAO = "Ajaagora";

/** MCP exige `Accept` com os dois tipos; sem isso o servidor devolve 406. */
const ACEITA = "application/json, text/event-stream";

async function chamarTool(
	url: string,
	token: string,
	name: string,
	args: Record<string, unknown>,
): Promise<boolean> {
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: ACEITA,
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		}),
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) {
		console.error(`[alerta] cortex ${name} → HTTP ${res.status}`);
		return false;
	}
	const corpo = await res.text();
	const veredito = lerRespostaDoCortex(corpo);
	if (!veredito.ok) {
		console.error(`[alerta] cortex ${name} devolveu erro: ${veredito.erro}`);
		return false;
	}
	return true;
}

/**
 * Lê a resposta do Cortex e diz se a operação DEU CERTO.
 *
 * Medido contra o servidor real em 2026-08-13, e é a pegadinha desta
 * integração: pedindo `abrir_ocorrencia` num projeto inexistente, ele responde
 * **HTTP 200 com `isError: false`** e enfia a falha dentro do texto:
 *
 *   {"result":{"content":[{"type":"text","text":"{\"erro\":\"Projeto ... não
 *    encontrado\"}"}],"isError":false}}
 *
 * Ou seja: confiar em `isError` faz toda ocorrência que falha ser contada como
 * aberta — e o log diria "ocorrencia_aberta: true" para um card que não existe.
 * O veredito verdadeiro está no campo `erro` do JSON de dentro do `text`.
 */
export function lerRespostaDoCortex(corpo: string): { ok: true } | { ok: false; erro: string } {
	try {
		const json = JSON.parse(corpo) as {
			error?: { message?: string };
			result?: { isError?: boolean; content?: { text?: string }[] };
		};
		// Erro de JSON-RPC (método inexistente, auth) vem no envelope.
		if (json.error) return { ok: false, erro: json.error.message ?? "erro jsonrpc" };
		if (json.result?.isError) return { ok: false, erro: "isError=true" };

		const texto = (json.result?.content ?? []).map((c) => c.text ?? "").join("");
		if (!texto) return { ok: true };
		try {
			const interno = JSON.parse(texto) as { erro?: string };
			if (interno?.erro) return { ok: false, erro: interno.erro };
		} catch {
			// texto que não é JSON = resposta em prosa, tratada como sucesso
		}
		return { ok: true };
	} catch {
		return { ok: false, erro: "resposta ilegível" };
	}
}

/** Abre a ocorrência. Devolve se conseguiu — nunca lança. */
export async function abrirOcorrenciaNoCortex(
	oc: OcorrenciaDoAlerta,
	deps: { fetchImpl?: typeof chamarTool } = {},
): Promise<{ aberta: boolean; motivo?: string }> {
	const url = process.env.CORTEX_MCP_URL;
	const token = process.env.CORTEX_MCP_TOKEN;
	if (!url || !token) return { aberta: false, motivo: "cortex-nao-configurado" };

	const projeto = process.env.CORTEX_PROJETO ?? PROJETO_PADRAO;
	try {
		const chamar = deps.fetchImpl ?? chamarTool;
		const ok = await chamar(url, token, "abrir_ocorrencia", {
			projeto,
			titulo: oc.titulo,
			descricao: oc.descricao,
			tipo: "incident",
			prioridade: oc.prioridade,
			autor: "Monitoramento Aja Agora",
			reportado_por: "Langfuse Monitor",
		});
		return ok ? { aberta: true } : { aberta: false, motivo: "cortex-recusou" };
	} catch (err) {
		console.error("[alerta] cortex falhou (ignorado):", err);
		return { aberta: false, motivo: "cortex-excecao" };
	}
}

export function prioridadeDaSeveridade(severity: string): OcorrenciaDoAlerta["prioridade"] {
	return severity.toUpperCase() === "ALERT" ? "urgent" : "high";
}
