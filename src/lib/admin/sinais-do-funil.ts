/**
 * Os critérios que definem cada degrau do funil, num lugar só.
 *
 * Nasceram dentro de `performance-queries.ts` e saíram quando a tela de
 * Percurso passou a responder a MESMA pergunta pessoa a pessoa. Duas telas do
 * painel com dois critérios de "viu oferta" seriam duas verdades para o mesmo
 * fato — e a que o time acreditasse seria a última que ele abriu.
 */

import { type SQL, sql } from "drizzle-orm";
import { PADRAO_ROBO_SQL } from "@/lib/attribution/user-agent-robo";
import { ESTAGIOS_QUALIFICADOS } from "./lead-stages";

/**
 * A visita é de GENTE — o denominador de toda taxa de aquisição.
 *
 * Medido no banco de produção em 15/08/2026: de 40.796 visitas em 30 dias,
 * 38.792 eram máquina, e 33.382 delas o health check do NOSSO ALB, que bate em
 * `/` a cada 30 segundos. Somar máquina e gente no mesmo denominador fazia a
 * tela mostrar 0,056% de visita → conversa quando a taxa sobre gente é 1,15%.
 *
 * **A âncora que impede o erro caro:** visita que PRODUZIU conversa nunca é
 * classificada como robô, qualquer que seja o user-agent. Fato do servidor
 * vence heurística — é o que protege o cliente atrás de proxy corporativo com
 * header estranho.
 *
 * Espera a tabela `visits` com alias `v`.
 */
export const VISITA_DE_GENTE = sql`(
  EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
  OR (v.user_agent IS NOT NULL AND v.user_agent !~* ${PADRAO_ROBO_SQL})
)`;

/**
 * A CHAVE que identifica uma PESSOA — o contato quando conhecido, senão o
 * visitante (device).
 *
 * Existe como fragmento único porque três telas passaram a contar pessoas e
 * duas definições "equivalentes" divergem no primeiro caso raro: medido em
 * produção em 24/08/2026, numa janela de 30 dias `visitor_id` puro dá 3.016 e a
 * chave com contato dá 3.011 — cinco pessoas que chegaram por dois aparelhos e
 * o painel contaria duas vezes. Em um dia os dois coincidem, e é assim que uma
 * divergência dessas passa despercebida por semanas.
 *
 * O contato é o da PRIMEIRA conversa que o resolveu dentro da janela — é ele que
 * funde a chegada pela web e a pelo WhatsApp da mesma pessoa numa linha só.
 *
 * A coluna do visitante entra por parâmetro porque cada consulta chega aqui com
 * um alias diferente (`v` nas de Performance, `vi` no CTE do Percurso). Acoplar
 * ao alias faria o fragmento compilar num lugar e explodir no outro.
 */
export function chaveDaPessoa(de: Date, ate: Date, colunaVisitor: SQL = sql`v.visitor_id`): SQL {
	return sql`COALESCE(
    (SELECT c.contact_id::text
       FROM conversations c
       JOIN visits vp ON vp.id = c.visit_id
      WHERE vp.visitor_id = ${colunaVisitor}
        AND vp.created_at BETWEEN ${de} AND ${ate}
        AND c.contact_id IS NOT NULL
        AND c.is_simulated = false
      ORDER BY c.updated_at ASC
      LIMIT 1),
    ${colunaVisitor}
  )`;
}

/** Quanto tempo depois da anterior uma visita do mesmo visitante ainda é eco. */
const JANELA_DE_ECO = "2 seconds";

/**
 * A visita não é ECO de outra — o mesmo visitante gravado de novo em instantes.
 *
 * **O que aconteceu.** Depois de hidratar, o App Router dispara `fetch` de
 * prefetch para a própria rota, carregando junto a query string da página. Como
 * a URL de anúncio traz UTM, e `decideVisit` abria visita nova sempre que havia
 * campanha, cada prefetch virava uma chegada: uma navegação = QUATRO linhas em
 * `visits`, reproduzido duas vezes no navegador em 24/08/2026. Em produção,
 * naquele dia, 390 das 756 chegadas (51,6%) eram eco — e só no tráfego pago,
 * que é 100% do investimento em mídia.
 *
 * **Por que o filtro existe mesmo com o defeito já corrigido.** O `proxy.ts`
 * parou de gravar o eco a partir de 24/08/2026, mas o histórico de 13/08 em
 * diante já está no banco, e é ele que a tela mostra quando alguém abre "30d".
 * Sem esta leitura, o painel continuaria inflado por trinta dias — e a decisão
 * (24/08, do Kairo) foi limpar na LEITURA, não apagar linha: o dado cru fica
 * para auditoria e para provar o próprio defeito.
 *
 * **Por que 2 segundos.** O eco medido nasce entre 8ms e 1,4s depois do
 * original; a menor distância entre duas chegadas humanas reais observadas está
 * na casa dos minutos. Dois segundos separa os dois mundos com folga larga dos
 * dois lados. Não é heurística sobre comportamento: é o tempo de rede de um
 * prefetch.
 *
 * Espera a tabela `visits` com alias `v`, como `VISITA_DE_GENTE`.
 */
export const VISITA_NAO_E_ECO = sql`NOT EXISTS (
  SELECT 1 FROM visits eco
  WHERE eco.visitor_id = v.visitor_id
    AND eco.created_at < v.created_at
    AND v.created_at - eco.created_at < ${sql.raw(`interval '${JANELA_DE_ECO}'`)}
)`;

/**
 * A visita que CONTA como chegada: de gente e não repetida.
 *
 * É este o denominador de toda taxa de aquisição do painel. Os dois cortes
 * andam juntos de propósito — uma tela que aplicasse só um deles mostraria uma
 * população diferente das outras, com o mesmo rótulo, e o operador não teria
 * como saber qual das duas acreditar.
 */
export const VISITA_CONTAVEL = sql`(${VISITA_DE_GENTE} AND ${VISITA_NAO_E_ECO})`;

/**
 * A CONVERSA ATRIBUÍDA — o corte que o funil de mídia aplica em toda etapa
 * depois de `visitas`: só conta conversa que nasceu de uma visita, no período.
 *
 * Sem ele, conversa sem origem (WhatsApp orgânico, conversa anterior à
 * instrumentação de atribuição) entrava no funil e o resultado ficava MAIOR que
 * o topo — um funil que cresce, mostrando 328%.
 *
 * Nasceu local a `performance-queries.ts` e saiu quando a tela de Campanhas
 * passou a precisar do MESMO recorte para declarar as conversas que ficam fora
 * (o complemento, logo abaixo). Duas telas com duas definições de "conversa do
 * funil" divergem no primeiro dia, com o mesmo rótulo.
 *
 * O alias da conversa entra por parâmetro — `c` nas duas telas de hoje — porque
 * amarrar ao alias faria o fragmento compilar num lugar e explodir no outro.
 */
export function conversaAtribuida(de: Date, ate: Date, conversa: SQL = sql`c`): SQL {
	return sql`${conversa}.is_simulated = false
    AND ${conversa}.visit_id IS NOT NULL
    AND ${conversa}.created_at BETWEEN ${de} AND ${ate}`;
}

/**
 * O COMPLEMENTO exato de `conversaAtribuida`: a conversa do período que **não**
 * nasceu de uma visita — WhatsApp orgânico e conversa anterior à instrumentação.
 *
 * Existe para que a tela de Campanhas possa dizer quantas conversas ficaram
 * fora do funil sem inventar um segundo critério: sem esta linha, o total de
 * conversas de Campanhas fica MENOR que o da tela de Conversas e ninguém sabe
 * por quê.
 */
export function conversaSemOrigem(de: Date, ate: Date, conversa: SQL = sql`c`): SQL {
	return sql`${conversa}.is_simulated = false
    AND ${conversa}.visit_id IS NULL
    AND ${conversa}.created_at BETWEEN ${de} AND ${ate}`;
}

/**
 * A CONVERSA VEIO PELO WHATSAPP.
 *
 * `conversations.waId` é preenchido no nascimento de toda conversa de WhatsApp
 * (`src/lib/whatsapp/session.ts`): o canal entrega o número — e o nome de perfil
 * (pushName) — sem o cliente digitar nada.
 *
 * **É a definição de "identificado" no canal, por decisão do dono (23/09/2026):**
 * *"whatsapp entrou já pode considerar que se identificou, já na web, você tem
 * que considerar quando conseguirmos coletar"*.
 */
export function conversaDeWhatsapp(conversa: SQL = sql`c`): SQL {
	return sql`${conversa}.wa_id IS NOT NULL`;
}

/**
 * O CONTATO QUE O CLIENTE INFORMOU — telefone ou e-mail gravado no LEAD.
 *
 * É o que existe na web, onde o canal não entrega nada: o telefone/e-mail do
 * lead veio do formulário. Na conversa de WhatsApp este contato também existe
 * (o lead nasce com o telefone do canal), mas lá quem decide é
 * `conversaDeWhatsapp` — o `wa_id` fala pelo canal, não pelo preenchimento.
 */
export function contatoInformadoPeloCliente(lead: SQL = sql`l`): SQL {
	return sql`(${lead}.phone IS NOT NULL OR ${lead}.email IS NOT NULL)`;
}

/**
 * O LEAD IDENTIFICADO — a regra é do CANAL, não do preenchimento.
 *
 * Decisão do dono (23/09/2026): conversa de WhatsApp → identificado (o canal já
 * entregou número e perfil); conversa de web → identificado quando conseguimos
 * COLETAR o contato (telefone ou e-mail no lead).
 *
 * **O que esta regra NÃO faz: deduzir identificação pelo nome.** No WhatsApp o
 * nome da conversa é o pushName do canal, que chega na PRIMEIRA mensagem —
 * exigi-lo não mediria nada do cliente, mediria o canal. Foi por isso que a
 * versão anterior (nome E contato) fazia "Se identificaram" empatar com
 * "Conversas" e ainda assim subcontava quem só tinha o nome na conversa.
 *
 * Quem conta LINHA de lead (o cartão "Leads hoje") usa este fragmento; o degrau
 * do funil conta CONVERSA — ver `conversaIdentificada`.
 *
 * Espera as tabelas `leads` e `conversations`, com os aliases por parâmetro.
 */
export function leadIdentificado(lead: SQL = sql`l`, conversa: SQL = sql`c`): SQL {
	return sql`(${conversaDeWhatsapp(conversa)} OR ${contatoInformadoPeloCliente(lead)})`;
}

/**
 * O LEAD COM CONTATO CONHECIDO — telefone ou e-mail, tenha o cliente informado
 * ou não.
 *
 * É o número ANTIGO, e ele não some da tela: é o que a régua usa para saber se
 * **pode falar** com a pessoa (sem telefone não há toque). Ele e
 * `leadIdentificado` medem coisas diferentes de propósito — funil e capacidade
 * de contato — e por isso aparecem lado a lado, com nomes distintos, em vez de
 * um escolher pelo outro.
 */
export function leadComContato(lead: SQL = sql`l`): SQL {
	return sql`${lead}.phone IS NOT NULL OR ${lead}.email IS NOT NULL`;
}

/**
 * A CONVERSA CUJO CLIENTE SE IDENTIFICOU — o degrau "Se identificaram" do funil
 * de mídia, do Percurso, da Exportação e da tela de Campanhas.
 *
 * **Fonte única dos quatro**, para que o mesmo degrau não meça duas populações
 * em telas diferentes.
 *
 * A regra é a do dono (23/09/2026), por CANAL: conversa de WhatsApp (`waId`
 * presente) conta sempre; conversa de web conta quando conseguimos coletar o
 * contato (telefone ou e-mail no lead, com `is_simulated = false`).
 *
 * O `EXISTS` (e não um `JOIN`) é o que mantém a conversa na lista quando ela não
 * tem linha em `leads` — que é o caso de quase metade das conversas de WhatsApp
 * medidas em produção.
 */
export function conversaIdentificada(conversa: SQL = sql`c`): SQL {
	return sql`(
    ${conversaDeWhatsapp(conversa)}
    OR EXISTS (SELECT 1 FROM leads li
      WHERE li.conversation_id = ${conversa}.id
        AND li.is_simulated = false
        AND (li.phone IS NOT NULL OR li.email IS NOT NULL))
  )`;
}

/**
 * As CONTAGENS do funil por origem/campanha — a definição de cada degrau num
 * lugar só.
 *
 * `computeOrigens` (funil por canal) e `computeCampanhas` (funil por campanha)
 * medem a MESMA jornada, só que agrupada por dimensões diferentes. Enquanto as
 * duas listas de `count` moravam cada uma no seu arquivo, uma correção em
 * `identificados` valia para uma tela e não para a outra — e as duas divergiam no
 * primeiro dia, com o mesmo rótulo. Aqui a contagem existe uma vez, e quem
 * agrupa só escolhe o `GROUP BY`.
 *
 * Espera as tabelas com os MESMOS aliases que `computeOrigens` já usava:
 * `visits v`, `conversations c`, `leads l`, `bevi_proposals bp`. Quem não usa
 * `qualificados` simplesmente ignora a coluna.
 *
 * `identificados` conta CONVERSAS cujo cliente se identificou
 * (`conversaIdentificada`) — no WhatsApp, quem entrou (o canal entregou número e
 * perfil); na web, quem deixou contato. É a MESMA definição do funil de mídia
 * (`computeFunilMidia`). Contando leads, uma conversa com dedup imperfeito
 * entrava duas vezes e a coluna "Identificados" divergia da etapa "Se
 * identificaram" do funil, na mesma tela, com o mesmo rótulo. `com_contato` é a
 * coluna vizinha — outro fato, não a mesma coisa: mede quem a régua consegue
 * ALCANÇAR (telefone/e-mail no lead), e não são ordem um do outro (a conversa de
 * WhatsApp sem linha em `leads` é identificada e não tem contato no lead).
 */
export function contagensDoFunil(): SQL {
	const qualificados = sql.join(
		ESTAGIOS_QUALIFICADOS.map((estagio) => sql`${estagio}`),
		sql`, `,
	);
	return sql`
    count(DISTINCT v.id) FILTER (WHERE ${VISITA_NAO_E_ECO}) AS visitas,
    count(DISTINCT c.id) AS conversas,
    count(DISTINCT c.id) FILTER (WHERE ${leadComContato()}) AS com_contato,
    count(DISTINCT c.id) FILTER (WHERE ${conversaIdentificada(sql`c`)}) AS identificados,
    count(DISTINCT l.id) FILTER (WHERE l.stage IN (${qualificados})) AS qualificados,
    count(DISTINCT bp.id) AS propostas,
    count(DISTINCT l.id) FILTER (WHERE l.stage = 'fechado_ganho') AS fechados
  `;
}

/** Artifacts que provam que o cliente VIU número de oferta na tela. */
export const ARTIFACTS_DE_OFERTA = ["real_offer", "simulation_result"];

/** Os mesmos tipos, prontos para um `IN (...)` de SQL. */
export const ARTIFACTS_DE_OFERTA_SQL = sql.join(
	ARTIFACTS_DE_OFERTA.map((tipo) => sql`${tipo}`),
	sql`, `,
);
