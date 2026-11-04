/**
 * Compara perfis do playground na dev (D-0056, Bloco 6): cria cada perfil,
 * roda o mesmo roteiro em conversa nova (modo "depois") e grava transcrições
 * e metricas.json. Não publica perfil. Credencial vem do vault, só em memória.
 * Em BASE=http://localhost:PORTA, usa COMPARAR_EMAIL/COMPARAR_SENHA (usuário de teste do banco local).
 *
 * Uso: tsx scripts/playground/comparar-perfis.ts [base-url] [saida-dir]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://tb-dev-aja-agora.twobrainstechnology.com";
const SAIDA = process.argv[3] ?? "docs/design/planos/evidencias/2026-11-04-comparacao-perfis";
const roteiro = JSON.parse(
	readFileSync(join(process.cwd(), "scripts", "playground", "roteiros", "basico.json"), "utf8"),
) as { nome: string; falas: string[] };

const PERFIS = [
	{
		nome: "suave-formal-leigo",
		atributos: {
			agressividade: "suave",
			proatividade: "baixa",
			tecnicidade: "leigo",
			tom: "formal",
		},
	},
	{
		nome: "insistente-coloquial-expert",
		atributos: {
			agressividade: "insistente",
			proatividade: "alta",
			tecnicidade: "expert",
			tom: "coloquial",
		},
	},
] as const;

type Balao = { texto: string; promessa: { rotulo: string; motivo: string } | null };

function segredo(chave: string): string {
	const local = {
		ADMIN_EMAIL: process.env.COMPARAR_EMAIL,
		ADMIN_PAINEL_SENHA: process.env.COMPARAR_SENHA,
	}[chave];
	if (BASE.startsWith("http://localhost") && local) return local;
	return execFileSync("secrets.sh", ["get-key", "aja-agora", chave], {
		encoding: "utf8",
		timeout: 30_000,
	}).trim();
}

async function login(): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: BASE },
		body: JSON.stringify({
			email: segredo("ADMIN_EMAIL"),
			password: segredo("ADMIN_PAINEL_SENHA"),
		}),
	});
	if (!res.ok) throw new Error(`login HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

async function api(cookie: string, caminho: string, corpo: unknown): Promise<Response> {
	return fetch(`${BASE}${caminho}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
		body: JSON.stringify(corpo),
	});
}

async function turno(
	cookie: string,
	perfilId: string,
	mensagem: string,
	conversationId?: string,
): Promise<{ conversationId: string; baloes: Balao[]; cards: string[] }> {
	const res = await api(cookie, "/api/admin/playground/chat", {
		perfilId,
		modo: "depois",
		mensagem,
		...(conversationId ? { conversationId } : {}),
	});
	if (!res.ok || !res.body) {
		throw new Error(`chat HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}
	let buf = "";
	let final: { conversationId: string; baloes: Balao[] } | null = null;
	const cards: string[] = [];
	const trata = (l: string) => {
		if (!l.trim()) return;
		const ev = JSON.parse(l);
		if (ev.type === "erro") throw new Error(`chat erro: ${ev.error}`);
		if (ev.type === "final") final = ev;
		if (ev.type === "evento" && ev.evento?.type === "artifact") cards.push(ev.evento.artifactType);
	};
	const dec = new TextDecoder();
	for await (const parte of res.body as unknown as AsyncIterable<Uint8Array>) {
		buf += dec.decode(parte, { stream: true });
		const linhas = buf.split("\n");
		buf = linhas.pop() ?? "";
		for (const l of linhas) trata(l);
	}
	trata(buf);
	if (!final) throw new Error("stream terminou sem evento 'final'");
	const f = final as { conversationId: string; baloes: Balao[] };
	return { conversationId: f.conversationId, baloes: f.baloes, cards };
}

async function main() {
	mkdirSync(SAIDA, { recursive: true });
	const cookie = await login();
	const metricas: Record<string, unknown> = {};

	for (const p of PERFIS) {
		const r = await api(cookie, "/api/admin/playground/perfis", {
			nome: `${p.nome} (comparação ${roteiro.nome})`,
			atributos: p.atributos,
			orientacao: "",
		});
		if (!r.ok) throw new Error(`criar perfil HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
		const { id } = (await r.json()) as { id: string };

		let conv: string | undefined;
		const turnos: { fala: string; baloes: Balao[]; cards: string[] }[] = [];
		for (const fala of roteiro.falas) {
			const t = await turno(cookie, id, fala, conv);
			conv = t.conversationId;
			turnos.push({ fala, baloes: t.baloes, cards: t.cards });
		}

		const baloes = turnos.flatMap((t) => t.baloes);
		const perguntas = baloes.reduce((n, b) => n + (b.texto.match(/\?/g)?.length ?? 0), 0);
		metricas[p.nome] = {
			perfilId: id,
			atributos: p.atributos,
			turnos: turnos.length,
			baloes: baloes.length,
			baloesPorTurno: +(baloes.length / turnos.length).toFixed(2),
			tamanhoMedioDoBalaoEmCaracteres: Math.round(
				baloes.reduce((n, b) => n + b.texto.length, 0) / Math.max(baloes.length, 1),
			),
			perguntasPorMensagem: +(perguntas / turnos.length).toFixed(2),
			cardsUsados: turnos.flatMap((t) => t.cards),
			turnosComCard: turnos.filter((t) => t.cards.length > 0).length,
			promessasDeContemplacao: baloes.filter((b) => b.promessa).length,
		};

		const md = [
			`# ${p.nome}`,
			"",
			`Atributos: ${JSON.stringify(p.atributos)}`,
			"",
			...turnos.flatMap((t, i) => [
				`## Turno ${i + 1}`,
				"",
				`**Cliente:** ${t.fala}`,
				"",
				...t.baloes.map(
					(b) =>
						`**Agente:** ${b.texto}${b.promessa ? `\n\n> ${b.promessa.rotulo}: ${b.promessa.motivo}` : ""}\n`,
				),
				...(t.cards.length ? [`Cards: ${t.cards.join(", ")}`, ""] : []),
			]),
		].join("\n");
		writeFileSync(join(SAIDA, `transcricao-${p.nome}.md`), md);
	}

	writeFileSync(join(SAIDA, "metricas.json"), `${JSON.stringify(metricas, null, 2)}\n`);
	console.log(JSON.stringify(metricas, null, 2));
}

main().catch((e) => {
	console.error(String(e instanceof Error ? e.message : e));
	process.exit(1);
});
