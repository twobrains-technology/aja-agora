/**
 * QA REAL da dev — uma jornada por categoria (auto, imóvel, moto), pelo HTTP, como o
 * navegador fala (molde: scripts/e2e-web-livre.ts).
 *
 *   E2E_BASE=<url da dev> E2E_CPF=<cpf autorizado> SIMULATOR_TEST_CELULAR=<celular> \
 *     pnpm exec tsx scripts/qa/jornada-dev.ts
 *
 * ATENÇÃO: cria PROPOSTA REAL na loja-piloto e consulta bureau no CPF informado.
 * Rode UMA vez, depois de `bash scripts/qa/acordar-dev.sh`.
 *
 * CPF só de `E2E_CPF`, celular só de `SIMULATOR_TEST_CELULAR`: nunca em arquivo, nunca
 * no console. O relatório grava o request e o trecho com os dois mascarados.
 *
 * Saída: docs/design/planos/evidencias/2026-11-04-qa-dev-d0056.md (PASSOU/FALHOU em texto).
 */
import "../_env-host";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = (process.env.E2E_BASE ?? "").replace(/\/$/, "");
const CPF = (process.env.E2E_CPF ?? "").trim();
const CELULAR = (process.env.SIMULATOR_TEST_CELULAR ?? "").trim();
const RELATORIO = "docs/design/planos/evidencias/2026-11-04-qa-dev-d0056.md";

if (!BASE || !CPF || !CELULAR) {
	console.error(
		"Faltam E2E_BASE, E2E_CPF e/ou SIMULATOR_TEST_CELULAR no ambiente (os valores nunca são impressos).",
	);
	process.exit(2);
}

/** Mascara o CPF/celular informados e qualquer sequência de 10–11 dígitos. */
function mascarar(texto: string): string {
	const soltos = (v: string) => v.replace(/\D/g, "");
	let out = texto;
	for (const v of [CPF, CELULAR]) {
		const d = soltos(v);
		if (d.length >= 8) {
			out = out.split(v).join("[MASCARADO]");
			out = out.split(d).join("[MASCARADO]");
		}
	}
	return out
		.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[MASCARADO]")
		.replace(/\b\d{10,11}\b/g, "[MASCARADO]");
}

type Categoria = {
	nome: "auto" | "imovel" | "moto";
	pedido: string;
};
const CATEGORIAS: Categoria[] = [
	{ nome: "auto", pedido: "quero um carro de uns 80 mil" },
	{ nome: "imovel", pedido: "quero comprar um imóvel de uns 300 mil" },
	{ nome: "moto", pedido: "quero uma moto de uns 20 mil" },
];

type Passo = {
	categoria: string;
	passo: string;
	ok: boolean;
	request: string;
	trecho: string;
	detalhe: string;
};
const passos: Passo[] = [];
const propostas: string[] = [];
const horarios: string[] = [];

/** Só o texto do agente do stream (text-delta), para o trecho do relatório. */
function falaDoStream(corpo: string): string {
	const partes: string[] = [];
	for (const linha of corpo.split("\n")) {
		if (!linha.startsWith("data:")) continue;
		try {
			const ev = JSON.parse(linha.slice(5).trim()) as { type?: string; delta?: string };
			if (ev.type === "text-delta" && typeof ev.delta === "string") partes.push(ev.delta);
		} catch {
			// linha que não é JSON (ex.: [DONE])
		}
	}
	return partes.join("");
}

async function turno(
	conversationId: string,
	texto: string,
): Promise<{ status: number; corpo: string }> {
	const r = await fetch(`${BASE}/api/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			conversationId,
			messages: [{ id: randomUUID(), role: "user", parts: [{ type: "text", text: texto }] }],
		}),
	});
	return { status: r.status, corpo: await r.text() };
}

async function devRespondendo(): Promise<boolean> {
	const limite = Date.now() + 120_000;
	while (Date.now() < limite) {
		try {
			const r = await fetch(`${BASE}/api/auth/get-session`);
			if (r.status < 500) return true;
		} catch {
			// ainda acordando
		}
		await new Promise((res) => setTimeout(res, 5_000));
	}
	return false;
}

function registrar(p: Passo): void {
	passos.push(p);
	console.log(`${p.ok ? "PASSOU" : "FALHOU"} [${p.categoria}] ${p.passo} — ${p.detalhe}`);
}

async function jornada(cat: Categoria): Promise<void> {
	const conversationId = randomUUID();
	const dado = (passo: string) => ({ categoria: cat.nome, passo });

	const rodar = async (
		passo: string,
		textoReal: string,
		textoLog: string,
		prova: (corpo: string) => { ok: boolean; detalhe: string },
	): Promise<string> => {
		const { status, corpo } = await turno(conversationId, textoReal);
		const p = status === 200 ? prova(corpo) : { ok: false, detalhe: `HTTP ${status}` };
		registrar({
			...dado(passo),
			ok: p.ok,
			request: `POST /api/chat conversationId=${conversationId} texto="${textoLog}"`,
			trecho: mascarar(falaDoStream(corpo).slice(0, 400)) || mascarar(corpo.slice(0, 300)),
			detalhe: p.detalhe,
		});
		return corpo;
	};

	if (!(await devRespondendo())) {
		registrar({
			...dado("dev acordada"),
			ok: false,
			request: `GET ${BASE}/api/auth/get-session`,
			trecho: "",
			detalhe: "a dev não respondeu em 2 min (rode acordar-dev.sh)",
		});
		return;
	}

	await rodar("1. oi", "oi", "oi", (c) => ({
		ok: c.includes("text") && !c.includes("comparison_table"),
		detalhe: "o vendedor falou, sem busca ainda",
	}));

	const t2 = await rodar("2. bem + valor → cartas", cat.pedido, cat.pedido, (c) => ({
		ok: c.includes("comparison_table"),
		detalhe: c.includes("comparison_table")
			? "card comparison_table na tela"
			: "sem card de cartas",
	}));
	if (!t2.includes("comparison_table")) return;

	await rodar(
		"3. simulação",
		"me mostra a simulação da primeira",
		"me mostra a simulação da primeira",
		(c) => ({
			ok: c.includes("simulation_result"),
			detalhe: c.includes("simulation_result") ? "card simulation_result" : "sem simulation_result",
		}),
	);

	const textoIdentidade = (cpf: string, cel: string) =>
		`gostei dessa, pode fazer a proposta. meu cpf é ${cpf} e meu whatsapp ${cel}`;
	const t4 = await rodar(
		"4. escolha + identidade → proposta",
		textoIdentidade(CPF, CELULAR),
		textoIdentidade("[CPF]", "[CELULAR]"),
		(c) => ({
			ok: c.includes("real_offer"),
			detalhe: c.includes("real_offer") ? "card real_offer (proposta gerada)" : "sem real_offer",
		}),
	);
	const m = t4.match(/proposalId\\?"\s*:\s*\\?"([^"\\]+)/);
	if (m?.[1]) {
		propostas.push(`${cat.nome}: ${m[1]}`);
		console.log(`proposta ${cat.nome}: ${m[1]}`);
	}

	await rodar("5. fecho", "confirmo, pode seguir", "confirmo, pode seguir", (c) => ({
		ok: c.includes("text") && !c.includes("atendimento_handoff"),
		detalhe: "o vendedor seguiu o fecho, sem empurrar para humano",
	}));
}

function gravarRelatorio(): void {
	const total = passos.length;
	const falhas = passos.filter((p) => !p.ok).length;
	const linhas: string[] = [
		"# QA da dev — D-0056 (jornada real por categoria)",
		"",
		`Alvo: ${BASE}`,
		`Início: ${horarios[0] ?? "?"} · Fim: ${horarios[1] ?? "?"}`,
		`Resultado: ${falhas === 0 ? "PASSOU" : "FALHOU"} (${total - falhas}/${total} passos)`,
		`Propostas criadas: ${propostas.length > 0 ? propostas.join("; ") : "nenhuma"}`,
		"",
		"CPF e celular vêm do ambiente e estão mascarados em tudo o que segue.",
		"",
	];
	for (const cat of CATEGORIAS) {
		linhas.push(`## ${cat.nome}`, "");
		for (const p of passos.filter((x) => x.categoria === cat.nome)) {
			linhas.push(
				`- ${p.ok ? "PASSOU" : "FALHOU"} · ${p.passo} — ${p.detalhe}`,
				`  - request: \`${mascarar(p.request)}\``,
				`  - trecho: ${p.trecho ? `"${p.trecho.replace(/\n/g, " ")}"` : "(vazio)"}`,
			);
		}
		linhas.push("");
	}
	mkdirSync(dirname(RELATORIO), { recursive: true });
	writeFileSync(RELATORIO, mascarar(linhas.join("\n")));
	console.log(`relatório: ${RELATORIO}`);
}

async function main(): Promise<void> {
	horarios.push(new Date().toISOString());
	for (const cat of CATEGORIAS) await jornada(cat);
	horarios.push(new Date().toISOString());
	gravarRelatorio();
	const falhas = passos.filter((p) => !p.ok).length;
	console.log(falhas === 0 ? "QA DEV VERDE" : `QA DEV REPROVADO (${falhas} passos)`);
	process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("infra:", e instanceof Error ? e.message : "erro");
	horarios.push(new Date().toISOString());
	if (passos.length > 0) gravarRelatorio();
	process.exit(1);
});
