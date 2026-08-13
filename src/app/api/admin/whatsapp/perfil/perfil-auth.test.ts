/**
 * Autorização e contrato das rotas do perfil corporativo do WhatsApp.
 *
 * Esta tela escreve no cartão de visita que o CLIENTE vê (nome, foto, descrição)
 * usando o token da Meta. `role-scope.ts` já barra a navegação, mas navegação não
 * é dado: um `fetch` direto de uma sessão `viewer`/`attendant` não passa pelo
 * proxy. É este arquivo que prova que a porta de dados está fechada.
 *
 * Prova também que o gate corta ANTES de qualquer viagem à Graph — gate depois
 * da chamada externa continuaria negando a resposta, mas já teria consumido cota
 * da Meta e, no caso da foto, subido o arquivo de alguém sem permissão.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireRole: vi.fn(),
	lerPerfilCorporativo: vi.fn(),
	salvarPerfilCorporativo: vi.fn(),
	enviarFotoDePerfil: vi.fn(),
	estadoDaLigacao: vi.fn(),
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/whatsapp/business-profile", async () => {
	// `ErroDaGraph` é real: as rotas fazem `instanceof` nele pra escolher o status.
	const real = await vi.importActual<typeof import("@/lib/whatsapp/business-profile")>(
		"@/lib/whatsapp/business-profile",
	);
	return {
		ErroDaGraph: real.ErroDaGraph,
		lerPerfilCorporativo: mocks.lerPerfilCorporativo,
		salvarPerfilCorporativo: mocks.salvarPerfilCorporativo,
		enviarFotoDePerfil: mocks.enviarFotoDePerfil,
		estadoDaLigacao: mocks.estadoDaLigacao,
	};
});

import { ErroDaGraph } from "@/lib/whatsapp/business-profile";
import { POST as POST_FOTO } from "./foto/route";
import { GET, POST } from "./route";

/** Gate NEGANDO — o que uma sessão viewer/attendant/mesa_externa recebe. */
function negaOAcesso() {
	mocks.requireRole.mockResolvedValue({
		error: Response.json({ error: "Forbidden" }, { status: 403 }),
		session: null,
		role: null,
	});
}

/** Gate LIBERANDO para admin. */
function liberaParaAdmin() {
	mocks.requireRole.mockResolvedValue({
		error: null,
		session: { user: { id: "u1", role: "admin" } },
		role: "admin",
	});
}

const LIGACAO_COMPLETA = {
	phoneNumberId: "111",
	wabaId: "222",
	appId: "333",
	temToken: true,
	podeTrocarFoto: true,
};

function reqJson(body: unknown) {
	return new Request("http://test/api/admin/whatsapp/perfil", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function reqFoto(arquivo: File | null) {
	const form = new FormData();
	if (arquivo) form.append("foto", arquivo);
	return new Request("http://test/api/admin/whatsapp/perfil/foto", { method: "POST", body: form });
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("o perfil do WhatsApp é admin-only, no dado e não só no menu", () => {
	it("GET nega quem não é admin — e nem chega a perguntar à Meta", async () => {
		negaOAcesso();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);

		const res = await GET();

		expect(res.status).toBe(403);
		expect(mocks.requireRole).toHaveBeenCalledWith("admin");
		expect(mocks.lerPerfilCorporativo).not.toHaveBeenCalled();
	});

	it("POST nega quem não é admin — e não grava nada", async () => {
		negaOAcesso();

		const res = await POST(reqJson({ about: "invasão" }));

		expect(res.status).toBe(403);
		expect(mocks.requireRole).toHaveBeenCalledWith("admin");
		expect(mocks.salvarPerfilCorporativo).not.toHaveBeenCalled();
	});

	// O mais caro dos três: sem o gate antes, o arquivo de quem não tem permissão
	// já teria subido para a Meta quando a resposta 403 saísse.
	it("a troca de foto nega quem não é admin — e nada sobe para a Meta", async () => {
		negaOAcesso();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);

		const foto = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
		const res = await POST_FOTO(reqFoto(foto));

		expect(res.status).toBe(403);
		expect(mocks.enviarFotoDePerfil).not.toHaveBeenCalled();
	});

	it("nenhuma das rotas admite outra role junto de admin", async () => {
		negaOAcesso();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);

		await GET();
		await POST(reqJson({}));
		await POST_FOTO(reqFoto(null));

		for (const chamada of mocks.requireRole.mock.calls) {
			expect(chamada).toEqual(["admin"]);
		}
	});
});

describe("leitura do perfil (admin)", () => {
	it("devolve o estado da ligação junto do perfil", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);
		mocks.lerPerfilCorporativo.mockResolvedValue({ about: "Consórcio" });

		const res = await GET();
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ligacao).toEqual(LIGACAO_COMPLETA);
		expect(body.perfil).toEqual({ about: "Consórcio" });
	});

	// Ambiente sem credencial precisa ABRIR a tela pra explicar o que falta. Um
	// 500 aqui deixaria o operador diante de um erro genérico, sem pista nenhuma.
	it("sem credencial, responde 200 com perfil nulo em vez de estourar", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue({
			...LIGACAO_COMPLETA,
			temToken: false,
			podeTrocarFoto: false,
		});

		const res = await GET();
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.perfil).toBeNull();
		expect(body.ligacao.temToken).toBe(false);
		expect(mocks.lerPerfilCorporativo).not.toHaveBeenCalled();
	});

	// ACHADO DO SMOKE (13/08): com token inválido a rota devolvia o erro e MAIS
	// NADA, e a tela — que monta o diagnóstico a partir de `ligacao` — pintava
	// tudo como "não configurado" e ainda somava o aviso "Sem WHATSAPP_ACCESS_TOKEN"
	// logo abaixo de um erro que só existe PORQUE há token. Diagnóstico que se
	// contradiz é pior que diagnóstico nenhum: manda procurar no lugar errado.
	//
	// `ligacao` sai de env, não da Meta — não há motivo pra sumir quando a Meta
	// recusa. É justamente aí que ela é mais necessária.
	it("erro ao ler a Meta NÃO apaga o diagnóstico da ligação", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);
		mocks.lerPerfilCorporativo.mockRejectedValue(
			new ErroDaGraph("Invalid OAuth access token", 401),
		);

		const res = await GET();
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ligacao).toEqual(LIGACAO_COMPLETA);
		expect(body.perfil).toBeNull();
		expect(body.erroDoPerfil).toBe("Invalid OAuth access token");
	});

	// O 401 da Meta colidia com o 401 do NOSSO gate de sessão. Do lado do
	// navegador os dois são indistinguíveis, e o front trataria "o token da Meta
	// é inválido" como "sua sessão do painel caiu" — chutando o admin pro login.
	it("401 vindo da Meta nunca vira 401 nosso — esse código é da sessão do painel", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);
		mocks.lerPerfilCorporativo.mockRejectedValue(new ErroDaGraph("Invalid OAuth", 401));

		const res = await GET();

		expect(res.status).not.toBe(401);
		expect(res.status).toBe(200);
	});

	it("queda da Meta também chega como aviso na tela, sem derrubar a página", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);
		mocks.lerPerfilCorporativo.mockRejectedValue(new ErroDaGraph("Internal error", 500));

		const res = await GET();
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.erroDoPerfil).toBe("Internal error");
		expect(body.ligacao).toEqual(LIGACAO_COMPLETA);
	});
});

describe("gravação do perfil (admin)", () => {
	it("salva e devolve o perfil RELIDO da Meta, não o que foi enviado", async () => {
		liberaParaAdmin();
		mocks.salvarPerfilCorporativo.mockResolvedValue(undefined);
		// A Graph normaliza: aqui ela devolve o e-mail em minúsculas.
		mocks.lerPerfilCorporativo.mockResolvedValue({ email: "contato@ajaagora.com.br" });

		const res = await POST(reqJson({ email: "Contato@AjaAgora.com.br" }));
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(mocks.salvarPerfilCorporativo).toHaveBeenCalled();
		expect(body.perfil.email).toBe("contato@ajaagora.com.br");
	});

	it("e-mail inválido é barrado aqui — não gasta viagem à Meta", async () => {
		liberaParaAdmin();

		const res = await POST(reqJson({ email: "contato@" }));

		expect(res.status).toBe(400);
		expect(mocks.salvarPerfilCorporativo).not.toHaveBeenCalled();
	});

	it("site sem esquema é barrado aqui", async () => {
		liberaParaAdmin();

		const res = await POST(reqJson({ websites: ["ajaagora.com.br"] }));

		expect(res.status).toBe(400);
		expect(mocks.salvarPerfilCorporativo).not.toHaveBeenCalled();
	});

	// Na ESCRITA o erro precisa ser status de erro — a ação falhou. Mas 401/403 da
	// Meta são sobre a credencial DO SERVIDOR, não sobre a sessão de quem clicou:
	// repassá-los faria o painel expulsar um admin perfeitamente logado.
	it("credencial recusada pela Meta vira 502 — não expulsa o admin logado", async () => {
		liberaParaAdmin();
		mocks.salvarPerfilCorporativo.mockRejectedValue(new ErroDaGraph("Invalid OAuth token", 401));

		const res = await POST(reqJson({ about: "x" }));
		const body = await res.json();

		expect(res.status).toBe(502);
		expect(body.error).toBe("Invalid OAuth token");
	});

	// Já o 400 é acionável: a Meta recusou o CONTEÚDO, e quem digitou pode corrigir.
	it("recusa de conteúdo da Meta continua 400 — isso o operador resolve", async () => {
		liberaParaAdmin();
		mocks.salvarPerfilCorporativo.mockRejectedValue(
			new ErroDaGraph("Param about must be a string of length 1-139", 400),
		);

		const res = await POST(reqJson({ about: "x".repeat(200) }));
		const body = await res.json();

		expect(res.status).toBe(400);
		expect(body.error).toContain("length 1-139");
	});

	it("corpo que não é JSON responde 400, não 500", async () => {
		liberaParaAdmin();

		const req = new Request("http://test/api/admin/whatsapp/perfil", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{ isto não é json",
		});
		const res = await POST(req);

		expect(res.status).toBe(400);
	});
});

describe("troca de foto (admin)", () => {
	it("sobe a foto, grava o handle e devolve o perfil relido", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);
		mocks.enviarFotoDePerfil.mockResolvedValue("2:handle");
		mocks.salvarPerfilCorporativo.mockResolvedValue(undefined);
		mocks.lerPerfilCorporativo.mockResolvedValue({ profile_picture_url: "https://meta/foto.jpg" });

		const foto = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
		const res = await POST_FOTO(reqFoto(foto));
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(mocks.salvarPerfilCorporativo).toHaveBeenCalledWith({
			profilePictureHandle: "2:handle",
		});
		expect(body.perfil.profile_picture_url).toBe("https://meta/foto.jpg");
	});

	// Sem o APP ID a sessão de upload nem abre. Dizer isso ANTES de o operador
	// escolher o arquivo é a diferença entre "falta uma env" e "está quebrado".
	it("sem WHATSAPP_APP_ID responde 503 explicando o que falta", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue({
			...LIGACAO_COMPLETA,
			appId: null,
			podeTrocarFoto: false,
		});

		const foto = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
		const res = await POST_FOTO(reqFoto(foto));
		const body = await res.json();

		expect(res.status).toBe(503);
		expect(body.error).toContain("WHATSAPP_APP_ID");
		expect(mocks.enviarFotoDePerfil).not.toHaveBeenCalled();
	});

	it("formato que a Meta não aceita é barrado antes do upload", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);

		const foto = new File([new Uint8Array([1, 2, 3])], "animado.gif", { type: "image/gif" });
		const res = await POST_FOTO(reqFoto(foto));
		const body = await res.json();

		expect(res.status).toBe(400);
		expect(body.error).toMatch(/JPEG ou PNG/);
		expect(mocks.enviarFotoDePerfil).not.toHaveBeenCalled();
	});

	it("requisição sem arquivo responde 400", async () => {
		liberaParaAdmin();
		mocks.estadoDaLigacao.mockReturnValue(LIGACAO_COMPLETA);

		const res = await POST_FOTO(reqFoto(null));

		expect(res.status).toBe(400);
		expect(mocks.enviarFotoDePerfil).not.toHaveBeenCalled();
	});
});
