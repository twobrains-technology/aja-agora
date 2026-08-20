// Nome de gente, ou outra coisa? — o predicado PURO, sem banco.
//
// Vive fora de `contact-capture.ts` porque tem dois lados do mesmo turno: o
// SERVIDOR o usa antes de gravar `conversations.contactName`/`leads.name`, e o
// CARD do nome (`name-prompt.tsx`, componente de browser) o usa antes de
// prefixar o que foi digitado com "Pode me chamar de …". Importar o módulo de
// persistência no cliente arrastaria o Drizzle e o pool do Postgres para o
// bundle — e é o mesmo fato dos dois lados, então ele mora sozinho.

function stripAccents(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palavras que NUNCA são nome de gente, mesmo passando em toda a validação de
// forma (só letras, 2-30 chars, fora das stopwords de prefixo).
//
// Produção, 2026-08: dois leads nasceram com `contact_name = "Voltei"` — o
// cliente retomou a conversa digitando isso e o modelo chamou
// `save_contact_name`. Dali em diante o agente cumprimentava "Oi, Voltei!" e a
// mesa recebia o lead com esse nome.
//
// Fechada de propósito. A tentação é escrever uma heurística de "parece nome"
// (terminação verbal, frequência), mas o custo dos dois erros é assimétrico:
// deixar passar uma palavra estranha é um lead feio; rejeitar nome legítimo é
// um cliente que não consegue se apresentar. Então a lista só tem o que cliente
// real digita ao voltar/saudar/confirmar, os rótulos que o próprio produto
// oferece em botão, e os bens que ele pode responder no lugar do nome. Nomes
// que lembram palavra comum (Vera, Rosa, Vitória) ficam FORA da lista de
// propósito — são nomes de gente.
const NAO_SAO_NOMES = new Set([
	// Artigos. Classe gramatical FECHADA — estas oito palavras são todas as que
	// existem, e nenhuma delas abre uma apresentação em português. Entraram
	// depois de a sonda de 14/08 flagrar `contact_name = "Uma"`: o funil estava
	// no gate `name`, o MODELO perguntou qual bem o cliente queria, ele
	// respondeu "uma casa" — ao modelo — e o servidor leu como resposta ao
	// funil. Diferente das listas abaixo, esta não cresce: não há artigo novo.
	"o",
	"a",
	"os",
	"as",
	"um",
	"uma",
	"uns",
	"umas",
	// retomada e presença — a família que causou o defeito
	"voltei",
	"voltou",
	"volto",
	"voltando",
	"cheguei",
	"chegando",
	"retornei",
	"retorno",
	"retornando",
	"estou",
	"tou",
	"to",
	"ta",
	"aqui",
	"ainda",
	"depois",
	"agora",
	"hoje",
	"amanha",
	// rótulos de botão do próprio produto
	"ja",
	"conheco",
	"primeira",
	"primeiro",
	"duvida",
	"duvidas",
	"simular",
	"continuar",
	"comecar",
	"fechar",
	"contratar",
	"quitar",
	"trocar",
	"comprar",
	"investir",
	// saudação, confirmação e muleta de conversa
	"oi",
	"ola",
	"opa",
	"bom",
	"boa",
	"sim",
	"nao",
	"ok",
	"beleza",
	"obrigado",
	"obrigada",
	"valeu",
	"certo",
	"isso",
	"esse",
	"essa",
	"mesmo",
	"claro",
	"show",
	"legal",
	"otimo",
	"perfeito",
	"blz",
	// intenção respondida no lugar do nome
	"prefiro",
	"eai",
	"talvez",
	"quero",
	"queria",
	"preciso",
	"gostaria",
	"vou",
	"posso",
	"pode",
	// o BEM, quando o cliente responde a pergunta errada
	"carro",
	"moto",
	"imovel",
	"casa",
	"apartamento",
	"consorcio",
	"caminhao",
	// ruído de teste que já vazou pra base
	"teste",
	"testando",
]);

/**
 * O token tem cara de nome próprio de gente?
 *
 * Última linha antes de o nome virar `conversations.contactName` e `leads.name`
 * — os dois campos que o agente ecoa em toda saudação e que a mesa lê. Pura,
 * exportada pra ser testável sem DB.
 */
export function ehNomeProprioPlausivel(token: string): boolean {
	const normalizado = stripAccents(token.trim()).toLowerCase();
	if (!normalizado) return false;
	return !NAO_SAO_NOMES.has(normalizado);
}
