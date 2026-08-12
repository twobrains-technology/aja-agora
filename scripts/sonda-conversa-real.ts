// Sonda de CONVERSA REAL — dirige o app de verdade (HTTP, modelo de verdade) e
// devolve a fala literal do agente nos turnos que importam.
//
// Por que existe: FIX-391, FIX-392 e FIX-393 são correções de CONTEXTO (o que o
// servidor entrega ao modelo). Teste roteirizado prova a consequência
// determinística, e prova bem — mas não prova que o modelo real mudou de
// comportamento. O que decide isso é a FALA, e a fala está no stream HTTP, não
// em pixels: por isso esta sonda vale mais que um smoke visual pra estes três.
//
// Ela NÃO julga. Imprime o que o agente disse, literal, e deixa o veredito pra
// quem lê — mesma separação coletor/juiz do smoke guiado.
//
// Pré-requisitos:
//   - app de pé (skill local-dev): http://aja-develop.orb.local
//   - gateway LiteLLM shared de pé + túnel SSM (skill tunel-litellm)
//
// Uso:
//   pnpm sonda:conversa                    # todos os roteiros
//   pnpm sonda:conversa fix-392            # um roteiro
// Precisa ser o PRIMEIRO import: carrega .env e traduz DNS de container→host.
import "./_env-host";
const BASE = process.env.SONDA_BASE_URL ?? "http://aja-develop.orb.local";

type Turno = {
	user: string;
	nota: string;
	/** Clique de card, quando o passo não é texto livre. O form de CPF é o caso
	 * central: na web o CPF NÃO entra por conversa (o servidor recusa, e está
	 * certo — LGPD), então sem a action a jornada nunca passa do `identify`. */
	action?: Record<string, unknown>;
};
type Roteiro = { id: string; titulo: string; olharPara: string; turnos: Turno[] };

/** Os roteiros reproduzem o caminho exato dos prints de 27-28/07. */
const ROTEIROS: Roteiro[] = [
	{
		id: "fix-389",
		titulo: "FIX-389 — segmento serviços não é oferecido nem quebra",
		olharPara:
			"a saudação lista quais segmentos? a resposta menciona serviços? aparece erro de integração?",
		turnos: [
			{ user: "oi", nota: "saudação — não pode oferecer serviços" },
			{
				user: "quero um consórcio de serviços, pra fazer uma reforma",
				nota: "deve recusar com elegância, sem erro cru",
			},
		],
	},
	{
		id: "fix-393",
		titulo: "FIX-393 — turno do formulário não faz segunda pergunta",
		olharPara:
			"no turno em que o form de CPF entra, a fala tem quantas perguntas? menciona entrada/lance/prazo?",
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um apartamento", nota: "" },
			{ user: "Daniel", nota: "nome" },
			{ user: "um apartamento de 700 mil", nota: "" },
			{ user: "é pra sair do aluguel", nota: "motivo → próximo é o identify (form de CPF)" },
		],
	},
	{
		id: "fix-392",
		titulo: "FIX-392 — não presume a experiência do cliente",
		olharPara:
			'o agente afirma "já que é sua primeira vez" ANTES da resposta? já entrega a explicação? fala "carro" numa conversa de apartamento?',
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um apartamento", nota: "" },
			{ user: "Marina", nota: "" },
			{ user: "um apartamento de 700 mil", nota: "" },
			{ user: "quero sair do aluguel", nota: "" },
			{
				user: "Enviei meus dados pra buscar as ofertas",
				nota: "form de CPF (action, como o card faz)",
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: "33880599858", celular: "11995432576", lgpd: true },
					label: "Enviei meus dados pra buscar as ofertas",
				},
			},
			{ user: "e agora?", nota: "aqui o gate experience deve estar ativo" },
		],
	},
	{
		id: "fix-387",
		titulo: "FIX-387 — 'faz sentido' aceita o embutido e move a carta",
		olharPara:
			"depois do 'faz sentido': lanceEmbutido=true e creditMax vira 1.000.000? (conferir NO BANCO, não na prosa)",
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um apartamento", nota: "" },
			{ user: "Bernardo", nota: "nome" },
			{ user: "um apartamento de 700 mil", nota: "valor do bem" },
			{ user: "quero sair do aluguel", nota: "motivo" },
			{
				user: "Enviei meus dados pra buscar as ofertas",
				nota: "clique de card",
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: "33880599858", celular: "11995432576", lgpd: true },
					label: "Enviei meus dados pra buscar as ofertas",
				},
			},
			{
				user: "Já conheço",
				nota: "clique de card",
				action: { kind: "gate", gate: "experience", value: "returning", label: "Já conheço" },
			},
			{
				user: "Tenho uma reserva",
				nota: "clique de card",
				action: { kind: "gate", gate: "lance", value: "yes", label: "Tenho uma reserva" },
			},
			{
				user: "R$ 200 mil",
				nota: "clique de card",
				action: {
					kind: "gate",
					gate: "lance-value",
					value: { lanceValue: 200000 },
					label: "R$ 200 mil",
				},
			},
			{ user: "e se eu usar lance embutido?", nota: "abre a conversa do embutido" },
			{ user: "faz sentido", nota: "🔴 O TURNO DO BUG" },
		],
	},
	{
		id: "fix-388",
		titulo: "FIX-388 — recusar o embutido não fecha o plano",
		olharPara:
			"depois da recusa: escolha fica ausente e creditMax fica em 700.000? (conferir NO BANCO)",
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um apartamento", nota: "" },
			{ user: "Marina", nota: "nome" },
			{ user: "um apartamento de 700 mil", nota: "valor do bem" },
			{ user: "quero sair do aluguel", nota: "motivo" },
			{
				user: "Enviei meus dados pra buscar as ofertas",
				nota: "clique de card",
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: "33880599858", celular: "11995432576", lgpd: true },
					label: "Enviei meus dados pra buscar as ofertas",
				},
			},
			{
				user: "Já conheço",
				nota: "clique de card",
				action: { kind: "gate", gate: "experience", value: "returning", label: "Já conheço" },
			},
			{
				user: "Tenho uma reserva",
				nota: "clique de card",
				action: { kind: "gate", gate: "lance", value: "yes", label: "Tenho uma reserva" },
			},
			{
				user: "R$ 200 mil",
				nota: "clique de card",
				action: {
					kind: "gate",
					gate: "lance-value",
					value: { lanceValue: 200000 },
					label: "R$ 200 mil",
				},
			},
			{ user: "e se eu usar lance embutido?", nota: "abre a conversa do embutido" },
			{ user: "não, prefiro usar só o meu dinheiro", nota: "🔴 O TURNO DO BUG — recusa" },
		],
	},
	// ── Rodada 2026-08-12: os defeitos levantados na varredura de produção ──
	{
		id: "nome-de-frase",
		titulo: "Nome — frase e rótulo de botão não podem virar nome do lead",
		olharPara:
			'o agente passa a chamar o cliente de "Ainda" ou "Quitar"? o nome só é adotado quando ele de fato se apresenta?',
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um carro", nota: "" },
			{
				user: "Ainda não sei bem qual modelo",
				nota: "🔴 produção: virava contact_name = 'Ainda'",
			},
			{
				user: "Quitar o financiamento atual",
				nota: "🔴 produção: rótulo de botão virava contact_name = 'Quitar' (5 leads assim)",
			},
			{ user: "Pode me chamar de Rafael", nota: "agora sim — daqui pra frente é Rafael" },
		],
	},
	{
		id: "reveal-sem-narracao",
		titulo: "Reveal — sem narrar falha da máquina e sem bolha de pontuação",
		olharPara:
			'aparece "travou", "de outro jeito", "tentar de novo", "um segundo"? algum balão só com ")" ou "..."? o agente repete a mesma frase em turnos seguidos?',
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um carro", nota: "" },
			{ user: "Rafael", nota: "nome" },
			{ user: "uns 90 mil", nota: "valor do bem" },
			{ user: "é pra trabalhar", nota: "motivo" },
			{
				user: "Enviei meus dados pra buscar as ofertas",
				nota: "form de CPF (clique de card)",
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: "33880599858", celular: "11995432576", lgpd: true },
					label: "Enviei meus dados pra buscar as ofertas",
				},
			},
			{ user: "e agora?", nota: "🔴 o turno do reveal — onde a Bruna leu 'a busca travou'" },
		],
	},
	{
		id: "fecho-sem-voltar",
		titulo: "Fechamento — o funil não volta a perguntar a experiência",
		olharPara:
			'depois de escolher a cota, o agente pergunta "já fez consórcio antes?" ou segue pro contrato? o contract_form aparece?',
		turnos: [
			{ user: "oi", nota: "" },
			{ user: "quero comprar um carro", nota: "" },
			{ user: "Rafael", nota: "nome" },
			{ user: "uns 90 mil", nota: "valor do bem" },
			{ user: "é pra trabalhar", nota: "motivo" },
			{
				user: "Enviei meus dados pra buscar as ofertas",
				nota: "form de CPF",
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: "33880599858", celular: "11995432576", lgpd: true },
					label: "Enviei meus dados pra buscar as ofertas",
				},
			},
			{
				// O gate `credit` pode pedir confirmação do valor no card (slider). Em
				// produção foi o que aconteceu, e sem este turno a jornada parava
				// antes do reveal — a sonda não clica em card. O clique explícito
				// deixa o roteiro determinístico nos dois ambientes.
				user: "Valor do bem: R$ 90.000",
				nota: "confirma o valor no card",
				action: {
					kind: "gate",
					gate: "credit",
					value: { creditMax: 90000 },
					label: "Valor do bem: R$ 90.000",
				},
			},
			{
				user: "Quero essa mesma, bora fechar",
				nota: "🔴 o turno do Caua — aqui o `experience` atropelava e matava o contract_form",
			},
			{ user: "isso, quero contratar", nota: "reforça o fecho" },
			{
				// FIX-386 — contratar exige um SIM explícito ao card de decisão. Sem
				// este turno o roteiro parava um passo antes do formulário e dava a
				// impressão errada de que o funil tinha travado.
				user: "sim, quero essa",
				nota: "o sim que o FIX-386 exige — aqui o contract_form tem que aparecer",
			},
		],
	},
];

/** Lê o stream do /api/chat e separa o que o cliente VÊ: texto e artifacts. */
async function turno(
	conversationId: string | null,
	historico: Array<{ role: "user" | "assistant"; text: string }>,
	texto: string,
	action?: Record<string, unknown>,
): Promise<{ conversationId: string | null; fala: string; artifacts: string[] }> {
	const messages = [...historico, { role: "user" as const, text: texto }].map((m, i) => ({
		id: `m${i}`,
		role: m.role,
		parts: [{ type: "text", text: m.text }],
	}));

	const res = await fetch(`${BASE}/api/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			...(conversationId ? { conversationId } : {}),
			messages,
			...(action ? { action } : {}),
		}),
	});
	if (!res.ok || !res.body) {
		return {
			conversationId,
			fala: `[HTTP ${res.status}: ${(await res.text()).slice(0, 200)}]`,
			artifacts: [],
		};
	}

	const bruto = await res.text();
	let fala = "";
	const artifacts: string[] = [];
	let convId = conversationId;

	for (const linha of bruto.split("\n")) {
		const l = linha.trim();
		if (!l.startsWith("data:")) continue;
		const cru = l.slice(5).trim();
		if (!cru || cru === "[DONE]") continue;
		try {
			const ev = JSON.parse(cru) as Record<string, unknown>;
			if (ev.type === "text-delta" && typeof ev.delta === "string") fala += ev.delta;
			if (ev.type === "data-artifact") {
				const d = ev.data as { type?: string } | undefined;
				if (d?.type) artifacts.push(d.type);
			}
			if (typeof ev.conversationId === "string") convId = ev.conversationId;
		} catch {
			// linha não-JSON do protocolo — ignora
		}
	}
	return { conversationId: convId, fala: fala.trim(), artifacts };
}

async function rodar(r: Roteiro) {
	console.log(`\n${"═".repeat(78)}`);
	console.log(`${r.titulo}`);
	console.log(`OLHAR PARA: ${r.olharPara}`);
	console.log("═".repeat(78));

	// O stream NÃO devolve o conversationId; a rota aceita o id vindo do cliente
	// (`body.conversationId ?? body.id`), que é como o front faz. Sem isto cada
	// turno abriria uma conversa nova e a jornada nunca se formava.
	let convId: string | null = crypto.randomUUID();
	const historico: Array<{ role: "user" | "assistant"; text: string }> = [];

	for (const t of r.turnos) {
		const out = await turno(convId, historico, t.user, t.action);
		convId = out.conversationId;
		historico.push({ role: "user", text: t.user });
		if (out.fala) historico.push({ role: "assistant", text: out.fala });

		console.log(`\n👤 ${t.user}${t.nota ? `   ← ${t.nota}` : ""}`);
		console.log(`🤖 ${out.fala || "[sem texto]"}`);
		if (out.artifacts.length > 0) console.log(`   📦 cards: ${out.artifacts.join(", ")}`);
	}
	console.log(`\n(conversa: ${convId})`);
}

async function main() {
	const filtro = process.argv[2];
	const alvos = filtro ? ROTEIROS.filter((r) => r.id.includes(filtro)) : ROTEIROS;
	if (alvos.length === 0) {
		console.error(
			`Nenhum roteiro casa com "${filtro}". Disponíveis: ${ROTEIROS.map((r) => r.id).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}
	console.log(`Sonda de conversa real — ${BASE}`);
	for (const r of alvos) {
		try {
			await rodar(r);
		} catch (e) {
			console.log(`\n✗ ${r.id} abortou: ${(e as Error).message}`);
		}
	}
}

void main();
