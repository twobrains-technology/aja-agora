// Sonda do FECHO FANTASMA — reproduz a conversa `fd76e393` (produção, WhatsApp,
// 16/08/2026 19:17→19:24) e confere no BANCO se o que o agente anunciou existe.
//
// ## O caso
//
// O cliente escolheu ("gostei dessa do bb"), o agente respondeu "Vou confirmar
// essa escolha pra você. Pronto! A cota está confirmada" e, quatro turnos
// depois, "Sua proposta está fechada com a cota do Banco do Brasil, R$ 1.031.904
// de crédito". No servidor, ao fim da conversa: `bevi_proposals = 0`,
// `escolha = null`, `contractOffer = null`. Nada do que ele anunciou existia.
//
// No mesmo dia, no canal WEB (`ff8f2080`), o mesmo modelo IMPRIMIU para o
// cliente o texto `[card: escolher_cota com id 6a7b59c125935b16a731639c]` —
// `escolher_cota` é TOOL, não card. Ele narrou a chamada em vez de executá-la.
// As duas conversas são a mesma falha vista de dois ângulos: a ancoragem da
// escolha não acontece, e a fala segue adiante como se tivesse acontecido.
//
// ## Por que pelo simulador de WhatsApp e não pela sonda web
//
// `sonda-conversa-real.ts` dirige `/api/chat` (web), onde o CPF NÃO entra por
// conversa — o servidor recusa, por LGPD, e o roteiro precisa clicar no card.
// A conversa que falhou é do WhatsApp, onde o CPF entra falado e o funil não
// tem card de formulário para se apoiar. Reproduzir no canal errado provaria
// outra coisa. `/api/admin/simulator/whatsapp` é o MESMO entrypoint do webhook
// real, então o caminho exercitado aqui é o de produção.
//
// ## O que esta sonda decide, e o que ela NÃO decide
//
// Ela NÃO julga tom, empatia nem fluidez — isso é Langfuse, juiz sobre volume.
// Ela decide invariantes que ou existem no servidor ou não existem:
//
//   I1  a escolha do cliente ficou ANCORADA (`metadata.escolha`)
//   I2  não há anúncio de fecho com `bevi_proposals = 0` ao fim da jornada
//   I3  o CPF é pedido UMA vez (o cliente reclamou "de novo? ja passei")
//   I4  nenhuma gramática interna (`[card: …]`) vaza no corpo da fala
//
// I3 e I4 leem a fala, e isso pede uma ressalva explícita, porque o projeto tem
// uma regra sobre exatamente isto: MEDIR fala numa sonda é legítimo; converter
// a medição em guard de regex no produto é o anti-padrão revertido em 649320dc.
// Esta sonda mede. O conserto de I3/I4 é de contexto/estrutura, não de filtro.
//
// ## Uso
//
//   pnpm sonda:fecho-fantasma
//   AJA_BASE_URL=http://aja-<workspace>.orb.local pnpm sonda:fecho-fantasma
//
// Pré-requisitos: app de pé (skill local-dev), gateway LiteLLM shared de pé.

// Precisa ser o PRIMEIRO import: carrega .env e traduz DNS de container→host.
import "./_env-host";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, conversations } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const BASE = process.env.AJA_BASE_URL ?? "http://aja-basalt-starburst.orb.local";

/** Os turnos do cliente, na ordem exata de `fd76e393`. O texto é literal — a
 * digitação errada faz parte do caso ("perdao, eh essa emsmo"), e normalizar
 * seria testar uma conversa que não aconteceu. */
const TURNOS: Array<{ texto: string; nota?: string }> = [
	{ texto: "oi" },
	{ texto: "quero uma casa nova" },
	{ texto: "sim no setor jao em goiania" },
	{ texto: "Acima de 500 mil", nota: "faixa — em prod virou carta de R$ 1.031.904" },
	{
		texto: "33880599858",
		nota: "CPF falado — no WhatsApp entra por conversa (em prod ele foi enviado aqui)",
	},
	{ texto: "qual voce me recomenda?" },
	{ texto: "de qual administradora?" },
	{ texto: "sim primeira" },
	{ texto: "ouvi falar em parcela reudiza, sabe oque eh isso?" },
	{
		texto: "gostei dessa do bb",
		nota: "🔴 O TURNO DA ESCOLHA — aqui `escolher_cota` tem que rodar",
	},
	{ texto: "Sem pressa, quero menor" },
	{ texto: "Seguir agora" },
	{ texto: "Ver outras", nota: "em prod: resposta sem card, persona nula, e o funil não voltou" },
	{ texto: "perdao, eh essa emsmo vamos fechar, confirmado" },
	{ texto: "de novo? ja passei", nota: "🔴 o cliente reclamando do CPF repetido" },
	{ texto: "uai, ja estamos falando nele?", nota: "🔴 pediram WhatsApp DENTRO do WhatsApp" },
	{ texto: "fecha a proposta", nota: "🔴 O TURNO DO DANO — em prod: 'Sua proposta está fechada'" },
];

type Botao = { id: string; titulo: string };
type Balao = { type: string; text?: string; interactive?: unknown };

/**
 * Os botões oferecidos num turno — botões de resposta rápida e linhas de lista.
 *
 * O WhatsApp não tem "digitar por cima do botão": quando o agente manda um card
 * de decisão, o que o cliente faz é CLICAR, e o clique entra pelo webhook como
 * `interactive` com um `replyId`. Esse id é o que aciona os handlers
 * determinísticos (`interactive-handlers.ts`) — texto com o mesmo teor não
 * aciona nada disso, cai no modelo.
 *
 * Sem isto, a primeira versão desta sonda mandou "Seguir agora" como texto, o
 * `contract_confirm` nunca foi clicado, a proposta nunca foi criada, e o
 * invariante I2 acusou um defeito de produto que era do instrumento.
 */
function botoesDe(baloes: Balao[]): Botao[] {
	const out: Botao[] = [];
	for (const b of baloes) {
		const it = b.interactive as
			| {
					action?: {
						buttons?: Array<{ reply?: { id?: string; title?: string } }>;
						sections?: Array<{ rows?: Array<{ id?: string; title?: string }> }>;
					};
			  }
			| undefined;
		for (const bt of it?.action?.buttons ?? []) {
			if (bt.reply?.id) out.push({ id: bt.reply.id, titulo: bt.reply.title ?? bt.reply.id });
		}
		for (const s of it?.action?.sections ?? []) {
			for (const r of s.rows ?? []) {
				if (r.id) out.push({ id: r.id, titulo: r.title ?? r.id });
			}
		}
	}
	return out;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O turno do roteiro corresponde a um botão que está na tela? */
function botaoCorrespondente(botoes: Botao[], texto: string): Botao | null {
	const alvo = semAcento(texto);
	return (
		botoes.find((b) => semAcento(b.titulo) === alvo) ??
		botoes.find((b) => semAcento(b.titulo).includes(alvo) || alvo.includes(semAcento(b.titulo))) ??
		null
	);
}

async function login(): Promise<string> {
	const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: BASE },
		body: JSON.stringify({
			email: process.env.ADMIN_EMAIL,
			password: process.env.ADMIN_PASSWORD,
		}),
	});
	if (!r.ok) throw new Error(`login HTTP ${r.status} — confira ADMIN_EMAIL/ADMIN_PASSWORD`);
	return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * Cria a sessão de WhatsApp JÁ COM NOME, como o canal real entrega.
 *
 * No WhatsApp o nome chega no payload do contato e o funil nunca abre o gate
 * `name`. O simulador não tem de onde tirar isso, então a primeira rodada desta
 * sonda desalinhou logo no quarto turno: o agente perguntou "como posso te
 * chamar?", o roteiro respondeu com o CPF, e o CPF virou nome. A jornada
 * reproduzida deixava de ser a que falhou.
 *
 * O nome é gravado direto na conversa porque a rota do simulador não aceita o
 * campo — e mudar a rota para acomodar uma sonda seria mexer no produto para
 * fazer o instrumento passar.
 */
async function criarSessao(cookie: string): Promise<string> {
	const r = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie, origin: BASE },
		body: JSON.stringify({ channel: "whatsapp" }),
	});
	if (!r.ok) throw new Error(`sessão HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
	const conv = (await r.json()).conversationId as string;

	await db.update(conversations).set({ contactName: "Kairo" }).where(eq(conversations.id, conv));
	return conv;
}

/**
 * Um turno: abre o SSE ANTES de enviar (senão os balões do turno se perdem),
 * manda o texto e espera o silêncio.
 *
 * A janela de silêncio precisa ser maior que a busca na Bevi (~60-90s) — com
 * uma janela curta o coletor desiste no "já vou buscar" e reporta "o agente
 * parou", que é falso. É a mesma lição que `scripts/qa/wa-talk.mjs` já pagou.
 */
async function turno(
	cookie: string,
	conv: string,
	texto: string,
	clique: Botao | null,
): Promise<Balao[]> {
	const ac = new AbortController();
	const sse = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conv}/stream`, {
		headers: { cookie, origin: BASE, accept: "text/event-stream" },
		signal: ac.signal,
	});
	if (!sse.ok || !sse.body) throw new Error(`stream HTTP ${sse.status}`);

	const corpo = sse.body;
	const baloes: Balao[] = [];
	let ultimoEm = 0;
	void (async () => {
		const reader = corpo.getReader();
		const dec = new TextDecoder();
		let buf = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const partes = buf.split("\n\n");
				buf = partes.pop() ?? "";
				for (const p of partes) {
					const linha = p.split("\n").find((l) => l.startsWith("data: "));
					if (!linha) continue;
					try {
						const msg = JSON.parse(linha.slice(6));
						if (msg.type !== "event" || msg.event?.type === "typing") continue;
						baloes.push(msg.event as Balao);
						ultimoEm = Date.now();
					} catch {
						// linha não-JSON do protocolo SSE
					}
				}
			}
		} catch {
			// abortado ao fim do turno
		}
	})();

	await new Promise((r) => setTimeout(r, 700)); // deixa o subscribe assentar

	const res = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conv}/send`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie, origin: BASE },
		body: JSON.stringify(
			clique
				? { kind: "interactive", replyId: clique.id, replyTitle: clique.titulo }
				: { kind: "text", text: texto },
		),
		signal: AbortSignal.timeout(280_000),
	});
	if (!res.ok) {
		ac.abort();
		throw new Error(`send HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	}

	const TETO_MS = 290_000;
	const inicio = Date.now();
	while (Date.now() - inicio < TETO_MS) {
		await new Promise((r) => setTimeout(r, 1000));
		if (!baloes.length) continue;
		const ultimo = JSON.stringify(baloes[baloes.length - 1] ?? {});
		const prometeuBuscar = /vou buscar|buscar as melhores|procurar as op/i.test(ultimo);
		if (Date.now() - ultimoEm > (prometeuBuscar ? 120_000 : 20_000)) break;
	}
	ac.abort();
	return baloes;
}

/** O texto que o cliente lê, juntando balão de texto e corpo de interativo. */
function falaDe(baloes: Balao[]): string {
	return baloes
		.map((b) => {
			if (b.type === "text") return b.text ?? "";
			const it = b.interactive as { body?: { text?: string } } | undefined;
			return it?.body?.text ?? "";
		})
		.filter(Boolean)
		.join("\n");
}

async function main() {
	console.log(`Sonda do fecho fantasma — ${BASE}`);
	console.log("Reproduz `fd76e393` (prod, WhatsApp, 16/08 19:17→19:24)\n");

	const cookie = await login();
	const conv = await criarSessao(cookie);
	console.log(`conversa: ${conv}\n${"═".repeat(78)}`);

	/** Guarda a fala de cada turno para as checagens que leem texto (I3, I4). */
	const falas: Array<{ cliente: string; agente: string }> = [];
	/** Os botões que estão na tela agora — o turno seguinte pode ser um clique. */
	let naTela: Botao[] = [];

	for (const t of TURNOS) {
		const clique = botaoCorrespondente(naTela, t.texto);
		const baloes = await turno(cookie, conv, t.texto, clique);
		const agente = falaDe(baloes);
		falas.push({ cliente: t.texto, agente });
		naTela = botoesDe(baloes);

		console.log(
			`\n👤 ${t.texto}${clique ? `   [CLIQUE ${clique.id}]` : ""}${t.nota ? `   ← ${t.nota}` : ""}`,
		);
		console.log(`🤖 ${agente || "[sem resposta]"}`);
		if (naTela.length > 0) {
			console.log(`   📦 botões: ${naTela.map((b) => `${b.titulo} (${b.id})`).join(" | ")}`);
		}
	}

	// ── O que o servidor tem, depois de tudo que foi dito ──
	const [linha] = await db
		.select({ metadata: conversations.metadata })
		.from(conversations)
		.where(eq(conversations.id, conv));
	const meta = (linha?.metadata ?? {}) as ConversationMetadata;

	const [{ n: propostas }] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(beviProposals)
		.where(eq(beviProposals.conversationId, conv));

	console.log(`\n${"═".repeat(78)}\nESTADO NO SERVIDOR`);
	console.log(`  escolha ................ ${meta.escolha ? JSON.stringify(meta.escolha) : "null"}`);
	console.log(`  bevi_proposals ......... ${propostas}`);
	console.log(`  contractClosed ......... ${meta.contractClosed ?? "null"}`);
	console.log(`  contractFormDispatched . ${meta.contractFormDispatched ?? "null"}`);
	console.log(`  decisionAccepted ....... ${meta.decisionAccepted ?? "null"}`);
	console.log(`  identityCollected ...... ${meta.identityCollected ?? "null"}`);

	// ── Invariantes ──
	const textoTodo = falas.map((f) => f.agente).join("\n");
	// PEDIDO de CPF, não menção. A primeira versão contava qualquer turno que
	// dissesse "CPF", e com isso somava a confirmação do próprio servidor ("Boa!
	// Já tenho seus dados (CPF 338.•••.•••-58) aqui do nosso atendimento") — que
	// é exatamente o oposto do defeito. Instrumento que conta a cura junto com a
	// doença não mede nada.
	const PEDIDO_DE_CPF =
		/(qual[^.?!]{0,20}\bcpf\b)|(\bcpf\b[^.?!]{0,30}\?)|((me manda|manda|informa|confirma|preciso d[oe])[^.?!]{0,24}\bcpf\b)/i;
	const pedidosDeCpf = falas.filter((f) => PEDIDO_DE_CPF.test(f.agente)).length;
	const vazamentos = textoTodo.match(/\[card:[^\]]*\]/gi) ?? [];

	const checks = [
		{
			id: "I1",
			nome: "a escolha do cliente ficou ancorada no servidor",
			ok: Boolean(meta.escolha?.groupId),
			detalhe: meta.escolha ? "escolha presente" : "escolha AUSENTE — nada gravou a cota escolhida",
		},
		{
			id: "I2",
			nome: "o cliente pediu para fechar e existe proposta de verdade",
			ok: propostas >= 1,
			detalhe: `bevi_proposals = ${propostas}`,
		},
		{
			id: "I3",
			nome: "o CPF foi pedido uma única vez",
			ok: pedidosDeCpf <= 1,
			detalhe: `${pedidosDeCpf} turno(s) do agente PEDEM o CPF`,
		},
		{
			id: "I4",
			nome: "nenhuma gramática interna vazou na fala",
			ok: vazamentos.length === 0,
			detalhe: vazamentos.length ? vazamentos.join(" | ") : "nenhum `[card: …]` no corpo",
		},
	];

	console.log(`\n${"═".repeat(78)}\nVEREDITO`);
	for (const c of checks) {
		console.log(`  ${c.ok ? "✅" : "❌"} ${c.id} — ${c.nome}\n       ${c.detalhe}`);
	}

	const falhas = checks.filter((c) => !c.ok);
	console.log(
		`\n${falhas.length === 0 ? "✅ jornada íntegra" : `❌ ${falhas.length} invariante(s) quebrado(s): ${falhas.map((f) => f.id).join(", ")}`}`,
	);
	console.log(`(conversa: ${conv})`);
	process.exitCode = falhas.length === 0 ? 0 : 1;
}

void main().then(
	() => process.exit(process.exitCode ?? 0),
	(e) => {
		console.error(`\n✗ sonda abortou: ${(e as Error).message}`);
		process.exit(2);
	},
);
