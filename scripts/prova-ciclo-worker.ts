// PROVA DE CICLO DO WORKER — um ciclo de verdade, com ENVIO e ESCRITA fechados.
//
// Responde a pergunta "o ciclo roda?" sem mandar mensagem para ninguém e sem escrever
// em banco. As CONSULTAS do ciclo rodam de verdade; tudo que dispara ação externa
// (template, arte, turno de retomada, CAPI, gravar estado) entra como dublê que só
// registra o que teria acontecido. Se algum ponto alcança o WhatsApp por fora dos deps
// injetáveis, esta prova não mostra — e é por isso que os deps existem.
//
//   DATABASE_URL="<url>" REMARKETING_ATIVO=1 pnpm tsx scripts/prova-ciclo-worker.ts

import { findActiveProposals } from "@/lib/workers/proposal-status-poll";
import {
	ehDaEquipe,
	type LinhaDaRegua,
	listarVencidas as listarVencidasReal,
	runRemarketingCycle,
	simulacaoDoContato,
	toquesDoContato,
} from "@/lib/workers/remarketing-cycle";

const stubagens = new Set<string>();
const marcar = (a: string) => stubagens.add(a);

async function main() {
	// Com PROVA_COM_LINHA_FICTICIA=1 o ciclo recebe UMA linha sintética vencida: é a
	// única forma de ver a DECISÃO de toque sem escrever em banco. A linha é de prova —
	// telefone e conversa são marcados, nada vai para um cliente de verdade.
	const linhaFicticia: LinhaDaRegua = {
		conversationId: "prova-ciclo-conversa",
		contactId: "prova-ciclo-contato",
		objetivo: "qualificar",
		step: 0, // passo 0 = o toque do silêncio; é o que faz a régua ter data de referência
		status: "ATIVO",
		nextTouchAt: null, // preenchida depois, relativa ao `agora` da prova
		ultimoToqueEm: null,
		touches30d: 0,
		motivoSaida: null,
		channel: "whatsapp",
		waId: "PROVA-TELEFONE",
		metadata: {},
		lastInboundAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
		ultimaMensagemDoClienteEm: null,
		phone: "PROVA-TELEFONE",
		nome: "linha de prova",
		optoutDaPessoaEm: null,
		viuOferta: true,
		teveProposta: false,
	};

	const ciclo = await runRemarketingCycle({
		// ESCRITA — fechada: a prova roda contra banco que não queremos alterar.
		listarVencidas: async () =>
			process.env.PROVA_COM_LINHA_FICTICIA === "1"
				? [linhaFicticia]
				: await listarVencidasReal(new Date()),
		toquesDoContato: async (contactId) =>
			contactId === linhaFicticia.contactId ? [] : await toquesDoContato(contactId, new Date()),
		simulacaoDoContato: async (contactId) =>
			contactId === linhaFicticia.contactId ? null : await simulacaoDoContato(contactId),
		telefoneDaEquipe: async (telefone) =>
			telefone === "PROVA-TELEFONE" ? false : await ehDaEquipe(telefone),
		entrarNaRegua: async () => {
			marcar("entrarNaRegua (inscrição não gravada)");
			return 0;
		},
		gravarEstado: async (args) => {
			marcar(`gravarEstado (não gravado) → ${args.conversationId.slice(0, 8)} = ${args.estado}`);
		},
		segurarToquesDaEquipe: async () => {
			marcar("segurarToquesDaEquipe (não gravado)");
			return 0;
		},
		encerrarToquesDeTeste: async () => {
			marcar("encerrarToquesDeTeste (não gravado)");
			return 0;
		},
		compensarToque: async () => {
			marcar("compensarToque (não gravado)");
		},
		// ENVIO — o ponto da prova: nada sai.
		enviarTemplate: async (args) => {
			marcar(
				`TEMPLATE NÃO MANDADO → ${args.to} (chave: ${args.usageKeys.join(", ")}, canal: ${args.channel})`,
			);
			// `void` é tratado como sucesso pelo ciclo; o ponto da prova é que NADA
			// saiu para a Meta — não que o envio falhou.
			return undefined;
		},
		enviarArte: async (args) => {
			marcar(`ARTE NÃO MANDADA → ${args.to} (${args.link})`);
		},
		dispararTurno: async (args) => {
			marcar(`TURNO DE RETOMADA NÃO RODADO → conversa ${args.conversationId.slice(0, 8)}`);
		},
		despacharConversoes: async () => {
			marcar("CAPI não despachado");
			return { ignorado: true };
		},
	});

	console.log("[ciclo remarketing]", JSON.stringify(ciclo));

	// Poll de proposta: só a LEITURA (a escrita do ciclo — UPDATE em bevi_proposals e
	// a marcação de perdidos — não é injetável, então fica fora da prova).
	const linhas = await findActiveProposals();
	console.log(`[ciclo proposta] ${linhas.length} proposta(s) ativa(s) lida(s), 0 escrita`);

	console.log(`[envios] 0 mensagem real · ${stubagens.size} ação stubada`);
	for (const s of stubagens) console.log("  ·", s);
}

main().catch((err) => {
	console.error("[prova-ciclo] FALHA:", err instanceof Error ? err.message : err);
	process.exit(1);
});
