# Spec — Dashboard da operação de venda: atribuição, marco zero, telas e CAPI

> 2026-08-03 · Kairo (via Claude) · Status: implementada (blocos 1 a 4)

## Contexto e problema

A operação de venda vai abrir com verba de mídia em quatro frentes ao mesmo tempo: Meta Ads
Click-to-WhatsApp, Meta Ads para o site, Google Ads e tráfego orgânico/indicação. O admin já tem
dashboard (`src/lib/admin/dashboard-queries.ts`): KPIs de lead, funil por estágio, volume diário e
split web × WhatsApp.

**O gap:** esse dashboard **começa no lead**. Antes disso não existia nada na nossa base — zero
captura de `utm_*`, `gclid` ou `fbclid`, nenhuma tabela de acesso, nenhuma ligação entre "quem
chegou pelo criativo X" e "quem virou lead". O GA4 (`GTM-KZXWKBZ3` / `G-SD0XH0VHED`, no
`src/app/layout.tsx`) sabia quem chegou; o Postgres sabia quem conversou; **ninguém ligava os
dois**. O `docs/visao/gap-analysis.md:20` já classificava isso como 🔴 "campanha às cegas".

Dois agravantes concretos, verificados no código:

1. **O webhook do WhatsApp jogava a atribuição fora.** `src/app/api/webhook/whatsapp/route.ts` lia
   `value.messages` e ignorava `message.referral` — o campo onde a Meta entrega `ctwa_clid`,
   `source_id` e `source_url` de um anúncio Click-to-WhatsApp. Esse campo chega **só na primeira
   mensagem depois do clique**: não havia segunda chance.
2. **Não existia Meta Pixel.** Só Google estava instalado.

Em paralelo, a base de produção carrega conversas de teste e piloto que contaminariam todo número
da operação nova — e CPF de gente real (`contacts.cpf`, ainda em texto puro por decisão registrada
no schema).

## Norte (objetivo + critérios verificáveis)

Fechar a corrente **visita → conversa → lead → proposta → contrato** dentro da nossa base, e
entregar um marco zero reproduzível. Critérios binários:

1. Uma chegada em `/?utm_source=...` grava linha em `visits` **sem depender de JavaScript**.
2. A conversa aberta na sequência aponta pra essa visita (`conversations.visit_id`).
3. Uma primeira mensagem de WhatsApp com `referral` grava a origem do anúncio, e a conversa criada
   logo depois a reivindica.
4. O mesmo clique não é reivindicado por duas conversas.
5. `pnpm crm:reset` zera o dado de operação e **preserva** login, persona, administradora,
   atendente e template aprovado — com o próprio script abortando se o `CASCADE` alcançar
   configuração.

## Decisões e por quê

### Server-side, não pixel de navegador — e no proxy, não na página

A visita é gravada em `src/proxy.ts`, no mesmo request que serve a landing. Pixel de navegador
perde de 20% a 30% do tráfego para bloqueador de anúncio e JS desligado — e o que se perde não é
aleatório: some justo o visitante mais protegido.

**O primeiro desenho estava errado e foi descartado.** A tentativa inicial dividia o trabalho entre
um `src/middleware.ts` (decidir + carimbar cookie) e a landing convertida em Server Component
(gravar no banco), porque `cookies().set()` não funciona em Server Component. Ao subir, o Next 16
recusou: `middleware.ts` está **depreciado** em favor de `proxy.ts`, e o projeto **já tinha** um
`src/proxy.ts` (o guard de sessão do `/admin`) — os dois juntos derrubavam o boot.

O `proxy.ts` acabou sendo o lugar melhor, não só o possível. Confirmado na doc do Next: **proxy
sempre roda em Node.js runtime** (o `runtime` config sequer é permitido lá) e pode gravar cookie na
resposta. Ou seja, é o único ponto do fluxo de entrada que faz as três coisas ao mesmo tempo:
alcança o Postgres, escreve cookie e roda antes da página.

Consequência boa: a landing **continuou client component e estática** — não paga TTFB dinâmico, e a
atribuição continua imune a bloqueador. O desenho anterior teria trocado o cache estático da página
mais importante do funil por nada.

### O que conta como visita

Uma linha por **chegada**, não por pageview (`decideVisit` em
`src/lib/attribution/visit-cookie.ts` — função pura, testada sem subir nada). Visita nova quando não
há visita válida no cookie, quando a
última passou de 30min de inatividade (convenção do GA4), ou quando o visitante chegou por anúncio
— **clique em anúncio abre visita nova mesmo dentro da janela**, senão o criativo que trouxe a
pessoa de volta não recebe crédito nenhum. Continuando a visita, a janela desliza, pra que uma
sessão longa de leitura não vire duas visitas. Prefetch e navegação RSC são ignorados.

Contar visita demais infla a taxa de conversão pra baixo; de menos, pra cima. Por isso a regra vive
isolada e coberta por teste.

### Atribuição é da conversa, e é definitiva

A conversa pertence à visita que a **originou** (last-touch no momento da criação). Um clique
posterior em outro anúncio registra visita nova, mas **não reescreve** a origem de uma conversa que
já existe — senão a última campanha levaria o crédito de uma venda que outra começou. First-touch
continua derivável pelo `visits.visitor_id`, sem tabela extra.

No WhatsApp isso vira "reivindicação": o webhook grava a visita, o processador cria a conversa
depois, e `findUnclaimedWhatsAppVisit` só devolve visita que nenhuma conversa pegou.

### Sem tabela genérica de eventos

Deliberadamente **não** criamos `funnel_events`. Todo marco do funil já é derivável de tabela real:
engajamento é `messages` com `role='user'`, simulação é `artifacts`, proposta é `bevi_proposals`,
fechamento é `leads.stage`. Uma tabela de eventos paralela seria uma segunda fonte de verdade pra
dado que já existe — a armadilha que já custou caro neste projeto.

### Atribuição nunca derruba a venda

Todo caminho em `src/lib/attribution/visit-store.ts` é best-effort com log explícito (nunca `catch`
mudo). Se gravar a origem falhar, o visitante continua navegando e o cliente continua conversando:
perdemos a linha da campanha, não o lead.

Caso concreto tratado: o cookie `aja_visit` **sobrevive a um reset da base**. Sem
`resolveVisitIdFromCookie` conferindo a existência, o primeiro cliente a voltar depois do marco
zero levaria erro de chave estrangeira no meio do chat.

### Marco zero: script, não migration

`scripts/reset-crm.ts` (`pnpm crm:reset`). Migration é pra schema; isto é operação de dados e será
rodada mais de uma vez — inclusive depois dos testes de campanha.

Três coisas além do SQL, senão o reset é meia-boca:

1. **Dump antes** — obrigatório contra banco remoto (aborta se `pg_dump` faltar).
2. **Objetos no S3** — deixar RG e comprovante órfãos no bucket depois de apagar o índice é o pior
   dos dois mundos: some do sistema e continua exposto.
3. **Memória do agente** — sem isso, cliente antigo volta e o agente "lembra" de uma conversa que o
   CRM não tem mais.

**Guarda contra tiro no pé:** banco remoto exige `--env` declarado e o nome do banco digitado por
extenso (`--yes` genérico é fácil demais de repetir do histórico do shell contra o ambiente
errado). E, dentro da transação, o script confere que cada tabela preservada manteve a contagem —
se o `CASCADE` alcançar configuração, ele desfaz tudo em vez de deixar descobrir depois que os
templates sumiram.

**Momento de rodar:** o script está pronto, mas o correto é executá-lo **depois** de a
instrumentação estar no ar, imediatamente antes de abrir a torneira de tráfego. Zerar antes só faz
o dado que entrar no meio-tempo nascer sem origem.

## Bloco 3 — as duas telas

`/admin` virou **Agora** (a sala de guerra) e `/admin/performance` recebeu o dashboard antigo
somado ao funil de mídia. Públicos e perguntas diferentes: "quem precisa de mim neste minuto" não é
"onde ponho a verba".

**Agora** atualiza sozinha a cada 15s: visitas na última hora, conversas ao vivo, quem está
esperando resposta, transbordo sem dono na mesa, leads e fechamentos do dia — e a lista das
conversas com movimento na última hora, cada uma com estágio, trecho da última fala, há quanto
tempo está parada e **a campanha que trouxe a pessoa**. Erro de rede mantém o último retrato na
tela e rotula: painel de plantão em branco é pior que dado de um minuto atrás bem identificado.

**Performance** mostra o funil de mídia, a série de aquisição, o desempenho por origem e, embaixo,
o funil comercial que já existia.

### Duas decisões de leitura que só a tela revelou

Ambos os defeitos passavam por typecheck e por teste — apareceram ao abrir a página:

1. **O funil crescia.** Mostrava 23 conversas para 7 visitas: 328%, com a barra estourando a caixa.
   Causa: conversa sem origem (WhatsApp orgânico, conversa anterior à instrumentação) entrando num
   funil cujo topo é a visita. **Correção:** toda etapa depois de `visitas` conta apenas conversa
   com `visit_id`. É isso que faz dele um funil de *mídia*; o funil comercial completo está logo
   abaixo na mesma tela, e a faixa de cobertura diz quanto um representa do outro.
2. **A ordem das etapas estava errada para este produto.** "Se identificaram" aparecia depois de
   "Viram oferta" e dava o dobro. Aqui a Bevi exige CPF para simular — o cliente **se identifica
   antes** de ver número. A ordem genérica de e-commerce não vale nesta jornada.

Os dois viraram teste de integração (`nunca cresce de uma etapa pra outra`, `põe a identificação
ANTES da oferta`), então não voltam.

A série de aquisição conta a **mesma população** do funil (conversa com origem): dois números com o
mesmo nome na mesma tela, medindo coisas diferentes, é como se perde confiança num painel.

## Bloco 4 — devolver a conversão pra mídia (atrás de flag)

Três marcos viram sinal: `qualificado` → `Lead`, `proposta_enviada` → `InitiateCheckout`,
`fechado_ganho` → `Purchase`. Deliberadamente poucos — mandar todo estágio ensinaria o algoritmo a
buscar quem **conversa**, não quem **compra**.

**O fato é registrado sempre; só o envio está atrás da flag.** Com `CONVERSIONS_API_ENABLED`
desligada os eventos ficam `pending` acumulando — e é esse estoque que permite, no dia de ligar,
mandar o histórico dos últimos 7 dias de uma vez em vez de começar a ensinar o algoritmo do zero.
Marcar como `skipped` esvaziaria justamente o que dá valor à decisão.

O ponto de disparo é `transitionLeadStage`, por onde toda transição já passava. O registro é
idempotente pela chave `<leadId>:<evento>` — garantida por índice único no banco, não pela boa
vontade do chamador — e nunca faz rede: transição de funil não pode ser desfeita por uma falha de
atribuição.

**Contrato conferido na doc oficial, não de memória:** `event_time` em segundos e no máximo 7 dias
atrás; `em`/`ph` em SHA-256 com normalização própria (e-mail em minúsculas, telefone só dígitos com
código do país); `fbc`, `fbp` e `ctwa_clid` **sem** hash; Click-to-WhatsApp usa
`action_source: business_messaging` + `messaging_channel: whatsapp`.

🔒 **A tabela nunca guarda PII crua** — e-mail e telefone entram já hasheados. Ela não é uma segunda
cópia do cadastro do cliente.

## O que ficou de fora (declarado)

- **Google Ads / Enhanced Conversions.** Só o destino `meta` está implementado (o enum já existe).
  O caminho do Google exige OAuth da Google Ads API — feature própria.
- **Quem chama o despacho.** `despacharConversoesPendentes()` existe e está testada, mas nenhum
  worker ou cron a invoca ainda: com a flag desligada isso não muda nada, e o gatilho certo deve ser
  decidido junto com o momento de ligar a chave.
- **Custo e CPL.** Fora desta fase por decisão: a dashboard mostra volume e conversão por
  origem/criativo; quem quer custo cruza com o gerenciador de anúncios.
- **`NEXT_PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID` e `META_CAPI_ACCESS_TOKEN`** ainda não têm valor.
  Sem eles nada é renderizado nem enviado — melhor não ter pixel do que ter um apontando pra conta
  de anúncio errada.

## Mapa da implementação

| Arquivo | Papel |
|---|---|
| `src/db/schema.ts` | Tabela `visits` + `conversations.visitId` |
| `drizzle/0037_light_marvel_zombies.sql` | Migration |
| `src/proxy.ts` | Decide a visita, grava e carimba os cookies (Node runtime) |
| `src/lib/attribution/params.ts` | UTM e click IDs (puro) |
| `src/lib/attribution/referral.ts` | `message.referral` do Click-to-WhatsApp (puro) |
| `src/lib/attribution/visit-cookie.ts` | Cookies e a regra de visita nova (puro) |
| `src/lib/attribution/visit-store.ts` | Persistência e reivindicação |
| `src/app/api/chat/route.ts` | Liga a conversa web à visita |
| `src/app/api/webhook/whatsapp/route.ts` | Lê o `referral` que era descartado |
| `src/lib/whatsapp/session.ts` | Conversa reivindica a visita do anúncio |
| `src/app/layout.tsx` | Meta Pixel por env var |
| `src/lib/crm/reset-tables.ts` | O que o marco zero apaga e o que preserva |
| `scripts/reset-crm.ts` | O marco zero |
| `src/app/admin/(dashboard)/page.tsx` | Tela **Agora** |
| `src/app/admin/(dashboard)/performance/page.tsx` | Tela **Performance** |
| `src/lib/admin/agora-queries.ts` · `agora-types.ts` | Pulso e conversas ao vivo |
| `src/lib/admin/performance-queries.ts` · `performance-types.ts` | Funil de mídia, origens, série |
| `src/lib/admin/origem-label.ts` | Dá nome à origem (puro) |
| `src/lib/admin/lead-stages.ts` | `STAGE_LABELS` extraído de dentro de um componente |
| `src/components/admin/agora/` · `performance/` | Componentes das duas telas |
| `src/lib/conversions/hash.ts` | Normalização + SHA-256 no formato da Meta (puro) |
| `src/lib/conversions/registry.ts` | Registra o marco (idempotente, sem rede) |
| `src/lib/conversions/meta-capi.ts` | Adapter da Conversions API |
| `src/lib/conversions/dispatch.ts` | Esvazia a fila — quando a flag deixa |
| `src/lib/admin/lead-transitions.ts` | Ponto único de disparo do marco |
| `drizzle/0038_giant_morbius.sql` | Migration de `conversion_events` |

## Cobertura de teste

- **Puro (unit):** `params.test.ts`, `referral.test.ts`, `visit-cookie.test.ts` — 28 casos sobre
  parsing, truncagem de entrada de terceiro e a regra de visita nova.
- **Integração (Postgres real):** `visit-store.integration.test.ts` — 14 casos sobre gravação,
  idempotência, reivindicação, janela de 24h, isolamento entre números, conversa simulada não
  atribuída e cookie sobrevivente ao marco zero.
- **Invariante de manutenção:** `reset-tables.test.ts` — toda tabela do schema precisa estar
  classificada. Tabela nova sem decisão vira build vermelho, não surpresa na hora de zerar produção.

### Validação no ambiente rodando (não só suíte verde)

Executado contra a stack local, com o app de pé:

| Cenário | Resultado |
|---|---|
| `GET /?utm_source=facebook&...&fbclid=...` com `Referer` do Facebook | 200; visita gravada com UTM, click ID, referrer e user agent |
| Refresh sem campanha, dentro da janela | **não** criou visita nova |
| Segunda chegada por anúncio do Google, dentro da janela | criou visita nova, mesmo `visitor_id` |
| `POST /api/chat` com o cookie | conversa gravada apontando pra visita do Google (last-touch) |
| Webhook do WhatsApp assinado, com `referral` de anúncio | 200; visita CTWA gravada e reivindicada pela conversa (`ctwa_clid`, `source_id`, headline) |
| Tabela `visits` ausente (antes da migration) | landing seguiu **200**, erro logado — atribuição não derrubou a venda |
| `pnpm crm:reset` em banco descartável | 19 tabelas zeradas, 9 preservadas intactas |
| `--confirm` com nome errado · remoto sem `--env` · `--skip-dump` remoto | abortou nos três |
| FK plantada ligando `mesa_attendants` a `conversations` | abortou e fez **rollback** — as duas tabelas intactas |
| Tela **Agora** aberta no admin, com dados semeados | pulso e lista corretos, origem por conversa, alerta de espera com ícone + texto |
| Tela **Performance** aberta no admin | funil decrescente (7→6→4→4→1), série, tabela por origem, funil comercial; zero erro no console |

### Correção de fora do escopo, feita no caminho

A stack local subia em restart loop com `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. O
`docker-compose.yml` já tinha `pnpm_config_confirm_modules_purge` desde 2026-07-26, mas a env é
**ignorada em silêncio** pelo pnpm 11 — verificado no próprio container: com a env,
`pnpm config get confirm-modules-purge` devolvia `undefined`; com a linha em `pnpm-workspace.yaml`,
devolve `false`. Mesma armadilha do `nodeLinker` no `.npmrc`. Config movida pro lugar certo e o
comentário do compose passou a apontar pra lá.
