// @vitest-environment happy-dom
/**
 * A tela de configuração do WhatsApp, renderizada.
 *
 * Cobre o que só se vê rodando: que os cards aparecem depois da carga, que o
 * formulário chega preenchido com o que está na Meta, que o campo apagado VIAJA
 * vazio (é assim que se limpa), que o erro da Graph chega ao operador em vez de
 * sumir num console, e que a foto é barrada antes do upload quando o formato ou
 * o ambiente não permitem.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfiguracaoWhatsapp } from "./configuracao-whatsapp";

const LIGACAO_OK = {
	phoneNumberId: "1111",
	wabaId: "2222",
	appId: "3333",
	temToken: true,
	podeTrocarFoto: true,
};

const PERFIL_NA_META = {
	about: "Consórcio sem juros",
	description: "Ajudamos você a conquistar seu bem.",
	address: "Av. Paulista, 1000",
	email: "contato@ajaagora.com.br",
	websites: ["https://ajaagora.com.br"],
	vertical: "FINANCE",
	profile_picture_url: "https://meta.example/foto.jpg",
};

/** Respostas do `fetch` por rota, na ordem em que a tela chama. */
function stubDeFetch(
	handler: (url: string, init?: RequestInit) => { status?: number; body: unknown },
) {
	const chamadas: Array<{ url: string; init?: RequestInit }> = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			chamadas.push({ url: String(url), init });
			const r = handler(String(url), init);
			const status = r.status ?? 200;
			return {
				ok: status >= 200 && status < 300,
				status,
				json: async () => r.body,
			} as unknown as Response;
		}),
	);
	return chamadas;
}

/** Caminho feliz: ligação completa e perfil já preenchido na Meta. */
function stubPadrao() {
	return stubDeFetch((_url, init) => {
		if (init?.method === "POST") return { body: { perfil: PERFIL_NA_META } };
		return { body: { ligacao: LIGACAO_OK, perfil: PERFIL_NA_META } };
	});
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("carga da tela", () => {
	it("mostra os três blocos depois de ler a Meta", async () => {
		stubPadrao();
		render(<ConfiguracaoWhatsapp />);

		expect(await screen.findByText("Conexão com a Meta")).toBeTruthy();
		expect(screen.getByText("Foto do perfil")).toBeTruthy();
		expect(screen.getByText("Dados do negócio")).toBeTruthy();
	});

	it("traz o formulário preenchido com o que está no ar", async () => {
		stubPadrao();
		render(<ConfiguracaoWhatsapp />);

		const recado = (await screen.findByLabelText("Recado")) as HTMLInputElement;
		expect(recado.value).toBe("Consórcio sem juros");
		expect((screen.getByLabelText("Endereço") as HTMLInputElement).value).toBe(
			"Av. Paulista, 1000",
		);
		expect((screen.getByLabelText("Site") as HTMLInputElement).value).toBe(
			"https://ajaagora.com.br",
		);
	});

	// ACHADO DO SMOKE (13/08), contra a Meta real: o perfil voltou com
	// `vertical: "PROF_SERVICES"` e o select exibiu essa string crua na tela. O
	// rótulo em português só existe dentro do `SelectItem`, que o shadcn monta
	// preguiçosamente — enquanto a lista não abre, o `SelectValue` cai no valor.
	// Enum da Meta vazando para a tela é texto em inglês na UI.
	it("o ramo aparece com o rótulo em português, não com o enum da Meta", async () => {
		stubDeFetch(() => ({
			body: {
				ligacao: LIGACAO_OK,
				perfil: { ...PERFIL_NA_META, vertical: "PROF_SERVICES" },
				erroDoPerfil: null,
			},
		}));
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		expect(screen.getByText("Serviços profissionais")).toBeTruthy();
		expect(screen.queryByText("PROF_SERVICES")).toBeNull();
	});

	it("sem ramo definido, mostra o texto de escolha — não uma string vazia", async () => {
		stubDeFetch(() => ({
			body: {
				ligacao: LIGACAO_OK,
				perfil: { ...PERFIL_NA_META, vertical: undefined },
				erroDoPerfil: null,
			},
		}));
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		expect(screen.getByText("Selecione o ramo")).toBeTruthy();
	});

	it("mostra a foto que está na Meta", async () => {
		stubPadrao();
		render(<ConfiguracaoWhatsapp />);

		const img = (await screen.findByAltText(
			"Foto atual do perfil do WhatsApp",
		)) as HTMLImageElement;
		expect(img.src).toBe("https://meta.example/foto.jpg");
	});

	// Sem credencial a tela precisa ABRIR e explicar. Se ela sumisse ou mostrasse
	// só um erro genérico, quem está configurando o ambiente ficaria sem pista.
	it("sem credencial, explica o que falta e desabilita a edição", async () => {
		stubDeFetch(() => ({
			body: {
				ligacao: { ...LIGACAO_OK, temToken: false, podeTrocarFoto: false },
				perfil: null,
			},
		}));
		render(<ConfiguracaoWhatsapp />);

		expect(await screen.findByText(/WHATSAPP_ACCESS_TOKEN/)).toBeTruthy();
		expect((screen.getByLabelText("Recado") as HTMLInputElement).disabled).toBe(true);
		expect(
			(screen.getByRole("button", { name: /Salvar perfil/ }) as HTMLButtonElement).disabled,
		).toBe(true);
	});

	it("falha ao ler a Meta aparece na tela, não só no console", async () => {
		stubDeFetch(() => ({ status: 502, body: { error: "A Meta está fora do ar" } }));
		render(<ConfiguracaoWhatsapp />);

		expect(await screen.findByText(/A Meta está fora do ar/)).toBeTruthy();
	});

	// ACHADO DO SMOKE (13/08), com um token inválido de propósito: a tela mostrava
	// o erro da Meta E, logo abaixo, "Token de acesso não configurado" + "Sem
	// WHATSAPP_ACCESS_TOKEN…" — para variáveis que ESTAVAM setadas. Um diagnóstico
	// que se contradiz manda o operador procurar no lugar errado: ele vai conferir
	// env que já está certa em vez de olhar a validade do token.
	it("token inválido mostra o erro SEM dizer que falta configuração", async () => {
		stubDeFetch(() => ({
			body: {
				ligacao: LIGACAO_OK,
				perfil: null,
				erroDoPerfil: "Invalid OAuth access token - Cannot parse access token",
			},
		}));
		render(<ConfiguracaoWhatsapp />);

		expect(await screen.findByText(/Invalid OAuth access token/)).toBeTruthy();
		// O diagnóstico continua verdadeiro: os IDs configurados aparecem.
		expect(screen.getByText("1111")).toBeTruthy();
		expect(screen.getByText("2222")).toBeTruthy();
		// E o aviso de credencial AUSENTE não pode estar junto — não é o caso.
		expect(screen.queryByText(/Sem WHATSAPP_ACCESS_TOKEN/)).toBeNull();
		// Com credencial presente, editar segue liberado: o token pode ser trocado
		// no ambiente e o operador continua conseguindo trabalhar na tela.
		expect((screen.getByLabelText("Recado") as HTMLInputElement).disabled).toBe(false);
	});
});

describe("salvar", () => {
	it("envia o formulário inteiro e confirma na tela", async () => {
		const chamadas = stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		fireEvent.change(screen.getByLabelText("Recado"), { target: { value: "Novo recado" } });
		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));

		await waitFor(() => expect(screen.getByText(/Perfil atualizado/)).toBeTruthy());

		const post = chamadas.find((c) => c.init?.method === "POST");
		const corpo = JSON.parse(String(post?.init?.body));
		expect(corpo.about).toBe("Novo recado");
		expect(corpo.websites).toEqual(["https://ajaagora.com.br"]);
	});

	// O caso que a semântica "chave vazia = apaga" existe pra atender: sem isso,
	// apagar o texto e salvar não faria nada e o campo voltaria preenchido.
	it("campo apagado viaja VAZIO — é assim que se limpa um dado do perfil", async () => {
		const chamadas = stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		fireEvent.change(screen.getByLabelText("Recado"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));

		await waitFor(() => expect(screen.getByText(/Perfil atualizado/)).toBeTruthy());

		const post = chamadas.find((c) => c.init?.method === "POST");
		const corpo = JSON.parse(String(post?.init?.body));
		expect(corpo).toHaveProperty("about");
		expect(corpo.about).toBe("");
	});

	// ACHADO DO SMOKE (13/08): com `type="email"` e sem `noValidate`, o navegador
	// barrava o submit com o balão NATIVO — em inglês ("Please enter a part
	// following '@'"), porque esse texto segue o idioma do browser e ignora o
	// `lang="pt-BR"` da página. Dois problemas de uma vez: texto em inglês na UI,
	// e o handler nem rodava, então a mensagem em português que existe no schema
	// nunca chegava à tela.
	it("e-mail inválido é recusado em PORTUGUÊS, antes de chamar o servidor", async () => {
		const chamadas = stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		fireEvent.change(screen.getByLabelText("E-mail de contato"), {
			target: { value: "contato@" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));

		expect(await screen.findByText("E-mail inválido")).toBeTruthy();
		expect(chamadas.some((c) => c.init?.method === "POST")).toBe(false);
	});

	it("site sem esquema é recusado em português, no campo certo", async () => {
		const chamadas = stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		fireEvent.change(screen.getByLabelText("Site"), { target: { value: "ajaagora.com.br" } });
		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));

		expect(await screen.findByText(/precisa começar com http/)).toBeTruthy();
		expect(chamadas.some((c) => c.init?.method === "POST")).toBe(false);
	});

	// O balão nativo é o que a gente NÃO quer: ele fala inglês. Sem `noValidate` o
	// navegador o dispara antes de qualquer código nosso.
	it("o formulário desliga a validação nativa do navegador", async () => {
		stubPadrao();
		const { container } = render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		const form = container.querySelector("form");
		expect(form?.hasAttribute("novalidate")).toBe(true);
	});

	it("corrigir o campo limpa o erro — não fica erro velho na tela", async () => {
		stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		const email = screen.getByLabelText("E-mail de contato");
		fireEvent.change(email, { target: { value: "contato@" } });
		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));
		expect(await screen.findByText("E-mail inválido")).toBeTruthy();

		fireEvent.change(email, { target: { value: "contato@ajaagora.com.br" } });
		await waitFor(() => expect(screen.queryByText("E-mail inválido")).toBeNull());
	});

	it("recusa da Meta chega ao operador com a mensagem dela", async () => {
		stubDeFetch((_url, init) => {
			if (init?.method === "POST") {
				return { status: 400, body: { error: "Param about must be a string of length 1-139" } };
			}
			return { body: { ligacao: LIGACAO_OK, perfil: PERFIL_NA_META } };
		});
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/ }));

		await waitFor(() =>
			expect(screen.getByText(/Param about must be a string of length 1-139/)).toBeTruthy(),
		);
	});
});

describe("foto", () => {
	it("sem WHATSAPP_APP_ID, o botão fica desabilitado e a tela diz por quê", async () => {
		stubDeFetch(() => ({
			body: {
				ligacao: { ...LIGACAO_OK, appId: null, podeTrocarFoto: false },
				perfil: PERFIL_NA_META,
			},
		}));
		render(<ConfiguracaoWhatsapp />);

		const botao = (await screen.findByRole("button", {
			name: /Escolher nova foto/,
		})) as HTMLButtonElement;
		expect(botao.disabled).toBe(true);
		expect(screen.getByText(/WHATSAPP_APP_ID/)).toBeTruthy();
	});

	// Recusa no cliente evita uma viagem à Meta que já se sabe que vai falhar.
	it("formato não aceito é recusado sem chamar o servidor", async () => {
		const chamadas = stubPadrao();
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		const gif = new File([new Uint8Array([1])], "animado.gif", { type: "image/gif" });
		Object.defineProperty(input, "files", { value: [gif], configurable: true });
		fireEvent.change(input);

		// A frase INTEIRA da recusa: só "JPEG ou PNG" casaria também com a descrição
		// do card, que cita os formatos aceitos — e o teste passaria sem recusa nenhuma.
		await waitFor(() => expect(screen.getByText("A foto precisa ser JPEG ou PNG.")).toBeTruthy());
		expect(chamadas.some((c) => c.url.includes("/foto"))).toBe(false);
	});

	it("PNG válido sobe e a tela confirma", async () => {
		const chamadas = stubDeFetch((url) => {
			if (url.includes("/foto")) {
				return {
					body: { perfil: { ...PERFIL_NA_META, profile_picture_url: "https://meta/nova.jpg" } },
				};
			}
			return { body: { ligacao: LIGACAO_OK, perfil: PERFIL_NA_META } };
		});
		render(<ConfiguracaoWhatsapp />);
		await screen.findByLabelText("Recado");

		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		const png = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
		Object.defineProperty(input, "files", { value: [png], configurable: true });
		fireEvent.change(input);

		await waitFor(() => expect(screen.getByText(/Foto atualizada/)).toBeTruthy());
		expect(chamadas.some((c) => c.url.includes("/foto") && c.init?.method === "POST")).toBe(true);
	});
});
