/**
 * O BEM — o dicionário ÚNICO do painel.
 *
 * A mesma coisa tinha três nomes conforme a tela: "Categoria" em Conversas
 * (com `auto`/`imovel`), "Objetivo" na Régua (com `carro`/`moto`/`imovel`) e
 * "bem/perfil" na fala da Bruna. `auto` virava "Automóvel" numa coluna e
 * "Carro" na outra — duas verdades para o mesmo fato.
 *
 * Aqui a CHAVE técnica continua a mesma do banco (`conversations.metadata
 * .currentCategory` grava `auto`/`imovel`/`moto`; a régua grava
 * `carro`/`moto`/`imovel` no `objetivo`). O que unifica é o RÓTULO. Quem
 * precisa exibir usa `rotuloDoBem`; quem precisa ordenar/filtrar continua
 * olhando a chave.
 *
 * Módulo puro (sem banco, sem React) para valer nos componentes cliente, na
 * consulta do servidor e nos testes.
 */

/** As três chaves canônicas da régua, com o rótulo e a ordem de exibição. */
export const BENS = [
	{ chave: "carro", rotulo: "Carro" },
	{ chave: "moto", rotulo: "Moto" },
	{ chave: "imovel", rotulo: "Imóvel" },
] as const;

export type ChaveDoBem = (typeof BENS)[number]["chave"];

/**
 * Chave → rótulo. Cobre as duas grafias que o banco usa: `auto` (metadata da
 * conversa) e `carro` (objetivo da régua) apontam para o mesmo bem.
 */
export const ROTULO_DO_BEM: Record<string, string> = {
	carro: "Carro",
	auto: "Carro",
	automovel: "Carro",
	automóvel: "Carro",
	moto: "Moto",
	motocicleta: "Moto",
	imovel: "Imóvel",
	imóvel: "Imóvel",
};

/**
 * O rótulo humano de uma chave de bem. `null`/vazio/desconhecido devolve
 * `null` — a tela escolhe o que escrever (nunca "—" quando há um fato, mas
 * também nunca inventar um bem que ninguém disse).
 */
export function rotuloDoBem(chave: string | null | undefined): string | null {
	if (!chave) return null;
	const limpa = String(chave).trim().toLowerCase();
	if (!limpa) return null;
	return ROTULO_DO_BEM[limpa] ?? null;
}

/** A chave canônica da régua para uma chave de qualquer grafia. */
export function chaveCanonicaDoBem(chave: string | null | undefined): ChaveDoBem | null {
	if (!chave) return null;
	const limpa = String(chave).trim().toLowerCase();
	if (limpa === "imovel" || limpa === "imóvel") return "imovel";
	if (limpa === "moto" || limpa === "motocicleta") return "moto";
	if (limpa === "carro" || limpa === "auto" || limpa === "automovel" || limpa === "automóvel") {
		return "carro";
	}
	return null;
}
