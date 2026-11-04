// Orquestrador da simulação (P12): a IA-cliente conversa com o vendedor, turno a turno, pelo
// mesmo endpoint do playground. Client-safe: sem `server-only`, sem DB; o `fetch` é injetado.
import { lerTurno, turnoVazio } from "./ler-turno";
import { marcarSimulacao } from "./marcacoes";
import { vereditoDoPerfil } from "./relatorio";
import type {
	CatalogoId,
	ChamadaDeChat,
	DadosDaSimulacao,
	EstadoDeExecucao,
	FalaDoHistorico,
	Marcacao,
	ModoDeConduta,
	MotivoDeParada,
	PerfilDeCliente,
	ProdutorDeFala,
	ResultadoDoPerfil,
	TurnoDaSimulacao,
	TurnoLido,
} from "./tipos";

export const ACHADO_FINISH_REASON =
	"finishReason do modelo indisponível: o evento `finish` sempre diz `complete` (turno-livre.ts:1808)";

/** Padrão assumido do servidor: só o que difere dele vai no corpo do chat. */
export const PADRAO_DO_SERVIDOR: DadosDaSimulacao = {
	fonteDeDados: "duble",
	catalogo: "padrao",
	fila: { atendentes: 2 },
};

export type DepsDaSimulacao = {
	chamarChat: ChamadaDeChat;
	falaDoCliente: ProdutorDeFala;
	agora?: () => number;
	numerosConhecidos?: (c: CatalogoId) => number[];
};

export type OpcoesDaSimulacao = {
	perfil: PerfilDeCliente;
	dados: DadosDaSimulacao;
	modo: ModoDeConduta;
	perfilDoPlaygroundId?: string;
	sinal?: AbortSignal;
	aoTurno?: (t: TurnoDaSimulacao, parcial: Marcacao[]) => void;
	aoEstado?: (e: EstadoDeExecucao) => void;
};

/** A rota do chat exige perfilId para "depois": sem perfil do playground, vale a conduta viva. */
export function modoEfetivo(o: OpcoesDaSimulacao): ModoDeConduta {
	return o.modo === "depois" && !o.perfilDoPlaygroundId ? "antes" : o.modo;
}

export function corpoDoChat(
	o: OpcoesDaSimulacao,
	conversationId: string | null,
	mensagem: string,
): Record<string, unknown> {
	const corpo: Record<string, unknown> = { modo: modoEfetivo(o), mensagem };
	if (conversationId) corpo.conversationId = conversationId;
	if (o.perfilDoPlaygroundId) corpo.perfilId = o.perfilDoPlaygroundId;
	const { dados } = o;
	if (dados.fonteDeDados !== PADRAO_DO_SERVIDOR.fonteDeDados)
		corpo.fonteDeDados = dados.fonteDeDados;
	if (dados.fonteDeDados === "duble") {
		if (dados.catalogo !== PADRAO_DO_SERVIDOR.catalogo) corpo.catalogo = dados.catalogo;
		const difereFila =
			dados.fila.atendentes !== PADRAO_DO_SERVIDOR.fila.atendentes ||
			dados.fila.horaFixa !== undefined;
		if (difereFila) {
			corpo.dublesDaFila = {
				atendentes: dados.fila.atendentes,
				...(dados.fila.horaFixa ? { horaFixa: dados.fila.horaFixa } : {}),
			};
		}
	}
	return corpo;
}

function textoDoVendedor(v: TurnoLido): string {
	const finais = v.baloesFinais.map((b) => b.texto);
	return (finais.length > 0 ? finais : v.textoDosEventos).join("\n").trim();
}

/** Fala forçada do roteiro: `vezes` turnos seguidos depois do turno `depoisDoTurno`. */
function falaDoRoteiro(perfil: PerfilDeCliente, indice: number): string | null {
	for (const r of perfil.roteiro ?? []) {
		if (indice > r.depoisDoTurno && indice <= r.depoisDoTurno + r.vezes) return r.texto;
	}
	return null;
}

function estadoFinal(parada: MotivoDeParada): EstadoDeExecucao {
	if (parada === "cancelado") return "CANCELADO";
	if (parada === "erro-do-vendedor" || parada === "erro-do-cliente") return "ERRO";
	return "CONCLUIDO";
}

export async function rodarSimulacao(
	o: OpcoesDaSimulacao,
	d: DepsDaSimulacao,
): Promise<ResultadoDoPerfil> {
	const { perfil, dados } = o;
	const agora = d.agora ?? Date.now;
	const iniciadoEm = new Date(agora()).toISOString();
	const turnos: TurnoDaSimulacao[] = [];
	const historico: FalaDoHistorico[] = [];
	let conversationId: string | null = null;
	let parada: MotivoDeParada = "limite-de-turnos";

	const marcar = (): Marcacao[] => {
		const eco = turnos.find((t) => t.vendedor.dadosEcoados !== null)?.vendedor.dadosEcoados ?? null;
		const numerosConhecidos =
			eco !== null && eco.fonteDeDados === "duble" && d.numerosConhecidos
				? d.numerosConhecidos(eco.catalogo)
				: null;
		return marcarSimulacao(turnos, {
			perfil: {
				id: perfil.id,
				esperaProposta: perfil.esperaProposta,
				esperaFila: perfil.esperaFila,
			},
			dados,
			numerosConhecidos,
		});
	};

	o.aoEstado?.("EM_ANDAMENTO");

	for (let indice = 0; indice < perfil.maxTurnos; indice++) {
		if (o.sinal?.aborted) {
			parada = "cancelado";
			break;
		}

		let fala: { texto: string; origem: "semente" | "ia" | "roteiro" };
		const forcada = indice > 0 ? falaDoRoteiro(perfil, indice) : null;
		if (forcada !== null) {
			fala = { texto: forcada, origem: "roteiro" };
		} else {
			try {
				const r = await d.falaDoCliente({
					perfilId: perfil.id,
					historico,
					turno: indice,
					...(dados.fila.horaFixa ? { horaFixa: dados.fila.horaFixa } : {}),
				});
				if (o.sinal?.aborted) {
					parada = "cancelado";
					break;
				}
				if (r.estado === "objetivo-atingido") {
					parada = "objetivo-atingido";
					break;
				}
				if (r.estado === "desiste") {
					parada = "desistencia";
					break;
				}
				fala = { texto: r.texto, origem: r.origem };
			} catch {
				parada = o.sinal?.aborted ? "cancelado" : "erro-do-cliente";
				break;
			}
		}

		const inicio = agora();
		let vendedor: TurnoLido;
		try {
			const resp = await d.chamarChat(corpoDoChat(o, conversationId, fala.texto), o.sinal);
			vendedor = await lerTurno(resp);
		} catch (err) {
			if (o.sinal?.aborted) {
				parada = "cancelado";
				break;
			}
			vendedor = {
				...turnoVazio(0),
				erro: err instanceof Error ? err.message : "Falha de rede",
			};
		}
		if (vendedor.conversationId) conversationId = vendedor.conversationId;

		const turno: TurnoDaSimulacao = {
			indice,
			cliente: fala,
			vendedor,
			duracaoMs: agora() - inicio,
		};
		turnos.push(turno);
		historico.push({ autor: "cliente", texto: fala.texto, cards: [] });
		historico.push({
			autor: "vendedor",
			texto: textoDoVendedor(vendedor),
			cards: vendedor.artifacts.map((a) => a.artifactType),
		});

		const parcial = marcar();
		o.aoTurno?.(turno, parcial);

		if (o.sinal?.aborted) {
			parada = "cancelado";
			break;
		}
		if (vendedor.httpStatus >= 400 || vendedor.erro !== null) {
			parada = "erro-do-vendedor";
			break;
		}
		const proposta = parcial.find((m) => m.id === "chegou-a-proposta");
		if (perfil.esperaProposta && proposta?.status === "ACIONADA") {
			parada = "objetivo-atingido";
			break;
		}
	}

	const marcacoes = marcar();
	const achados = [ACHADO_FINISH_REASON];
	if (modoEfetivo(o) !== o.modo) {
		achados.push(
			"MODO: depois sem perfil do playground; a rota exige perfilId, então rodou a conduta viva (antes)",
		);
	}
	if (!turnos.some((t) => t.vendedor.dadosEcoados !== null)) {
		achados.push(
			`DADOS: NÃO CONFIRMADOS PELO SERVIDOR (pedido: fonte ${dados.fonteDeDados}, catálogo ${dados.catalogo}, fila ${dados.fila.atendentes} atendentes${dados.fila.horaFixa ? ` às ${dados.fila.horaFixa}` : ""})`,
		);
	}

	const resultado: ResultadoDoPerfil = {
		perfilId: perfil.id,
		dados,
		modo: modoEfetivo(o),
		turnos,
		marcacoes,
		parada,
		veredito: vereditoDoPerfil(
			marcacoes,
			{ id: perfil.id, esperaProposta: perfil.esperaProposta, esperaFila: perfil.esperaFila },
			parada,
		),
		iniciadoEm,
		achados,
	};
	o.aoEstado?.(estadoFinal(parada));
	return resultado;
}

export async function rodarTodos(
	os: OpcoesDaSimulacao[],
	d: DepsDaSimulacao,
): Promise<ResultadoDoPerfil[]> {
	const out: ResultadoDoPerfil[] = [];
	for (const o of os) {
		out.push(await rodarSimulacao(o, d));
		if (o.sinal?.aborted) break;
	}
	return out;
}
