// @vitest-environment happy-dom
/**
 * O que a tela de Percurso PROMETE, e que nenhum teste de query pega.
 *
 * A promessa central é uma frase: dá para ver quem chegou pela campanha e não
 * falou. Se a linha de quem não escreveu sumir, ficar sem rótulo ou ganhar um
 * botão que abre um painel vazio, a tela deixou de responder o que foi pedida
 * para responder — e a query continuaria verde.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PessoaDoPercurso, ResumoDoPasso } from "@/lib/admin/percurso-types";
import { PASSOS_DO_PERCURSO } from "@/lib/admin/percurso-types";
import { EscadaDoPercurso } from "./escada-do-percurso";
import { TabelaPercurso } from "./tabela-percurso";

function pessoa(over: Partial<PessoaDoPercurso> = {}): PessoaDoPercurso {
	return {
		chave: "k1",
		contactId: null,
		visitorId: "visitante-a3f1",
		nome: null,
		telefone: null,
		email: null,
		canal: "web",
		origemLabel: "instagram · imovel-agosto · 12345",
		origemTipo: "campanha",
		origemFonte: "instagram",
		campanha: "imovel-agosto",
		criativo: null,
		landingPath: "/imoveis",
		primeiraChegada: "2026-08-17T12:00:00.000Z",
		ultimaAtividade: "2026-08-17T12:00:00.000Z",
		chegadas: 1,
		conversas: 0,
		mensagensDoCliente: 0,
		passo: "so_chegou",
		stageDoLead: null,
		perdido: false,
		conversationId: null,
		...over,
	};
}

afterEach(cleanup);

describe("a lista do percurso", () => {
	it("mostra quem chegou e não falou, com o degrau escrito", () => {
		render(<TabelaPercurso pessoas={[pessoa()]} carregando={false} onAbrir={() => {}} />);

		expect(screen.getByText("Não falou")).toBeTruthy();
		expect(screen.getByText("Só chegou")).toBeTruthy();
		// Sem conversa e sem contato não há painel para abrir — dizer isso é mais
		// honesto que um botão que abriria uma tela vazia.
		expect(screen.getByText("nada a ler")).toBeTruthy();
	});

	it("dá um nome a quem é anônimo, para a linha poder ser citada", () => {
		render(<TabelaPercurso pessoas={[pessoa()]} carregando={false} onAbrir={() => {}} />);

		expect(screen.getByText("Anônimo a3f1")).toBeTruthy();
	});

	it("conta as mensagens de quem falou", () => {
		render(
			<TabelaPercurso
				pessoas={[
					pessoa({ nome: "Joana", conversas: 1, mensagensDoCliente: 4, passo: "escreveu" }),
				]}
				carregando={false}
				onAbrir={() => {}}
			/>,
		);

		expect(screen.getByText(/4 mensagens/)).toBeTruthy();
		expect(screen.getByText("Escreveu")).toBeTruthy();
	});

	it("mostra o perdido como selo, sem apagar o degrau que ele alcançou", () => {
		render(
			<TabelaPercurso
				pessoas={[
					pessoa({
						nome: "Desistiu",
						conversas: 1,
						mensagensDoCliente: 9,
						passo: "viu_oferta",
						stageDoLead: "perdido",
						perdido: true,
					}),
				]}
				carregando={false}
				onAbrir={() => {}}
			/>,
		);

		expect(screen.getByText("Viu oferta")).toBeTruthy();
		expect(screen.getByText("Perdido")).toBeTruthy();
	});

	it("abre o histórico pela própria tela, sem jogar o operador para outra rota", () => {
		const abrir = vi.fn();
		const alvo = pessoa({
			nome: "Beatriz",
			contactId: "ct-1",
			conversas: 2,
			mensagensDoCliente: 30,
			passo: "proposta",
			conversationId: "conv-1",
		});
		render(<TabelaPercurso pessoas={[alvo]} carregando={false} onAbrir={abrir} />);

		const botao = screen.getByRole("button", { name: "Ver ficha" });
		// `/admin/conversations` não aceita id de conversa na URL: um link para lá
		// abriria a lista inteira fingindo que abriu a conversa.
		expect(botao.closest("a")).toBeNull();

		fireEvent.click(botao);
		expect(abrir).toHaveBeenCalledWith(alvo);
	});

	it("distingue duas pessoas de mesmo nome que não deixaram telefone", () => {
		// Aconteceu na tela em 18/08/2026: o filtro "Escreveu" trouxe cinco linhas
		// "Joana", de campanhas e dias diferentes, e nada dizia qual era qual.
		render(
			<TabelaPercurso
				pessoas={[
					pessoa({ chave: "a", nome: "Joana", visitorId: "visitante-aaaa", passo: "escreveu" }),
					pessoa({ chave: "b", nome: "Joana", visitorId: "visitante-bbbb", passo: "escreveu" }),
				]}
				carregando={false}
				onAbrir={() => {}}
			/>,
		);

		expect(screen.getByText("visitante aaaa")).toBeTruthy();
		expect(screen.getByText("visitante bbbb")).toBeTruthy();
	});

	it("prefere o telefone à marca do visitante quando ele existe", () => {
		render(
			<TabelaPercurso
				pessoas={[pessoa({ nome: "Beatriz", telefone: "62992496793" })]}
				carregando={false}
				onAbrir={() => {}}
			/>,
		);

		expect(screen.getByText("62992496793")).toBeTruthy();
		expect(screen.queryByText(/visitante /)).toBeNull();
	});

	it("diz que está vazio em vez de mostrar uma tabela sem linhas", () => {
		render(<TabelaPercurso pessoas={[]} carregando={false} onAbrir={() => {}} />);

		expect(screen.getByText(/Ninguém no período com esses filtros/)).toBeTruthy();
	});
});

describe("a escada do percurso", () => {
	const RESUMO: ResumoDoPasso[] = PASSOS_DO_PERCURSO.map((p, i) => ({
		chave: p.chave,
		label: p.label,
		ajuda: p.ajuda,
		pessoas: [31, 30, 5, 8, 0, 0, 1, 0][i],
	}));

	it("mostra os oito degraus, inclusive os dois que antecedem a conversa", () => {
		render(
			<EscadaDoPercurso resumo={RESUMO} total={75} selecionado={null} onSelecionar={() => {}} />,
		);

		expect(screen.getByText("Só chegou")).toBeTruthy();
		expect(screen.getByText("Olhou a página")).toBeTruthy();
		expect(screen.getByText("Fechado")).toBeTruthy();
		expect(screen.getByText(/75 pessoas chegaram no período/)).toBeTruthy();
	});

	it("marca o degrau escolhido com PALAVRA, não só com cor", () => {
		render(
			<EscadaDoPercurso
				resumo={RESUMO}
				total={75}
				selecionado="escreveu"
				onSelecionar={() => {}}
			/>,
		);

		// Quem não distingue as duas cores da barra precisa ler o estado. O
		// `aria-pressed` cobre o leitor de tela; o "filtrando" cobre o olho.
		const degrau = screen.getByText("Escreveu").closest("button");
		expect(degrau?.getAttribute("aria-pressed")).toBe("true");
		expect(within(degrau as HTMLElement).getByText(/filtrando/)).toBeTruthy();
	});

	it("clicar no degrau já escolhido desfaz o filtro, em vez de repeti-lo", () => {
		const selecionar = vi.fn();
		render(
			<EscadaDoPercurso
				resumo={RESUMO}
				total={75}
				selecionado="escreveu"
				onSelecionar={selecionar}
			/>,
		);

		fireEvent.click(screen.getByText("Escreveu").closest("button") as HTMLElement);
		expect(selecionar).toHaveBeenCalledWith(null);
	});

	it("avisa que a unidade é a pessoa — é o que explica a diferença com Performance", () => {
		render(
			<EscadaDoPercurso resumo={RESUMO} total={75} selecionado={null} onSelecionar={() => {}} />,
		);

		// O rodapé passou a nomear as três unidades (pessoa, conversa, clique) e a dar
		// a OPERAÇÃO que fecha a conta com a tela de Performance — antes ele dava só
		// a direção ("são menores"), e quem via 8 lá e 7 aqui não sabia se sumiu
		// alguém. O texto é quebrado em vários elementos, daí o matcher por função.
		// `getAllByText` porque o texto atravessa vários elementos e cada ancestral
		// casa junto; o que importa é ele estar na tela.
		expect(
			screen.getAllByText((_, no) =>
				/não por conversa nem por clique no anúncio/.test(no?.textContent ?? ""),
			).length,
		).toBeGreaterThan(0);
	});
});
