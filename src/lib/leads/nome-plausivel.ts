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
	// Estado de crédito — o vocabulário que ESTE produto provoca. "Meu nome está
	// sujo no Serasa, consigo fazer consórcio?" é uma das perguntas mais comuns do
	// domínio (consórcio é justamente o que se vende a quem tem restrição), e ela
	// contém a forma exata de uma apresentação: "meu nome é sujo". Sonda de
	// 27/08/2026: a frase batizava o lead de "Sujo".
	//
	// Como a família "voltei" logo abaixo, isto não é caçar frase — é reconhecer
	// que o produto faz o cliente escrever estas palavras nesta posição.
	"sujo",
	"suja",
	"limpo",
	"limpa",
	"negativado",
	"negativada",
	"restrito",
	"restrita",
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

/**
 * O nome que vamos gravar foi DITO pelo cliente neste turno?
 *
 * `ehNomeProprioPlausivel` responde "isto parece um nome?" — e é a pergunta
 * errada sozinha. "Cliente", "Comprador" e "Interessado" parecem nomes, e foi
 * assim que uma conversa em que ninguém se apresentou terminou com
 * `contact_name = "Cliente"` no banco: o modelo chamou `save_contact_name` para
 * preencher a lacuna, e o servidor obedeceu.
 *
 * A pergunta certa é a da Lei 3 do projeto — o dado está ancorado no que a
 * pessoa disse? É a mesma defesa que `valorAncoradoNoTexto` faz para o valor do
 * bem, e vale pelo mesmo motivo: bloquear palavra por palavra não converge
 * ("não se fecha porta a porta, fecha-se a parede"), porque a próxima paráfrase
 * do modelo é "Comprador", depois "Interessado", depois "Amigo".
 *
 * Compara sem acento e sem caixa (o cliente digita "fabio" e vira "Fábio"), e
 * exige limite de palavra — para "Ana" não ancorar em "financiamento".
 */
export function nomeAncoradoNaFala(
	nome: string,
	falaDoCliente: string | null | undefined,
): boolean {
	const fala = (falaDoCliente ?? "").trim();
	if (!fala || !nome.trim()) return false;
	const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const alvo = normalizar(nome.trim());
	if (!alvo) return false;

	// PLACEHOLDER NÃO É NOME, mesmo aparecendo na fala.
	//
	// Segunda linha de defesa: a primeira é o chamador não passar directive do
	// servidor como se fosse fala do cliente (`converse.ts`). Se passar, a palavra
	// "cliente" está em praticamente toda directive — e era assim que
	// `save_contact_name("Cliente")` voltava a gravar. Aqui a lista é curta e
	// fechada de propósito: são termos que o SISTEMA usa para se referir à pessoa,
	// não nomes que alguém tem.
	if (PALAVRAS_QUE_O_SISTEMA_USA.has(alvo)) return false;

	// A fala é quebrada em tokens de letras; o alvo precisa da mesma régua, senão
	// "D'Ávila" e "Jean-Luc" — que `capitalizeName` declara suportar — nunca
	// ancoram. Nome composto casa como sequência CONTÍGUA de tokens.
	const tokensDaFala = normalizar(fala)
		.split(/[^\p{L}]+/u)
		.filter(Boolean);
	const tokensDoNome = alvo.split(/[^\p{L}]+/u).filter(Boolean);
	if (tokensDoNome.length === 0) return false;
	return tokensDaFala.some((_, i) => tokensDoNome.every((t, j) => tokensDaFala[i + j] === t));
}

/**
 * Como o SISTEMA chama a pessoa — nunca como ela se chama.
 *
 * Curta e fechada: não é uma blocklist de nomes feios (isso não convergiria — ver
 * `CLAUDE.md`, "não se fecha porta a porta"), é o vocabulário com que o servidor
 * se refere ao interlocutor nas suas próprias instruções. Se um desses aparecer
 * como "nome", a origem é a mecânica, não a pessoa.
 */
const PALAVRAS_QUE_O_SISTEMA_USA: ReadonlySet<string> = new Set([
	"cliente",
	"usuario",
	"sistema",
	"agente",
	"assistente",
	"card",
]);
