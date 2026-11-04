#!/usr/bin/env node
// caminho.mjs — conduz UMA conversa simulada por canal (web e/ou WhatsApp) pelo
// roteiro de `docs/qa/roteiro-de-venda.md` e imprime, passo a passo, o que o
// cliente disse, o que o agente respondeu, os artifacts que vieram e se o passo
// AVANÇOU, PAROU ou NÃO EXISTE no canal.
//
// Não é eval de conduta: é o mapa do caminho. Ele **para** no degrau em que o
// ambiente não tem o que o passo seguinte exige e imprime o motivo literal — em
// vez de terminar "verde" numa conversa que não chegou a `contractClosed`.
//
//   node scripts/qa/caminho.mjs                    # os dois canais
//   node scripts/qa/caminho.mjs --canal web        # só a web
//   node scripts/qa/caminho.mjs --canal whatsapp   # só o WhatsApp
//   node scripts/qa/caminho.mjs --json             # só o JSON (diário/CI)
//
// O node do HOST não alcança o OrbStack (EHOSTUNREACH): roda DENTRO do container.
//
//   docker exec -e AJA_BASE_URL=http://localhost:3000 aja-app-chefe-criterio-do-chat \
//     sh -lc "cd /app && timeout 600 node scripts/qa/caminho.mjs"
//
// As provas de banco dos mesmos passos estão em `scripts/qa/provas-do-caminho.sql`
// — o SQL é a régua; este script só conduz e narra.

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sendTurn } from "../eval/chat-client.mjs";

const BASE = process.env.AJA_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WA_TALK = fileURLToPath(new URL("./wa-talk.mjs", import.meta.url));

// Identidade homologada do vault. Vazia nesta worktree → o caminho para na
// proposta (o `startContract` chama bureau real, `src/lib/bevi/fulfillment.ts:9`).
const CPF = (process.env.E2E_TEST_CPF ?? "").trim();
const CELULAR = (process.env.E2E_TEST_CELULAR ?? "").trim();
const TEM_IDENTIDADE = Boolean(CPF && CELULAR);

/** PII NUNCA sai em claro no relatório: CPF e celular entram mascarados em toda
 * linha impressa por este script (e nos JSON de saída). O valor enviado à API é
 * o de verdade; o que se protege é o que fica gravado no log/diário. */
function mascarar(texto) {
	return String(texto ?? "")
		.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF mascarado]")
		.replace(/\b\d{11}\b/g, "[número mascarado]");
}

const TETO_TURNO_WEB_MS = 200_000;
const TETO_TURNO_WA_MS = 330_000;

// ─────────────────────────────────────────────────────────────────────────────
// Roteiro — os passos na ordem de `docs/qa/roteiro-de-venda.md` (fases 1 a 7).
//
// `turns[canal]` são os turnos LITERAIS do cliente naquele passo. No WhatsApp um
// turno com `btnPrefix` clica o botão cujo id começa pelo prefixo (o roteiro varia
// o retrato do canal: `category_auto`, `range_auto_120`, `interest_<groupId>`); se
// o botão não veio, manda o `text` — botão que o canal não entregou não se inventa.
//
// `espera[canal]` é o que PROVA que o passo andou: tipo de artifact na web
// (`comparison_table`…), `btn:<prefixo>` ou `whatsapp:<evento>` no WhatsApp.
// Lista vazia = qualquer resposta do agente serve (o passo é de fala, não de card).
// ─────────────────────────────────────────────────────────────────────────────
const ROTEIRO = [
	{
		id: "1-saudacao",
		nome: "saudação",
		espera: {},
		turns: { web: [{ text: "oi" }], whatsapp: [{ text: "oi" }] },
	},
	{
		id: "2-tipo-de-bem",
		nome: "tipo de bem",
		espera: {},
		turns: {
			web: [{ text: "quero um carro, uns 90 mil" }],
			whatsapp: [{ btnPrefix: "category_auto", text: "quero um carro, uns 90 mil" }],
		},
	},
	{
		id: "3-nome",
		nome: "nome",
		espera: {},
		turns: { web: [{ text: "Mário" }], whatsapp: [{ text: "Mário" }] },
	},
	{
		id: "4-valor-ou-parcela",
		nome: "valor ou parcela",
		espera: {},
		turns: {
			web: [{ text: "uns 90 mil, uma parcela que caiba no bolso" }],
			whatsapp: [{ btnPrefix: "range_auto_120", text: "uns 90 mil" }],
		},
	},
	{
		id: "5-oferta-ou-carta",
		nome: "primeira oferta/carta",
		espera: {
			web: ["comparison_table", "group_card", "real_card", "real_offer"],
			whatsapp: ["btn:group_", "btn:interest_", "btn:detail_", "btn:simulate_"],
		},
		turns: {
			web: [{ text: "me mostra as opções" }],
			whatsapp: [{ text: "me mostra as opções" }],
		},
	},
	{
		id: "6-interesse",
		nome: "interesse/recomendação",
		espera: {},
		dependeDe: "5-oferta-ou-carta",
		turns: {
			web: [{ text: "tenho interesse" }],
			whatsapp: [{ btnPrefix: "interest_", text: "tenho interesse" }],
		},
	},
	{
		id: "7-simulacao-ou-lance",
		nome: "simulação ou lance",
		espera: {},
		dependeDe: "5-oferta-ou-carta",
		turns: {
			web: [{ text: "e a parcela fica quanto?" }, { text: "e se eu der um lance?" }],
			whatsapp: [{ text: "e a parcela fica quanto?" }, { text: "e se eu der um lance?" }],
		},
	},
	{
		id: "8-pedido-de-contato",
		nome: "pedido de contato",
		// O passo 8 é o CARD, não a frase: dizer "vou te mostrar o card" sem card é
		// exatamente o defeito que a matriz procura (o modelo promete o que não veio).
		espera: { web: ["whatsapp_optin", "lead_form"], whatsapp: [] },
		turns: { web: [{ text: "posso continuar pelo whatsapp?" }], whatsapp: [] },
		naoCanal: {
			whatsapp:
				"P6 — telefone e nome chegaram com a mensagem: o canal não pede o número (matriz, passo 8)",
		},
	},
	{
		id: "9-cpf-identidade",
		nome: "CPF/identidade",
		// O motor livre não emite mais `gate:identify` (o funil em código morreu em
		// 20/10/2026): o CPF entra por TEXTO e o servidor o captura em
		// `capturarIdentidadeDoTexto` (`src/lib/agent/pi/turno-livre.ts`). O que
		// prova que o passo andou é o `contract_form` ou a `real_offer` na tela.
		espera: { web: ["contract_form", "real_offer"], whatsapp: [] },
		turns: () =>
			TEM_IDENTIDADE
				? {
						web: [{ text: `meu cpf é ${CPF} e meu celular é ${CELULAR}` }],
						whatsapp: [{ text: `meu cpf é ${CPF} e meu celular é ${CELULAR}` }],
					}
				: {
						web: [{ text: "o que você precisa pra seguir com a contratação?" }],
						whatsapp: [{ text: "o que você precisa pra seguir com a contratação?" }],
					},
		motivoConhecido: TEM_IDENTIDADE
			? undefined
			: "E2E_TEST_CPF/E2E_TEST_CELULAR vazias nesta worktree — só o PEDIDO de identidade foi observado, o envio não",
	},
	{
		id: "10-proposta",
		nome: "proposta",
		espera: { web: ["real_offer"], whatsapp: [] },
		// O portão de consentimento da tool FICA (decisão do dono, 27/10): a proposta
		// só nasce com o aviso dado e o aceite na conversa. Então o roteiro responde
		// o aviso e só depois pede a geração — é o comportamento real do produto, não
		// um passo inventado pelo roteiro.
		turns: () => ({
			web: [
				{ text: "pode seguir, autorizo o uso dos meus dados" },
				{ text: "agora gera a proposta" },
			],
			whatsapp: [
				{ text: "pode seguir, autorizo o uso dos meus dados" },
				{ text: "agora gera a proposta" },
			],
		}),
		// Com identidade homologada o passo RODA (o bloqueio é medido depois, no banco);
		// sem ela, nem adianta tentar — é aí que o caminho para.
		bloqueio: () =>
			TEM_IDENTIDADE
				? null
				: "sem identidade homologada (`E2E_TEST_CPF` vazia) o `startContract` não roda — `bevi_proposals` não nasce (`src/lib/bevi/fulfillment.ts:9`)",
	},
	{
		id: "11-fechamento",
		nome: "fechamento",
		// O clique que fecha é `offer-confirm` (`src/lib/chat/actions.ts:149`); no
		// WhatsApp o mesmo passo vem por texto. O veredito FINAL não é o artifact:
		// é `contractClosed` no banco, provado por SQL.
		espera: {},
		turns: () => ({
			web: [{ action: { kind: "offer-confirm" }, label: "quero fechar" }],
			whatsapp: [{ text: "quero fechar" }],
		}),
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// Sessão — o mesmo caminho do runner de eval (`scripts/eval-run.ts:88-110`):
// login do admin, depois `POST /api/admin/simulator/sessions` com o `channel`.
// ─────────────────────────────────────────────────────────────────────────────
async function criarSessao(canal) {
	const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: BASE },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});
	if (!login.ok) throw new Error(`login ${login.status}: ${(await login.text()).slice(0, 200)}`);
	const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

	const sessao = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie, origin: BASE },
		body: JSON.stringify({ channel: canal }),
	});
	if (!sessao.ok) {
		throw new Error(`sessão ${canal} ${sessao.status}: ${(await sessao.text()).slice(0, 300)}`);
	}
	const { conversationId } = await sessao.json();
	return { conversationId, cookie };
}

// ─────────────────────────────────────────────────────────────────────────────
// Turno web — SSE de `POST /api/chat` pelo cliente do eval (o mesmo do runner).
// ─────────────────────────────────────────────────────────────────────────────
async function turnoWeb(conversationId, turno) {
	const r = await sendTurn(BASE, conversationId, turno, { timeoutMs: TETO_TURNO_WEB_MS });
	const tipos = r.artifacts.map((a) => a.type);
	return {
		cliente: r.userMsg,
		agente: (r.agentText ?? "").trim(),
		artifacts: tipos,
		gate: tipos.find((t) => t.startsWith("gate:"))?.slice(5) ?? null,
		botoes: [],
		erro: r.error,
		ms: r.elapsedMs,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Turno WhatsApp — pelo `wa-talk.mjs`, que é o que o CLIENTE recebe (SSE do
// simulador: texto íntegro + botões). Reaproveitar o script em vez de reimplementar
// a janela de silêncio (20 s, 120 s quando o agente prometeu buscar) é de propósito:
// instrumento impaciente vira bug fantasma.
// ─────────────────────────────────────────────────────────────────────────────
function rodarWaTalk(args) {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[WA_TALK, ...args],
			{ timeout: TETO_TURNO_WA_MS, maxBuffer: 8 * 1024 * 1024, env: process.env },
			(erro, stdout, stderr) => resolve({ erro, stdout: stdout ?? "", stderr: stderr ?? "" }),
		);
	});
}

/** Lê o retrato que o `wa-talk.mjs` imprime: balões de texto, `[BOTÕES]` e `[tipo]`. */
function lerRetratoWhatsApp(stdout) {
	const linhas = stdout.split("\n");
	const inicio = linhas.findIndex((l) => l.startsWith("=== AGENTE"));
	const corpo = inicio >= 0 ? linhas.slice(inicio + 1) : linhas;

	const baloes = [];
	const artifacts = [];
	const botoes = [];
	let bloco = [];

	const fechaBloco = () => {
		const texto = [];
		for (const linha of bloco) {
			if (linha.startsWith("[BOTÕES]")) {
				artifacts.push("whatsapp:interactive");
				for (const m of linha.matchAll(/\[([^\]]+)\] ([^|]*)/g)) {
					botoes.push({ id: m[1].trim(), title: m[2].trim() });
				}
				continue;
			}
			const evento = linha.match(/^\[([a-z_]+)\]/);
			if (evento) {
				artifacts.push(`whatsapp:${evento[1]}`);
				continue;
			}
			texto.push(linha);
		}
		const t = texto.join("\n").trim();
		if (t) baloes.push(t);
		bloco = [];
	};

	for (const linha of corpo) {
		if (linha.trim() === "---") {
			fechaBloco();
			continue;
		}
		bloco.push(linha);
	}
	fechaBloco();

	const semResposta = /\(sem resposta em (\d+)s\)/.exec(stdout);
	return {
		agente: baloes.join("\n\n").trim(),
		artifacts,
		botoes,
		semRespostaEm: semResposta ? Number(semResposta[1]) : null,
	};
}

async function turnoWhatsApp(conversationId, turno, botoesAnteriores) {
	const botao = turno.btnPrefix
		? botoesAnteriores.find((b) => b.id.startsWith(turno.btnPrefix))
		: null;

	const [args, cliente] = botao
		? [[conversationId, "--btn", botao.id, botao.title], `[botão ${botao.id}] ${botao.title}`]
		: [[conversationId, turno.text], turno.text];

	const { erro, stdout, stderr } = await rodarWaTalk(args);
	const retrato = lerRetratoWhatsApp(stdout);
	return {
		cliente,
		agente: retrato.agente,
		artifacts: retrato.artifacts,
		gate: null,
		botoes: retrato.botoes,
		erro:
			erro?.killed || erro?.signal
				? `timeout/${erro.signal}`
				: erro
					? (stderr || erro.message).trim().slice(0, 300)
					: retrato.semRespostaEm
						? `sem resposta em ${retrato.semRespostaEm}s`
						: null,
		ms: null,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Veredito do passo.
// ─────────────────────────────────────────────────────────────────────────────
function satisfeita(espera = [], turnos) {
	if (!espera.length) return true;
	const artifacts = turnos.flatMap((t) => t.artifacts);
	const botoes = turnos.flatMap((t) => t.botoes);
	return espera.some((token) =>
		token.startsWith("btn:")
			? botoes.some((b) => b.id.startsWith(token.slice(4)))
			: artifacts.includes(token),
	);
}

/** O motivo LITERAL: a frase em que o agente diz que não tem o que o passo pede. */
function motivoLiteral(turnos) {
	const fala = turnos.map((t) => t.agente).join("\n\n");
	const frase = fala
		.split(/(?<=[.!?])\s+/)
		.find((f) =>
			/fora do ar|indispon|n[ãa]o est[áa] configurad|sem identidade|n[ãa]o consigo buscar/i.test(f),
		);
	return frase?.trim() ?? null;
}

async function conduzirCanal(canal) {
	const { conversationId } = await criarSessao(canal);
	const passos = [];
	let botoesAnteriores = [];
	let parouEm = null;
	let motivoDaParada = null;

	for (const passo of ROTEIRO) {
		// Depois do primeiro bloqueio de ambiente, o degrau seguinte não é "não
		// medido": é NÃO ALCANÇADO — a conversa parou antes. Aparece na tabela.
		if (parouEm) {
			passos.push({
				id: passo.id,
				nome: passo.nome,
				status: "parou",
				motivo: `não alcançado — a conversa parou em ${parouEm}`,
				turnos: [],
				artifacts: [],
				gate: null,
			});
			continue;
		}

		if (passo.naoCanal?.[canal]) {
			passos.push({
				id: passo.id,
				nome: passo.nome,
				status: "nao-existe-no-canal",
				motivo: passo.naoCanal[canal],
				turnos: [],
				artifacts: [],
				gate: null,
			});
			continue;
		}

		const bloqueio = typeof passo.bloqueio === "function" ? passo.bloqueio() : passo.bloqueio;
		if (bloqueio) {
			passos.push({
				id: passo.id,
				nome: passo.nome,
				status: "parou",
				motivo: bloqueio,
				turnos: [],
				artifacts: [],
				gate: null,
			});
			parouEm = passo.id;
			motivoDaParada = bloqueio;
			continue;
		}

		const spec = typeof passo.turns === "function" ? passo.turns() : passo.turns;
		const turnos = [];
		for (const turno of spec[canal] ?? []) {
			const retrato =
				canal === "web"
					? await turnoWeb(conversationId, turno)
					: await turnoWhatsApp(conversationId, turno, botoesAnteriores);
			turnos.push(retrato);
			if (retrato.botoes.length) botoesAnteriores = retrato.botoes;
		}

		const espera = passo.espera?.[canal] ?? [];
		const avancou = satisfeita(espera, turnos);

		// Passo cujo valor está na fala (interesse, lance) não "avança" se o degrau
		// de que ele depende nunca entregou a carta: o turno roda, a verdade é PAROU.
		const dependencia = passo.dependeDe ? passos.find((p) => p.id === passo.dependeDe) : null;
		const bloqueadoPelaDependencia = dependencia && dependencia.status !== "avancou";

		const artifacts = [...new Set(turnos.flatMap((t) => t.artifacts))];
		const registro = {
			id: passo.id,
			nome: passo.nome,
			status: avancou && !bloqueadoPelaDependencia ? "avancou" : "parou",
			motivo:
				!avancou && !bloqueadoPelaDependencia
					? [
							`esperado ${espera.join(" | ")}`,
							artifacts.length ? `veio ${artifacts.join(", ")}` : "veio só texto",
							motivoLiteral(turnos),
							passo.motivoConhecido,
						]
							.filter(Boolean)
							.join(" — ")
					: bloqueadoPelaDependencia
						? `depende de ${dependencia.id}, que parou (${dependencia.motivo})`
						: null,
			turnos: turnos.map((t) => ({
				cliente: t.cliente,
				agente: t.agente,
				artifacts: t.artifacts,
				erro: t.erro,
				ms: t.ms,
			})),
			artifacts,
			gate: turnos.find((t) => t.gate)?.gate ?? null,
		};
		passos.push(registro);
	}

	// "Até onde a conversa andou" = o último passo que avançou ANTES do primeiro
	// que parou. Um passo que avança depois de um buraco (ex.: o pedido de contato
	// depois da carta que não veio) não apaga o buraco; fica registrado à parte.
	const primeiroParado = passos.findIndex((p) => p.status !== "avancou");
	const antes = primeiroParado < 0 ? passos : passos.slice(0, primeiroParado);
	const depois = primeiroParado < 0 ? [] : passos.slice(primeiroParado + 1);

	const bloqueioDeAmbiente = parouEm ? { passo: parouEm, motivo: motivoDaParada } : null;

	return {
		canal,
		conversationId,
		ultimoPassoQueAvancou: [...antes].reverse().find((p) => p.status === "avancou")?.id ?? null,
		parouEm: passos[primeiroParado]?.id ?? null,
		motivoDaParada: passos[primeiroParado]?.motivo ?? null,
		bloqueioDeAmbiente,
		avancouDepoisDeParar: depois.filter((p) => p.status === "avancou").map((p) => p.id),
		passos,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Impressão.
// ─────────────────────────────────────────────────────────────────────────────
function imprimirCanal(resultado) {
	console.log(`\n══════ ${resultado.canal} · conversa ${resultado.conversationId} ══════`);
	for (const passo of resultado.passos) {
		const etiqueta =
			passo.status === "avancou"
				? "AVANÇOU"
				: passo.status === "parou"
					? "PAROU"
					: "NÃO EXISTE NO CANAL";
		console.log(`\n── ${passo.id} · ${passo.nome} ──`);
		console.log(`status    : ${etiqueta}`);
		for (const turno of passo.turnos) {
			console.log(`cliente   : ${mascarar(turno.cliente)}`);
			console.log(`agente    : ${turno.agente.replace(/\n/g, "\n            ") || "(sem texto)"}`);
			console.log(`artifacts : ${turno.artifacts.join(", ") || "—"}`);
			if (turno.erro) console.log(`erro      : ${turno.erro}`);
		}
		if (!passo.turnos.length) console.log("cliente   : (nenhum turno enviado)");
		if (passo.gate) console.log(`gate      : ${passo.gate}`);
		if (passo.motivo) console.log(`motivo    : ${passo.motivo}`);
	}
	console.log(
		`\n${resultado.canal}: andou até ${resultado.ultimoPassoQueAvancou ?? "(nenhum)"} · parou em ${resultado.parouEm ?? "(não parou)"}`,
	);
	if (resultado.avancouDepoisDeParar.length) {
		console.log(`avançou mesmo depois de parar: ${resultado.avancouDepoisDeParar.join(", ")}`);
	}
	if (resultado.bloqueioDeAmbiente) {
		console.log(
			`ambiente: o caminho não fecha — parou em ${resultado.bloqueioDeAmbiente.passo}: ${resultado.bloqueioDeAmbiente.motivo}`,
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main.
// ─────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const soJson = argv.includes("--json");
const iCanal = argv.indexOf("--canal");
const canalPedido = iCanal >= 0 ? argv[iCanal + 1] : "ambos";

if (!["web", "whatsapp", "ambos"].includes(canalPedido)) {
	console.error("uso: node scripts/qa/caminho.mjs [--canal web|whatsapp|ambos] [--json]");
	process.exit(2);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
	console.error("ADMIN_EMAIL/ADMIN_PASSWORD não definidos — o simulador exige o login do admin");
	process.exit(2);
}

const canais = canalPedido === "ambos" ? ["web", "whatsapp"] : [canalPedido];

if (!soJson) {
	console.log(`base      : ${BASE}`);
	console.log(`modelo    : ${process.env.AI_MODEL ?? "(?)"}`);
	console.log(`admin     : ${ADMIN_EMAIL}`);
	console.log(
		`identidade: ${TEM_IDENTIDADE ? "E2E_TEST_CPF/CELULAR presentes" : "E2E_TEST_CPF/CELULAR vazias"}`,
	);
	console.log(`roteiro   : docs/qa/roteiro-de-venda.md · provas: scripts/qa/provas-do-caminho.sql`);
}

const resultados = [];
for (const canal of canais) {
	const resultado = await conduzirCanal(canal);
	resultados.push(resultado);
	if (!soJson) imprimirCanal(resultado);
}

const saida = {
	rodada: {
		quando: new Date().toISOString(),
		baseUrl: BASE,
		modelo: process.env.AI_MODEL ?? null,
		identidadeHomologada: TEM_IDENTIDADE,
	},
	canais: resultados.map((r) => ({
		canal: r.canal,
		conversationId: r.conversationId,
		ultimoPassoQueAvancou: r.ultimoPassoQueAvancou,
		parouEm: r.parouEm,
		motivoDaParada: r.motivoDaParada,
		bloqueioDeAmbiente: r.bloqueioDeAmbiente,
		avancouDepoisDeParar: r.avancouDepoisDeParar,
		// `contractClosed` NÃO é resposta deste script: é SQL.
		contractClosed: "NAO MEDIDO AQUI — provas-do-caminho.sql (SQL-D) sobre este conversationId",
		passos: r.passos.map((p) => ({
			id: p.id,
			nome: p.nome,
			status: p.status,
			motivo: p.motivo,
			gate: p.gate,
			artifacts: p.artifacts,
		})),
	})),
	provas: `docker exec -i aja-shared-pg psql -U postgres -d aja_agora_ws_chefe_criterio_do_chat -v conv=<conversationId> -f scripts/qa/provas-do-caminho.sql`,
};

if (!soJson) {
	console.log("\n══ conversationIds ══");
	for (const r of resultados) console.log(`${r.canal}: ${r.conversationId}`);
	console.log("\n══ prova por SQL ══");
	for (const r of resultados) {
		console.log(
			`docker exec -i aja-shared-pg psql -U postgres -d aja_agora_ws_chefe_criterio_do_chat -v conv=${r.conversationId} -f scripts/qa/provas-do-caminho.sql`,
		);
	}
}

console.log(mascarar(JSON.stringify(saida, null, 2)));
