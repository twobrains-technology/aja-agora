/**
 * Builder do system prompt do COPILOTO DE MESA.
 *
 * Spec de negócio: docs/visao/mesa-de-operacao.md §5 (o copiloto) + DEC-C
 * (injeção do PDF full-text + prompt caching, não RAG).
 * Decisões de design: docs/decisoes/blocos/2026-06-21-bloco-mesa-c.md.
 *
 * O copiloto orienta o ATENDENTE DE MESA (operador humano), NÃO o cliente, a
 * formalizar o contrato na administradora — com o manual de procedimento
 * daquela administradora injetado no contexto.
 *
 * Dois blocos, espelhando o agente principal (system-prompt.ts → builder.ts):
 *   - `stable`  : persona + regras + manual(is) full-text da administradora.
 *                 É o bloco CACHEÁVEL (index.ts aplica cacheControl ephemeral).
 *                 Dentro de um handoff a administradora é fixa → byte-idêntico
 *                 entre turnos → cache da Anthropic dá hit.
 *   - `dynamic` : dados voláteis do caso (cota/oferta + cliente + data). Fora
 *                 do cache pra não invalidar o manual a cada turno.
 */

export interface MesaCopilotDoc {
	titulo: string;
	tipo: string;
	/** texto extraído do PDF — null quando o PDF ainda não foi processado. */
	textoExtraido: string | null;
}

export interface MesaCopilotCaso {
	/** Nome da administradora da cota escolhida (resolvido do handoff). */
	administradoraNome: string | null;
	/** Docs ativos da administradora (manual/tabela/anexos). Só os com texto entram. */
	docs: MesaCopilotDoc[];
	// ── Cota / oferta escolhida (snapshot da Bevi) ──
	grupo?: string | null;
	creditValue?: string | number | null;
	monthlyPayment?: string | number | null;
	termMonths?: number | null;
	segmento?: string | null;
	proposalLink?: string | null;
	// ── Cliente (mínimo necessário pra contratar) ──
	clienteNome?: string | null;
	clienteContato?: string | null;
	/** Data corrente (default: agora) — day-precision no prompt. */
	currentDate?: Date;
	/**
	 * `caso` (default): orientação de contratação de um cliente transbordado.
	 * `avulso`: consulta de manual sem caso/cliente vinculado — o atendente só quer tirar
	 * dúvida sobre o procedimento de uma administradora específica (fora de um atendimento).
	 */
	modo?: "caso" | "avulso";
}

export type MesaCopilotPromptBlocks = { stable: string; dynamic: string };

const PERSONA = `<role>
Você é o COPILOTO DE OPERAÇÃO da mesa Aja Agora. Você orienta o ATENDENTE DE MESA — um
operador humano nosso — a formalizar o contrato de consórcio na administradora, passo a
passo, com base no MANUAL de procedimento daquela administradora (abaixo).
</role>

<como_voce_atua>
- Quem te lê é o ATENDENTE, não o cliente. Fale com ele como um colega experiente de mesa.
- O MANUAL da administradora é a sua fonte da verdade do procedimento: quais telas, campos,
  ordem das etapas, regras e documentos exigidos para contratar naquela administradora.
- Pergunta de execução ("como faço X?") → responda com passo a passo numerado, prático.
- Dúvida pontual ("e se o cliente não tiver comprovante?") → responda objetivo, citando a
  regra do manual quando houver.
- Se o manual NÃO cobre o que foi perguntado, diga isso com franqueza e oriente pelo
  procedimento geral de consórcio — sem inventar regra específica daquela administradora.
- Responda SEMPRE em português do Brasil.
</como_voce_atua>

<regras_invioláveis>
- NUNCA exponha mensagem de erro técnico, stack trace, nome de variável, tabela de banco,
  JSON cru ou qualquer detalhe de implementação interna. Se algo der errado, diga em
  linguagem natural o que o atendente deve fazer.
- É PROIBIDO narrar o mecanismo do sistema (meta-narrativa): nada de "o sistema vai te
  guiar", "estou processando", "vou injetar o manual". Apenas oriente o atendente.
- Você NÃO fala com o cliente final nem escreve mensagens dirigidas a ele, a menos que o
  atendente peça explicitamente um texto para repassar ao cliente.
- NÃO invente dados do caso que não estejam no dossiê — se faltar algo, peça ao atendente.
</regras_invioláveis>`;

function renderManual(administradoraNome: string | null, docs: MesaCopilotDoc[]): string {
	const adm = administradoraNome?.trim() || "(administradora não identificada)";
	const withText = docs.filter((d) => d.textoExtraido && d.textoExtraido.trim().length > 0);

	if (withText.length === 0) {
		return `<manual_administradora administradora="${adm}">
Nenhum manual processado disponível para esta administradora. Oriente o atendente com base no
procedimento geral de consórcio e peça para o admin subir o manual de contratação desta
administradora no cadastro de documentos.
</manual_administradora>`;
	}

	// Ordena por tipo (manual primeiro) e mantém ordem de entrada como desempate.
	const tipoOrder = (t: string) => (t === "manual" ? 0 : t === "tabela" ? 1 : 2);
	const ordered = [...withText].sort((a, b) => tipoOrder(a.tipo) - tipoOrder(b.tipo));

	const sections = ordered
		.map(
			(d) =>
				`<documento titulo="${d.titulo}" tipo="${d.tipo}">\n${d.textoExtraido?.trim()}\n</documento>`,
		)
		.join("\n\n");

	return `<manual_administradora administradora="${adm}">
${sections}
</manual_administradora>`;
}

function fmtMoney(v: string | number | null | undefined): string | null {
	if (v === null || v === undefined || v === "") return null;
	const n = typeof v === "number" ? v : Number(v);
	if (Number.isNaN(n)) return String(v);
	return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function renderCaso(caso: MesaCopilotCaso): string {
	const now = caso.currentDate ?? new Date();
	const currentDateISO = now.toISOString().slice(0, 10);
	const adm = caso.administradoraNome?.trim() || "(não identificada)";

	const lines: string[] = [];
	lines.push(`Administradora: ${adm}`);
	if (caso.clienteNome) lines.push(`Cliente: ${caso.clienteNome}`);
	if (caso.clienteContato) lines.push(`Contato do cliente: ${caso.clienteContato}`);

	const cota: string[] = [];
	if (caso.segmento) cota.push(`segmento ${caso.segmento}`);
	if (caso.grupo) cota.push(`grupo ${caso.grupo}`);
	const credito = fmtMoney(caso.creditValue);
	if (credito) cota.push(`crédito ${credito}`);
	const parcela = fmtMoney(caso.monthlyPayment);
	if (parcela) cota.push(`parcela ${parcela}/mês`);
	if (caso.termMonths) cota.push(`prazo ${caso.termMonths} meses`);
	if (cota.length > 0) lines.push(`Cota escolhida: ${cota.join(", ")}.`);

	if (caso.proposalLink) lines.push(`Proposta Bevi: ${caso.proposalLink}`);

	const lembrete =
		caso.modo === "avulso"
			? "CONSULTA AVULSA: o atendente está tirando dúvida sobre o manual desta administradora, " +
				"SEM um caso/cliente vinculado. Responda objetivo, com base no manual. Se ele perguntar " +
				"sobre um cliente específico, lembre que o atendimento é aberto quando um cliente é " +
				"transbordado pra mesa."
			: "Oriente o atendente a executar ESTE caso na administradora acima, seguindo o manual.";

	return `<caso>
${lines.join("\n")}
Data de hoje: ${currentDateISO}
</caso>

<lembrete>
${lembrete}
</lembrete>`;
}

export function buildMesaCopilotPrompt(caso: MesaCopilotCaso): MesaCopilotPromptBlocks {
	const stable = `${PERSONA}

${renderManual(caso.administradoraNome, caso.docs)}`;

	const dynamic = renderCaso(caso);

	return { stable, dynamic };
}
