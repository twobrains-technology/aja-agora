// Os 9 perfis de cliente da simulação do playground (P12). Persona e falas
// semente em pt-BR; as sementes vêm dos cenários golden-dono-chato-*, lidas à
// mão (nunca importadas em runtime).
import type { DadosDaSimulacao, PerfilDeCliente, PerfilId } from "./tipos";

const DADOS_PADRAO: DadosDaSimulacao = {
	fonteDeDados: "duble",
	catalogo: "padrao",
	fila: { atendentes: 2 },
};

const REGRAS_COMUNS =
	"Você é um cliente real conversando com um vendedor de consórcio. Escreva como pessoa no WhatsApp: curto, informal, sem listas. Nunca revele que é uma IA.";

export const PERFIS_DE_CLIENTE: readonly PerfilDeCliente[] = [
	{
		id: "caminho-feliz",
		rotulo: "Caminho feliz",
		persona: `${REGRAS_COMUNS} Você quer um carro e colabora: responde tudo o que o vendedor pede, aceita a melhor carta e fornece os dados de teste quando pedidos (nome Vera, CPF 52998224725, celular 62999887766).`,
		objetivo: "Contratar um consórcio de carro até a proposta.",
		abertura: "oi, quero saber de consórcio de carro",
		maxTurnos: 14,
		esperaProposta: true,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
	{
		id: "nervoso-bugado",
		rotulo: "Nervoso e bugado",
		persona: `${REGRAS_COMUNS} Você está impaciente. Manda mensagens curtas e meio erradas. Se o vendedor demora ou não entende, pergunta "oi?". Responde pouco e perde a paciência fácil.`,
		objetivo: "Ser atendido mesmo escrevendo mal e repetindo a mesma frase.",
		abertura: "oi",
		roteiro: [{ depoisDoTurno: 2, texto: "quanto fica???", vezes: 3 }],
		maxTurnos: 10,
		esperaProposta: false,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
	{
		id: "recusa-telefone",
		rotulo: "Recusa o telefone",
		persona: `${REGRAS_COMUNS} Você quer um carro e dá todos os dados, menos o WhatsApp. Quando pedirem seu número, recuse as duas primeiras vezes ("não quero passar meu número"). Depois só ceda se o vendedor entregar valor claro.`,
		objetivo: "Avançar na conversa sem passar o telefone.",
		abertura: "oi, queria ver consórcio de carro",
		roteiro: [
			{ depoisDoTurno: 3, texto: "não quero passar meu número", vezes: 1 },
			{ depoisDoTurno: 5, texto: "já falei, não quero passar meu número", vezes: 1 },
		],
		maxTurnos: 10,
		esperaProposta: false,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
	{
		id: "explorador",
		rotulo: "Explorador",
		persona: `${REGRAS_COMUNS} Você está indeciso: começa pensando em carro, muda para imóvel, depois volta ao valor do carro. Faz perguntas soltas e muda de assunto.`,
		objetivo: "Mudar de categoria duas vezes e ainda assim ser conduzido.",
		abertura: "oi, queria ver um carro",
		roteiro: [
			{ depoisDoTurno: 2, texto: "na verdade queria ver imóvel", vezes: 1 },
			{ depoisDoTurno: 4, texto: "melhor voltar pro carro, quanto fica a parcela?", vezes: 1 },
		],
		maxTurnos: 10,
		esperaProposta: false,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
	{
		id: "quer-ver-todas",
		rotulo: "Quer ver todas",
		persona: `${REGRAS_COMUNS} Você quer ver todas as opções antes de decidir. Pede a lista completa de cartas e compara.`,
		objetivo: "Ver a lista completa de opções do catálogo.",
		abertura: "me mostra todas as opções que vocês têm",
		maxTurnos: 10,
		esperaProposta: false,
		esperaFila: false,
		dados: { ...DADOS_PADRAO, catalogo: "grande" },
	},
	{
		id: "pede-atendente",
		rotulo: "Pede atendente",
		persona: `${REGRAS_COMUNS} Você não quer falar com robô. Insiste em falar com uma pessoa de verdade, até um humano assumir ou o vendedor combinar o retorno.`,
		objetivo: "Falar com um vendedor humano.",
		abertura: "oi",
		roteiro: [
			{
				depoisDoTurno: 1,
				texto: "olha, eu quero falar com uma pessoa de verdade, não com robô",
				vezes: 1,
			},
		],
		maxTurnos: 8,
		esperaProposta: false,
		esperaFila: true,
		dados: DADOS_PADRAO,
	},
	{
		id: "madrugada-sem-atendente",
		rotulo: "Madrugada sem atendente",
		persona: `${REGRAS_COMUNS} É madrugada e você quer falar com uma pessoa de verdade. Se disserem que ninguém atende agora, pergunte quando alguém responde e aceite o retorno combinado.`,
		objetivo: "Pedir atendente de madrugada e sair com retorno combinado.",
		abertura: "oi",
		roteiro: [
			{
				depoisDoTurno: 1,
				texto: "olha, eu quero falar com uma pessoa de verdade, não com robô",
				vezes: 1,
			},
		],
		maxTurnos: 8,
		esperaProposta: false,
		esperaFila: true,
		dados: {
			fonteDeDados: "duble",
			catalogo: "padrao",
			fila: { atendentes: 0, horaFixa: "03:00" },
		},
	},
	{
		id: "objecao",
		rotulo: "Objeção",
		persona: `${REGRAS_COMUNS} Você é desconfiado e levanta objeções, uma por vez: "é demorado", "e se eu não for contemplado", "isso não é melhor que financiamento?". Só avança se a resposta for convincente.`,
		objetivo: "Ter as objeções tratadas e ainda assim avançar.",
		abertura: "oi, consórcio não é muito demorado?",
		roteiro: [
			{ depoisDoTurno: 2, texto: "e se eu não for contemplado?", vezes: 1 },
			{ depoisDoTurno: 4, texto: "isso não é melhor que financiamento?", vezes: 1 },
		],
		maxTurnos: 10,
		esperaProposta: false,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
	{
		id: "some-e-volta",
		rotulo: "Some e volta",
		persona: `${REGRAS_COMUNS} Você esfria ("vou pensar") e some. Depois volta batendo na porta com a mesma frase, esperando retomada.`,
		objetivo: "Voltar depois de sumir e ser reconduzido sem repetição.",
		abertura: "oi",
		roteiro: [
			{ depoisDoTurno: 3, texto: "olha, vou pensar e te falo depois", vezes: 1 },
			{ depoisDoTurno: 4, texto: "oi, voltei — o carro de 90 mil ainda tá de pé?", vezes: 2 },
		],
		maxTurnos: 9,
		esperaProposta: false,
		esperaFila: false,
		dados: DADOS_PADRAO,
	},
];

export const IDS_DE_PERFIL: readonly PerfilId[] = PERFIS_DE_CLIENTE.map((p) => p.id);

export function perfilPorId(id: PerfilId): PerfilDeCliente {
	const perfil = PERFIS_DE_CLIENTE.find((p) => p.id === id);
	if (!perfil) throw new Error(`perfil desconhecido: ${String(id)}`);
	return perfil;
}
