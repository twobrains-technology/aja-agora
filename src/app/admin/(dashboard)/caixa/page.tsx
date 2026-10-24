import {
	EditorDaCaixa,
	type EstadoInicialDaCaixa,
	type VersaoNaTela,
} from "@/components/admin/caixa/editor-da-caixa";
import { labelDaCaixa, lerCaixa, listarVersoes, NOME_DA_CAIXA } from "@/lib/agent/box/caixa";

/**
 * A CONDUTA DO AGENTE — `/admin/caixa`.
 *
 * A conduta é um texto versionado por label no banco, mas até 23/10 mexer nela
 * exigia rodar um script na máquina do Kairo. A dona do produto pediu a porta
 * (20/10 e 22/10: "não consigo tirar do back para não ficar te chamando").
 *
 * A leitura é feita AQUI, no servidor, e entregue pronta: a tela abre com a
 * versão viva e o histórico na mão, sem busca no primeiro render. O que o
 * cliente faz sozinho é só o que depende de ação (publicar, pedir a prévia).
 *
 * `lerCaixa` nunca lança — banco fora do ar devolve o texto do código, que é o
 * fallback do turno. `listarVersoes` fala com o banco direto e pode falhar: aí a
 * tela mostra o aviso no lugar do histórico em vez de derrubar a página inteira,
 * porque a conduta em vigor continua sendo a informação mais importante.
 */
export default async function CaixaPage() {
	const label = labelDaCaixa();
	// `semCache`: a tela administrativa mostra o que está no banco agora, não o que
	// este processo leu há até 60 s — cache velho aqui fazia o editor reescrever o
	// texto que a Bruna acabou de publicar.
	const vivo = await lerCaixa({ label, semCache: true });

	let historico: VersaoNaTela[] = [];
	let erroDoHistorico: string | null = null;
	try {
		const versoes = await listarVersoes(NOME_DA_CAIXA, label);
		historico = versoes.map((v) => ({
			versao: v.versao,
			texto: v.texto,
			publicadoPor: v.publicadoPor,
			criadoEm: v.criadoEm.toISOString(),
		}));
	} catch (erro) {
		console.error("[admin/caixa] histórico indisponível", erro);
		erroDoHistorico =
			"Não foi possível ler o histórico de versões agora. A conduta em vigor abaixo continua sendo a que o vendedor usa.";
	}

	// A versão do código não tem data de publicação; a do banco tem, e ela vem do
	// histórico — a mesma regra da rota `GET /api/admin/caixa`.
	const criadoEm =
		vivo.origem === "banco"
			? (historico.find((v) => v.versao === vivo.versao)?.criadoEm ?? null)
			: null;

	const inicial: EstadoInicialDaCaixa = {
		label,
		vivo: {
			versao: vivo.versao,
			texto: vivo.texto,
			origem: vivo.origem,
			criadoEm,
		},
		historico,
		erroDoHistorico,
	};

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Conduta do agente</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					O texto que o vendedor recebe como instrução. Publicar cria uma versão nova e vale em até
					60 segundos nos servidores que já estão no ar (cada processo guarda o texto por um
					minuto). As versões antigas ficam no histórico: nada é apagado, e desfazer é publicar o
					texto antigo de novo.
				</p>
			</div>
			<EditorDaCaixa inicial={inicial} />
		</div>
	);
}
