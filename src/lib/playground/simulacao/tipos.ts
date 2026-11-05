// ── dados e canal ─────────────────────────────────────────────────────────
export type FonteDeDados = "duble" | "bevi-dev";
export type CatalogoId = "padrao" | "grande" | "canopus-quase-iguais";
export type FilaDuble = { atendentes: number; horaFixa?: string }; // "03:00"
export type DadosDaSimulacao = {
	fonteDeDados: FonteDeDados;
	catalogo: CatalogoId; // ignorado quando fonteDeDados = "bevi-dev"
	fila: FilaDuble;
};
export type ModoDeConduta = "antes" | "depois";

// ── perfis (U2 implementa; U4 consome) ───────────────────────────────────
export type PerfilId =
	| "caminho-feliz"
	| "nervoso-bugado"
	| "recusa-telefone"
	| "explorador"
	| "quer-ver-todas"
	| "pede-atendente"
	| "madrugada-sem-atendente"
	| "objecao"
	| "some-e-volta"
	| "voltei-sem-nada"
	| "silencio-total"
	| "card-travado";

export type PerfilDeCliente = {
	id: PerfilId;
	rotulo: string; // pt-BR com acento: "Recusa o telefone"
	persona: string; // texto de system da IA-cliente
	objetivo: string;
	abertura: string; // 1ª fala, fixa
	roteiro?: { depoisDoTurno: number; texto: string; vezes: number }[]; // falas forçadas
	/** Índices (0-based) dos turnos em que o lead VOLTA ou RETARDA — a retomada leva algo novo
	 *  (oferta, número de ferramenta, pergunta nova); medido por `retomada-sem-novidade`. */
	turnosDeRetorno?: number[];
	maxTurnos: number; // teto duro do orquestrador
	esperaProposta: boolean; // chegarAProposta é sucesso (true) ou só informativo
	esperaFila: boolean; // chamouFila é esperado (pede-atendente, madrugada)
	dados: DadosDaSimulacao; // padrão do perfil; a tela pode sobrescrever fonte
};

// ── rota simulacao/cliente (U2 implementa; U4 chama) ─────────────────────
export type FalaDoHistorico = { autor: "cliente" | "vendedor"; texto: string; cards: string[] };
export type PedidoDeFalaDoCliente = {
	perfilId: PerfilId;
	historico: FalaDoHistorico[];
	turno: number; // 0 = abertura (a rota devolve perfil.abertura sem chamar LLM)
	horaFixa?: string;
};
export type EstadoDoCliente = "continua" | "objetivo-atingido" | "desiste";
export type RespostaDeFalaDoCliente = {
	texto: string;
	estado: EstadoDoCliente;
	origem: "semente" | "ia";
};

// ── NDJSON do chat do playground, já lido (U1 produz) ────────────────────
export type BalaoFinal = { texto: string; promessa: { rotulo: string; motivo: string } | null };
export type ToolCallLido = { toolName: string; input: unknown; toolCallId: string };
export type ArtifactLido = {
	artifactType: string;
	payload: Record<string, unknown>;
	toolCallId: string;
};
export type TurnoLido = {
	conversationId: string | null;
	dadosEcoados: DadosDaSimulacao | null; // `inicio.dados` quando a rota devolver (Q1); senão null
	caixaVersao: string | number | null; // `não confirmei` o tipo; guarda crua
	textoDosEventos: string[]; // balões montados de text-delta/text-boundary
	baloesFinais: BalaoFinal[]; // do evento `final`
	toolCalls: ToolCallLido[];
	artifacts: ArtifactLido[];
	finish: { reason: string } | null;
	erro: string | null; // linha `erro` ou falha HTTP
	finalRecebido: boolean;
	linhasInvalidas: number;
	httpStatus: number;
};
export type TurnoDaSimulacao = {
	indice: number; // 0-based
	cliente: { texto: string; origem: "semente" | "ia" | "roteiro" };
	vendedor: TurnoLido;
	duracaoMs: number;
};

// ── marcações (U1 implementa; U4 mostra) ─────────────────────────────────
export type MarcacaoId =
	| "chegou-a-proposta"
	| "pedido-repetido"
	| "card-que-nao-apareceu"
	| "resposta-cortada"
	| "turno-sem-resposta"
	| "numero-sem-ferramenta"
	| "chamou-fila"
	| "falou-prazo"
	| "retomada-sem-novidade";
export type StatusDaMarcacao = "ACIONADA" | "LIMPA" | "NAO_APLICAVEL";
export type Gravidade = "DEFEITO" | "SUCESSO" | "INFORMATIVA";
export type Ocorrencia = { turno: number; evidencia: string };
export type Marcacao = {
	id: MarcacaoId;
	status: StatusDaMarcacao;
	gravidade: Gravidade;
	ocorrencias: Ocorrencia[];
	motivoNaoAplicavel?: string;
};
export type ContextoDeMarcacao = {
	perfil: Pick<PerfilDeCliente, "id" | "esperaProposta" | "esperaFila" | "turnosDeRetorno">;
	dados: DadosDaSimulacao;
	numerosConhecidos: number[] | null; // null = fonte desconhecida (bevi-dev)
};

// ── resultado e exportação (U1 implementa; U4 exporta) ───────────────────
export type VereditoDoPerfil = "APROVADO" | "REPROVADO" | "INCONCLUSIVO";
export type MotivoDeParada =
	| "objetivo-atingido"
	| "desistencia"
	| "limite-de-turnos"
	| "erro-do-vendedor"
	| "erro-do-cliente"
	| "cancelado";
export type ResultadoDoPerfil = {
	perfilId: PerfilId;
	dados: DadosDaSimulacao;
	modo: ModoDeConduta;
	turnos: TurnoDaSimulacao[];
	marcacoes: Marcacao[];
	parada: MotivoDeParada;
	veredito: VereditoDoPerfil;
	iniciadoEm: string; // ISO
	achados: string[]; // ex.: "finishReason indisponível (turno-livre.ts:1808)"
};
export type ExportacaoDaSimulacao = {
	versao: 1;
	geradoEm: string;
	resultados: ResultadoDoPerfil[];
};

// ── estado de execução da tela (rótulo de TEXTO sempre; nunca só cor) ────
export type EstadoDeExecucao =
	| "NAO_EXECUTADO"
	| "EM_ANDAMENTO"
	| "CONCLUIDO"
	| "CANCELADO"
	| "ERRO";
export const ROTULO_DE_ESTADO: Record<EstadoDeExecucao, string> = {
	NAO_EXECUTADO: "Não executado",
	EM_ANDAMENTO: "Em andamento",
	CONCLUIDO: "Concluído",
	CANCELADO: "Cancelado",
	ERRO: "Erro",
};
export const ROTULO_DE_VEREDITO: Record<VereditoDoPerfil, string> = {
	APROVADO: "Aprovado",
	REPROVADO: "Reprovado",
	INCONCLUSIVO: "Inconclusivo",
};
export const ROTULO_DE_MARCACAO: Record<MarcacaoId, string> = {
	"chegou-a-proposta": "Chegou à proposta",
	"pedido-repetido": "Pedido repetido do mesmo dado",
	"card-que-nao-apareceu": "Card que não apareceu",
	"resposta-cortada": "Resposta cortada",
	"turno-sem-resposta": "Turno sem resposta",
	"numero-sem-ferramenta": "Número sem ferramenta",
	"chamou-fila": "Chamou a fila de vendedores",
	"falou-prazo": "Prometeu prazo",
	"retomada-sem-novidade": "Retomada sem novidade",
};
export const ROTULO_DE_STATUS: Record<StatusDaMarcacao, string> = {
	ACIONADA: "ACIONADA",
	LIMPA: "Limpa",
	NAO_APLICAVEL: "Não aplicável",
};

// ── funções que as unidades exportam (assinaturas fixas) ─────────────────
export type ProdutorDeFala = (p: PedidoDeFalaDoCliente) => Promise<RespostaDeFalaDoCliente>;
export type ChamadaDeChat = (
	corpo: Record<string, unknown>,
	sinal?: AbortSignal,
) => Promise<Response>;
