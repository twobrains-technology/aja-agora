// Contrato HTTP com a Meta Graph API para o perfil corporativo.
//
// Por que testar `fetch` e não "o comportamento": aqui o comportamento É a forma
// exata da chamada. Um `Bearer` onde a doc pede `OAuth`, ou o phone number id
// onde a doc pede o app id, não quebra tipo nenhum, não quebra build, e só
// aparece em produção como "erro ao trocar a foto" sem pista do motivo — a
// mensagem que a Graph devolve nesses casos fala de permissão, não do nó errado.
//
// Este teste é a memória disso. A doc de referência é o Resumable Upload API
// (https://developers.facebook.com/docs/graph-api/guides/upload), que abre a
// sessão em `/{APP_ID}/uploads` e faz o PUT do binário com `Authorization: OAuth`
// mais o header `file_offset`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ErroDaGraph,
	enviarFotoDePerfil,
	estadoDaLigacao,
	lerPerfilCorporativo,
	mensagemDeErroDaGraph,
	salvarPerfilCorporativo,
} from "./business-profile";

type ChamadaCapturada = { url: string; init: RequestInit };

/** Instala um `fetch` de mentira que devolve as respostas na ordem dada. */
function stubDeFetch(respostas: Array<{ ok?: boolean; status?: number; body: unknown }>) {
	const chamadas: ChamadaCapturada[] = [];
	let i = 0;
	const fake = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
		chamadas.push({ url: String(url), init });
		const r = respostas[i++] ?? respostas[respostas.length - 1];
		const ok = r.ok ?? true;
		return {
			ok,
			status: r.status ?? (ok ? 200 : 400),
			json: async () => r.body,
			text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
		} as unknown as Response;
	});
	vi.stubGlobal("fetch", fake);
	return chamadas;
}

/** Header de uma chamada capturada, sem depender de caixa alta/baixa. */
function header(c: ChamadaCapturada, nome: string): string | undefined {
	const h = (c.init.headers ?? {}) as Record<string, string>;
	const chave = Object.keys(h).find((k) => k.toLowerCase() === nome.toLowerCase());
	return chave ? h[chave] : undefined;
}

beforeEach(() => {
	vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-teste");
	vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1111111111");
	vi.stubEnv("WHATSAPP_WABA_ID", "2222222222");
	vi.stubEnv("WHATSAPP_APP_ID", "3333333333");
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("leitura do perfil", () => {
	it("bate no phone number id e pede os campos explicitamente", async () => {
		const chamadas = stubDeFetch([{ body: { data: [{ about: "Oi", vertical: "FINANCE" }] } }]);

		const perfil = await lerPerfilCorporativo();

		expect(chamadas[0].url).toContain("/1111111111/whatsapp_business_profile");
		// Sem `fields` a Graph devolve o default dela, que pode mudar sem aviso.
		expect(chamadas[0].url).toContain("fields=");
		expect(chamadas[0].url).toContain("profile_picture_url");
		expect(header(chamadas[0], "Authorization")).toBe("Bearer token-de-teste");
		expect(perfil).toEqual({ about: "Oi", vertical: "FINANCE" });
	});

	// Número recém-conectado tem `data: []`. Isso é perfil em branco, não falha —
	// se virasse erro, a tela nasceria quebrada justamente para quem mais precisa
	// dela: quem ainda não configurou nada.
	it("perfil ainda não preenchido volta como objeto vazio, não como erro", async () => {
		stubDeFetch([{ body: { data: [] } }]);
		await expect(lerPerfilCorporativo()).resolves.toEqual({});
	});

	it("erro da Graph sobe com a mensagem dela, não com uma nossa", async () => {
		stubDeFetch([
			{
				ok: false,
				status: 400,
				body: { error: { message: "(#100) Tried accessing nonexisting field" } },
			},
		]);

		await expect(lerPerfilCorporativo()).rejects.toThrow(
			"(#100) Tried accessing nonexisting field",
		);
	});
});

describe("gravação do perfil", () => {
	it("manda messaging_product e só os campos informados", async () => {
		const chamadas = stubDeFetch([{ body: { success: true } }]);

		await salvarPerfilCorporativo({ about: "Consórcio sem susto" });

		const corpo = JSON.parse(String(chamadas[0].init.body));
		expect(corpo).toEqual({ messaging_product: "whatsapp", about: "Consórcio sem susto" });
		expect(chamadas[0].init.method).toBe("POST");
	});

	// A Graph faz merge. Se mandássemos as chaves ausentes como `null`/"", salvar
	// só o endereço apagaria a descrição que ninguém pediu pra mexer.
	it("campo não informado não viaja — salvar um campo não apaga os outros", async () => {
		const chamadas = stubDeFetch([{ body: { success: true } }]);

		await salvarPerfilCorporativo({ address: "Av. Paulista, 1000" });

		const corpo = JSON.parse(String(chamadas[0].init.body));
		expect(corpo).not.toHaveProperty("about");
		expect(corpo).not.toHaveProperty("description");
		expect(corpo).not.toHaveProperty("websites");
	});

	it("a foto entra como profile_picture_handle", async () => {
		const chamadas = stubDeFetch([{ body: { success: true } }]);

		await salvarPerfilCorporativo({ profilePictureHandle: "2:c2FtcGxl" });

		const corpo = JSON.parse(String(chamadas[0].init.body));
		expect(corpo.profile_picture_handle).toBe("2:c2FtcGxl");
	});

	it("lista de sites vazia é enviada — é assim que se apaga o site", async () => {
		const chamadas = stubDeFetch([{ body: { success: true } }]);

		await salvarPerfilCorporativo({ websites: [] });

		const corpo = JSON.parse(String(chamadas[0].init.body));
		expect(corpo.websites).toEqual([]);
	});
});

describe("upload da foto (Resumable Upload API)", () => {
	const arquivo = {
		bytes: new Uint8Array([1, 2, 3, 4]).buffer,
		mimeType: "image/jpeg",
		nomeArquivo: "perfil.jpg",
	};

	it("abre a sessão no APP ID — não no phone number id", async () => {
		const chamadas = stubDeFetch([
			{ body: { id: "upload:MTphdHRhY2h" } },
			{ body: { h: "2:c2FtcGxl" } },
		]);

		await enviarFotoDePerfil(arquivo);

		expect(chamadas[0].url).toContain("/3333333333/uploads");
		expect(chamadas[0].url).not.toContain("/1111111111/uploads");
	});

	it("declara nome, tamanho e tipo do arquivo na abertura da sessão", async () => {
		const chamadas = stubDeFetch([{ body: { id: "upload:abc" } }, { body: { h: "handle" } }]);

		await enviarFotoDePerfil(arquivo);

		const url = new URL(chamadas[0].url);
		expect(url.searchParams.get("file_name")).toBe("perfil.jpg");
		expect(url.searchParams.get("file_length")).toBe("4");
		expect(url.searchParams.get("file_type")).toBe("image/jpeg");
	});

	// A doc do Resumable Upload é literal: o segundo passo usa `OAuth`, e não o
	// `Bearer` do resto da Graph. Trocar um pelo outro devolve 401 genérico.
	it("o envio do binário usa Authorization: OAuth e file_offset", async () => {
		const chamadas = stubDeFetch([{ body: { id: "upload:abc" } }, { body: { h: "handle" } }]);

		await enviarFotoDePerfil(arquivo);

		expect(chamadas[1].url).toContain("/upload:abc");
		expect(header(chamadas[1], "Authorization")).toBe("OAuth token-de-teste");
		expect(header(chamadas[1], "file_offset")).toBe("0");
		expect(chamadas[1].init.body).toBe(arquivo.bytes);
	});

	it("devolve o handle do campo `h`", async () => {
		stubDeFetch([{ body: { id: "upload:abc" } }, { body: { h: "2:handle-real" } }]);

		await expect(enviarFotoDePerfil(arquivo)).resolves.toBe("2:handle-real");
	});

	// Resposta 200 sem `h` é o caso traiçoeiro: sem esta guarda, o `undefined`
	// seguiria para o POST do perfil e a Meta recusaria com uma mensagem sobre
	// `profile_picture_handle`, apontando para o passo errado.
	it("200 sem handle é falha explícita, não segue adiante", async () => {
		stubDeFetch([{ body: { id: "upload:abc" } }, { body: {} }]);

		await expect(enviarFotoDePerfil(arquivo)).rejects.toThrow(/não devolveu o handle/);
	});

	it("sem WHATSAPP_APP_ID a falha diz exatamente o que falta", async () => {
		vi.stubEnv("WHATSAPP_APP_ID", "");
		stubDeFetch([{ body: {} }]);

		await expect(enviarFotoDePerfil(arquivo)).rejects.toThrow(/WHATSAPP_APP_ID/);
	});
});

describe("mensagem de erro da Graph", () => {
	it("prefere a mensagem escrita para o usuário final", () => {
		const corpo = JSON.stringify({
			error: {
				message: "(#131009) Parameter value is not valid",
				error_user_msg: "O recado é longo demais.",
			},
		});
		expect(mensagemDeErroDaGraph(corpo)).toBe("O recado é longo demais.");
	});

	it("cai na mensagem técnica quando não há versão para o usuário", () => {
		const corpo = JSON.stringify({ error: { message: "(#100) Invalid parameter" } });
		expect(mensagemDeErroDaGraph(corpo)).toBe("(#100) Invalid parameter");
	});

	// Gateway caído devolve HTML. Sem isto o `JSON.parse` estouraria dentro do
	// tratamento de erro e a tela receberia um erro sobre o erro.
	it("corpo que não é JSON não quebra o tratamento", () => {
		expect(mensagemDeErroDaGraph("<html>502 Bad Gateway</html>")).toContain("502");
	});

	it("corpo vazio ainda produz uma frase legível", () => {
		expect(mensagemDeErroDaGraph("")).toMatch(/Meta recusou/);
	});
});

describe("estado da ligação com a Meta", () => {
	it("informa presença, nunca o valor do token", () => {
		const estado = estadoDaLigacao();

		expect(estado.temToken).toBe(true);
		expect(estado.phoneNumberId).toBe("1111111111");
		expect(JSON.stringify(estado)).not.toContain("token-de-teste");
	});

	it("sem app id, avisa que a foto não pode ser trocada — o resto continua de pé", () => {
		vi.stubEnv("WHATSAPP_APP_ID", "");

		const estado = estadoDaLigacao();

		expect(estado.podeTrocarFoto).toBe(false);
		expect(estado.temToken).toBe(true);
	});

	// Achado do smoke local (13/08): o `.env.local` declara as variáveis VAZIAS, e
	// com `?? null` a rota devolvia `phoneNumberId: ""`. Vazio é ausente — quem lê
	// o contrato não deve precisar saber a diferença entre não-declarado e em-branco.
	it("variável declarada e vazia conta como ausente, não como string vazia", () => {
		vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
		vi.stubEnv("WHATSAPP_WABA_ID", "   ");
		vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");

		const estado = estadoDaLigacao();

		expect(estado.phoneNumberId).toBeNull();
		expect(estado.wabaId).toBeNull();
		expect(estado.temToken).toBe(false);
	});
});

describe("tipo do erro", () => {
	it("ErroDaGraph carrega o status pra rota escolher o código de resposta", async () => {
		stubDeFetch([{ ok: false, status: 429, body: { error: { message: "rate limited" } } }]);

		await lerPerfilCorporativo().catch((err) => {
			expect(err).toBeInstanceOf(ErroDaGraph);
			expect((err as ErroDaGraph).status).toBe(429);
		});
		expect.hasAssertions();
	});
});
