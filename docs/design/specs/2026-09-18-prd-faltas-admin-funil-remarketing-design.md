# PRD — faltas do admin, funil, remarketing e exportação de dados

> **Data:** 18/09/2026 · **Autor:** sessão-líder (Claude) a partir do briefing do Kairo · **Status:** aprovado para execução em equipe
> **Insumos:** `docs/design/planos/2026-09-18-briefing-faltas-admin-funil-remarketing.md` (17 itens com fala literal) ·
> transcrições de 15/09 e 18/09 relidas · WhatsApp do grupo (11→17/09) · `~/Downloads/aja-faltas/` (prints, `critica-ui-usabilidade.md`,
> `levantamento-tecnico.md`, `diagnostico-prod.md` — os três últimos gerados hoje, com `arquivo:linha` e queries).
> Os prints e o diagnóstico contêm dado pessoal — **não versionar**.

---

## 1. Contexto e problema

A Bruna (negócio) e o Gustavo (mídia) operam o painel para responder três perguntas: *quantos entram e onde param*,
*com quem já falamos de novo e quando falamos de novo*, *qual mídia paga vale a pena*. Hoje o painel responde as três
com números que mentem ou não existem:

| Sintoma na tela | Causa provada | Fonte |
|---|---|---|
| "Engajaram 99%" enquanto 47% das conversas web têm **uma única mensagem**, e ela é o texto do CTA ("Quero comprar um carro." ×47, "Oi! Quero comparar consórcios." ×11) | `engajou`/`escreveu` = `EXISTS messages.role='user'`, sem filtrar a mensagem pré-preenchida (`performance-queries.ts:151`, `percurso-queries.ts:123`) | diagnóstico §h; levantamento §1-2 |
| 11 (na verdade **12**) pessoas "Se identificou" e só 3 na régua | **a régua esteve desligada em produção até 11:47 de 18/09** (ligada durante a call); a régua **só aceita `channel='whatsapp'`** (4 dos 12 são web); **corrida do `last_inbound_at`** deixa NULL toda conversa WhatsApp com 1 mensagem (2 dos 12); 1 é telefone da equipe; 2 saíram da janela de 7 dias | diagnóstico §c-d; `remarketing-cycle.ts:297-350`; `actions/whatsapp.ts:29-66` |
| "Sem nome ainda" / "—" / "Anônimo d1c7" para a mesma pessoa | nome nunca chega a `contacts.name` (régua lê `ct.name`); lista lê `conversations.contactName`; a tool `save_contact_name` só é forçada em pergunta→resposta curta | levantamento §4-5 |
| Nenhuma coluna diz em que pé está o remarketing | dado existe em `remarketing_touches`; lista já é 1 query com LEFT JOIN (sem N+1) | levantamento §6 |
| Áudio: agente "não recebe nada" | **não existe transcrição no código**; áudio grava a string fixa "Áudio recebido" e não aciona turno; 0 falhas de download em 6 dias; em `39bd4482` o agente repetiu a mesma pergunta 16× em 6 dias | levantamento §17; diagnóstico §e-g |
| Filtro de período não propaga | Conversas e Pipeline têm filtro de data próprio, sem o cookie `aja_periodo`; não existe preset "tudo" | `filtros.tsx:13-16`, `date-range-filter.tsx:55-61` |
| "Nome não resolvido" com chave URL-encoded; "sem base" ×11 | nenhum `decodeURIComponent` em lugar nenhum; `custoPor` devolve `null` só por zero qualificados, sem distinguir falta de vínculo | `resolver.ts:140`, `campanhas-queries.ts:130` |
| Extração para o Gustavo (prazo **segunda 22/09**) | script atual é 1 linha por pessoa; pedido exige mensagem a mensagem com autoria e vínculo ausente nomeado | `scripts/exportar-percurso-prod.mjs:74-83` |

Transversal (crítica de UI): `Badge default` é coral = cor da ação primária e do alerta, usada para estado "Ativo/Aprovado"
em 7 telas; cores Tailwind cruas (`red/amber/emerald/green/blue-600`) fora dos tokens; parágrafos de rodapé em `text-xs` em
toda tela; três vocabulários para "sem nome" e três para "bem".

## 2. Norte

**Objetivo:** a Bruna abre o painel na terça (22/09) e vê números que batem entre telas, sabe quem está na régua e por que
quem não está não está, e o Gustavo recebe na segunda o lote de validação da extração.

**Critérios de sucesso (verificáveis por comando/teste):**

1. Performance e Percurso mostram o degrau **"Só mandaram a mensagem do anúncio"** e "Iniciaram a conversa"; conversa com só a
   mensagem pré-preenchida **não** conta como engajou/escreveu — teste de integração em `percurso-queries` e `performance-queries`.
2. Nome aprendido pelo agente (por tool, por gate ou por pushName) chega a `contacts.name` quando há contato resolvido; régua e lista
   exibem o mesmo nome — teste de integração.
3. Lista de conversas tem coluna **Remarketing** com `toques · próximo toque` **ou** motivo nomeado de estar fora; Percurso
   ≥ "Se identificou" tem coluna **Régua** com o mesmo dicionário e agregado "N fora, M na régua".
4. Tela da Régua abre com resumo (toques enviados, responderam, pediram sair, esgotaram, aguardando, elegíveis fora) que fecha com a
   soma das linhas — teste unitário sobre `remarketing-tela.ts`.
5. Lead web com telefone entra na régua (via template); conversa marcada como teste **sai** da régua em andamento; telefone de
   equipe/atendente nunca recebe toque; `last_inbound_at` é gravado na criação da conversa WhatsApp — testes de integração no ciclo.
6. Trocar o período em qualquer tela e navegar pelo menu mantém o intervalo em **todas** (inclusive Conversas e Pipeline); preset
   **"Desde o início"** existe.
7. Campanhas: chave URL-encoded aparece decodificada com badge "Nome pendente do gerenciador" (cru preservado em `title`/filtro);
   "sem base" vira um de três estados nomeados; linha "Sem origem conhecida" reconcilia CRM × funil; criativo (nível `ad`) por
   campanha quando o espelho tiver o dado.
8. Áudio do WhatsApp é transcrito (desligado por padrão via env) e vira turno normal do cliente; sem a env, o comportamento atual se
   mantém — teste de integração com transcritor fake.
9. Área **Exportação e dados** (`/admin/exportacao`) com três exportações em CSV/JSON (conversas mensagem a mensagem com autoria;
   percurso por pessoa; toques da régua), período, mascaramento por padrão, vínculo ausente escrito — e o **lote de validação do
   Gustavo** gerado pelo mesmo módulo até 22/09.
10. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `pnpm test:integration` verdes na base integrada; nenhum hex/cor Tailwind crua
    nova; toda copy nova em PT-BR com acento.

## 3. Restrições globais (valem para todas as frentes)

1. **Invariante vira código; conversa é do modelo** (`CLAUDE.md`). Nenhum guard de frase, nenhum regex sobre fala do cliente ou do
   agente. O predicado de "mensagem pré-preenchida" compara com **texto gerado pelo produto** (constantes do CTA) — é comparar com o
   próprio código, não com fala humana.
2. Prompt vive no Langfuse: mexeu em `system-prompt.ts` → só o líder roda `pnpm prompts:check`/`pnpm sync-prompts` (agente **não**).
3. `REMARKETING_ATIVO` e qualquer capacidade nova (transcrição, entrada web na régua) **nascem desligadas** por env ausente.
4. Toda copy visível em PT-BR com acento. Status **sempre ícone + rótulo**, cor é reforço. Cor só por token (`--success`, `--warning`,
   `--destructive`, `--muted-foreground`, escala `--chart-*`); `Badge default` (coral) deixa de representar estado.
5. `pnpm` único. Migrations Drizzle + teste de integração para tudo que toca banco. Commit local sim, push nunca (o líder integra).
6. Dado pessoal: telefone mascarado em toda lista (padrão da Régua); completo só na ficha. Export mascara por padrão.
7. Duas telas nunca respondem a mesma pergunta com regras/rótulos diferentes: dicionários únicos em `src/lib/admin/` (degraus,
   bem = Carro/Moto/Imóvel, "Sem nome", motivos de fora da régua, situações da régua).
8. Decisão de 22/09 (mensagem padrão e botões do WhatsApp — AJA-13) **não se implementa antes**; prepara-se.

## 4. Decisões assumidas pelo líder (Kairo dispensou a pergunta — confirmar quando voltar) `PENDENTE-KAIRO`

| # | Decisão | Por quê | Reversão se discordar |
|---|---|---|---|
| D1 | **Régua passa a aceitar lead web com telefone** (via template, mesma sequência) **e** ganha ação em lote "Enviar para a mesa" no Percurso | Kairo em 15/09 11:51: "só se identificou pela web e aí não tenho janela → tem que mandar template"; Bruna pediu a mesa em 15/09 | feature flag `REMARKETING_ENTRADA_WEB` (nasce vazia = desligada) |
| D2 | **Implementar transcrição de áudio** pelo gateway LiteLLM (`/audio/transcriptions`), atrás de `TRANSCRICAO_AUDIO_ATIVA` | Não há bug de download; sem transcrição o lead que fala por voz é perdido (16 repetições em `39bd4482`) | env ausente = comportamento atual |
| D3 | **Área "Exportação e dados"**: tela + 3 exportações + o lote do Gustavo pelo mesmo módulo | Pedido do Kairo nesta sessão; prazo 22/09 | o script do lote sai primeiro; a tela é incremental |
| D4 | AJA-01 vale **retroativamente** (o predicado lê o conteúdo já gravado; sem UPDATE de histórico) | Evita migração de dados; números passam a bater desde 20/08 | — |
| D5 | Predicado de "pré-preenchida" = primeira mensagem `role='user'` da conversa igual (após trim/normalização de espaços) a uma constante do CTA ou com prefixo de semente de campanha; `chat_open.label='chip'` reforça na web | Levantamento §1; texto dinâmico das sementes exige prefixo | dicionário em um arquivo só |
| D6 | `ChatIniciado` da web continua medindo abertura (é o desenho, `inicio-de-conversa.ts:20-28`); no WhatsApp o evento passa a exigir mensagem não pré-preenchida | Gustavo (18/09 11:39): "a partir da segunda conversa que ele responde, aí contabiliza" | evento novo `conversa_iniciada` fica para o Gustavo decidir |

## 5. Design — por área

### 5.1 Funil e medição (AJA-01, AJA-17, "cheiro de perfil")

- **Novo módulo `src/lib/funil/mensagem-pre-preenchida.ts`**: `ehMensagemPrePreenchida(texto, canal)` + `SQL` equivalente
  (`condicaoDeMensagemPrePreenchida()` para Drizzle/`sql`) usando as constantes reais: web `"Quero comprar um carro."`,
  `"Quero comprar uma moto."`, `"Quero comprar um imóvel."`, `"Automóvel"`, `"Imóvel"`, `"Moto"` (chips), prefixos
  `"Quero um carro. Consigo pagar "`, `"Quero um carro de "` (e moto/imóvel — importar de `src/app/(verticais)/*/conteudo.ts`,
  não duplicar); WhatsApp `PRIMEIRA_FALA` de `chat-flutuante.tsx:13`. Teste unitário com a tabela do diagnóstico §h.
- `performance-queries.ts` e `percurso-queries.ts`: `engajou`/`escreveu` = existe mensagem do usuário **que não é pré-preenchida**;
  novo predicado `so_pre_preenchida`. Degraus (`percurso-types.ts`, fonte única de rótulos): "Abriu o chat" · **"Só mandou a mensagem
  do anúncio"** (ajuda: "Mensagem pré-preenchida e nada mais") · **"Iniciou a conversa"** (ajuda: "Escreveu algo além da mensagem
  pré-preenchida") · "Se identificou" · …
- Performance: marcador de **meta 4%** no primeiro degrau (linha tracejada + ícone `Target` + texto "acima/abaixo da meta"; tooltip
  "Meta acordada em 15/09: ao menos 4% de quem clica no WhatsApp inicia a conversa"). Cabeçalho: o % vs meta é o número maior.
  Notas de rodapé viram `Tooltip` em `InfoIcon`.
- AJA-17: nota vira `ⓘ 9 conversas sem origem conhecida ficam fora deste funil · Ver as 9` (link `/admin/conversations?origem=desconhecida`,
  criar o valor no filtro se não existir). A exclusão do funil **não muda** (restrição 7 do briefing).
- Bloco "Quem chegou" em Performance: distribuição por Bem (Carro/Moto/Imóvel) entre quem iniciou a conversa (`bar-list.tsx`);
  faixa de valor só se for persistida por lead (verificar `leads`/`metadata`; se não, só Bem).
- Percurso: escada ganha % relativa ao degrau anterior (a barra absoluta esconde 11 vs 18 vs 2).

### 5.2 Nome e contato (AJA-02 + corrida do `last_inbound_at`)

- `contact-capture.ts` `saveContactName`: se a conversa tem `contactId`, `UPDATE contacts SET name` (só se nulo ou diferente, sem
  sobrescrever nome mais completo por um mais curto); `saveContactWhatsapp`/`attachContact` recebem o `name` já sabido
  (`conversations.contactName ?? leads.name`) para não perder nome que chegou antes do telefone.
- `persist.ts:292-317` (gate `name`) e pushName (`run-turn.ts:99`) passam pelo mesmo caminho de sincronização (um helper
  `sincronizarNomeDoContato(conversationId)`).
- `detect-name-turn.ts`: além de pergunta→resposta curta, forçar `save_contact_name` quando o turno anterior do **agente** citou um
  nome que não está gravado é **arriscado** (regex sobre fala) — **não fazer**. Em vez disso: o `turn-analyzer`/`capture` já extrai
  entidades; se houver `contactName` no estado do grafo e a coluna estiver vazia, persistir (é fato do servidor, não regex).
  Registrar no Langfuse um score `nome_capturado` por conversa para medir cobertura.
- **Corrida**: `session.ts` grava `lastInboundAt = now()` ao **criar** a conversa WhatsApp; `updateLastInboundAt` passa a ser
  aguardada depois da criação (ou removida do caminho pré-criação). Teste de integração: primeira mensagem de número novo →
  `last_inbound_at` não nulo. Backfill: migration `UPDATE conversations SET last_inbound_at = (SELECT max(created_at) FROM messages
  WHERE role='user' …) WHERE channel='whatsapp' AND last_inbound_at IS NULL`.
- UI: vocabulário único **"Sem nome · (83) 9…-9307"** / **"Sem nome · d1c7"** em Conversas, Percurso, Régua e Agora. Nunca "—",
  nunca "Anônimo".

### 5.3 Admin da régua e das conversas (AJA-03, AJA-04, AJA-09-UI, AJA-10-UI, AJA-11, sistema de badges)

- `badge.tsx`: variantes `success` e `warning` com tokens; `default` deixa de ser usado para estado nas telas do admin.
- **Dicionário `src/lib/admin/motivo-fora-da-regua.ts`**: `MotivoForaDaRegua = "conversa_web" | "sem_telefone" | "sem_contato" |
  "parada_ha_mais_de_7_dias" | "encerrada" | "com_atendente" | "telefone_da_equipe" | "teste" | "ainda_em_silencio" | "regua_desligada"`
  com rótulos PT-BR; função pura `motivoForaDaRegua(conversa, agora)` que **espelha as guardas de `entrarNaRegua`** (mesma ordem) —
  e teste que prova a equivalência: para cada fixture, `motivo === null ⇔ entrarNaRegua aceitaria`.
- Lista de Conversas (`api/admin/conversations/route.ts` + `conversations-table.tsx`): coluna **Remarketing** substitui Qualidade
  (que vai para a ficha): `Megaphone "1 de 3 · próximo 21/09 às 11:48"` · `Check "Respondeu após o toque 2"` ·
  `PauseCircle "Segurada pelo atendente"` · `Ban "Pediu para sair"` · `Flag "Esgotou os 3 toques"` ·
  `CircleSlash "Fora da régua · <motivo>"` · `Clock "Entra em 40 min"`. Um `LEFT JOIN remarketing_touches` (índice único por
  `conversation_id`). Coluna Canal grafa "WhatsApp"; coluna "Categoria" vira **"Bem"** com Carro/Moto/Imóvel (dicionário único).
  Pill `FlaskConical "Teste"` / `Users "Equipe"` ao lado do nome quando `include_simulated` (o campo `isSimulated` passa a vir no JSON).
- Ficha (`conversation-detail-panel.tsx`): bloco "Régua de remarketing" com linha do tempo dos toques + Segurar/Soltar
  (reaproveitar `AcaoDaRegua`); confirmação de uma linha no "Marcar como teste": "Esta conversa e o lead saem das métricas e da régua."
- Tela da Régua: **primeiro bloco = resumo** (`Toques enviados` · `Responderam (n%)` · `Pediram para sair` · `Esgotaram os 3 toques` ·
  `Aguardando o próximo toque · próx. dd/mm` · `Elegíveis que ainda não entraram`) + badge `Power "Ligada"`/`PowerOff "Desligada"`
  (estado já vem da API); **segundo bloco = lista**; funil por passo renomeia colunas ("Chegaram ao passo" · "Seguiram" · "Saíram
  neste passo" · "Ainda esperando") e remove "Queda"; "Qual toque converte" colapsa em `Collapsible` enquanto for tudo zero.
  `remarketing-tela.ts` ganha `resumoDaRegua(linhas)` com teste; renomear `remarketing-insights.test.ts` → `remarketing-tela.test.ts`.
- Percurso (`components/admin/percurso/*`): coluna **Régua** (mesmo dicionário) em qualquer filtro ≥ "Se identificou"; cabeçalho
  "11 de 4.576 · 8 fora da régua, 3 na régua"; checkbox por linha + **"Enviar para a mesa"** (`Headset`) → handoff em lote
  (`POST /api/admin/percurso/enviar-para-mesa` com ids; usa o handoff existente em `src/lib/whatsapp/mesa/*`). Telefone mascarado.
- Sidebar (`app-sidebar.tsx`): grupos **Acompanhamento** (Agora, Performance, Campanhas, Percurso, Mapa de calor) · **Operação**
  (Conversas, Pipeline, Régua de remarketing, Templates WhatsApp, Simulador, **Exportação e dados** → `/admin/exportacao`) ·
  **Cadastros** (Atendentes, Atendentes de mesa, Administradoras, Agentes, Cadastro da régua). `href`s existentes não mudam.
- Cadastro da régua: badge "Padrão de fábrica" só quando o valor é o padrão; "Editado" quando difere; indicador ligada/desligada.

### 5.4 Motor da régua (AJA-09, AJA-10, AJA-14, equipe)

- `remarketing-cycle.ts` `entrarNaRegua`: com `REMARKETING_ENTRADA_WEB=true`, aceita `channel='web'` quando `contact_id` tem
  telefone válido (o envio já é por template, sem janela). Log estruturado de **motivo de exclusão** por conversa avaliada (o mesmo
  dicionário de 5.3, exportado de `src/lib/remarketing/`; `motivo-fora-da-regua.ts` do admin importa daqui — **uma fonte**).
- `listarVencidas`: exclui `is_simulated=true` e telefones de equipe/atendente; o PATCH `isSimulated=true`
  (`api/admin/conversations/[id]/route.ts`) também marca `remarketing_touches.status='SEGURADO'`/`motivoSaida='teste'`.
  Teste de integração: marcar como teste depois de entrar → nenhum toque novo.
- Telefones internos: sair do hardcode `TELEFONES_INTERNOS_EM_CODIGO` para `mesa_attendants` + `attendants` + env
  `TELEFONES_DA_EQUIPE` (lista); o de `motor.ts:65` vira semente de migration.
- AJA-14: `arteDoObjetivo` só envia arte quando o objetivo é **conhecido**; sem objetivo → texto sem imagem (nunca a arte do carro
  para quem não disse o bem). Referência `(ref …)` na mensagem do CTA continua (é a atribuição) — o que muda é UI/copy do CTA, não
  aqui. Teste unitário no motor.
- Fim da janela de 7 dias com a régua desligada: **não** reabrir retroativamente (decisão: quem saiu da janela vai para a lista
  "fora da régua · parada há mais de 7 dias" e a Bruna decide pela mesa).

### 5.5 Período (AJA-05) + higiene do Mapa de calor

- Conversas (`conversations-filters.tsx`) e Pipeline (`pipeline-content.tsx`) adotam `<DateRangeFilter/>` (URL + cookie), removendo o
  par De/Até próprio. Preset **"Desde o início"** em `PRESETS` (`from` = 2026-08-18, data do início do coletor, constante nomeada).
  Chip de período `Calendar "20/08 – 18/09 · 30 dias"` no cabeçalho de toda tela (componente único). Teste do parser não muda.
- Mapa de calor: rótulos de alvo concatenados sem separador ("PROPÓSITOO setor") — corrigir a extração (juntar nós de texto com
  espaço); três blocos explicativos viram tooltip; "440 de raiva" ganha rótulo "cliques de raiva ⓘ".

### 5.6 Campanhas e mídia (AJA-06, AJA-07, AJA-08, AJA-17-campanhas)

- `src/lib/meta-ads/rotulo-legivel.ts`: `decodificarChaveDeCampanha(chave)` (`+`→espaço, `decodeURIComponent` tolerante). Só
  apresentação: `linha.chave`, `?campanha=` e `title` mantêm o cru (`titulo-da-origem.ts:39`). Badge `TriangleAlert "Nome pendente do
  gerenciador"` (tooltip com o que fazer); id numérico → "Campanha nova · nome pendente".
- `campanhas-queries.ts` `custoPor` devolve `{valor | motivo: "sem_qualificado" | "sem_gasto" | "sem_vinculo"}`; `formato.ts`
  imprime "Sem qualificado no período" / "Sem gasto informado" / "Sem vínculo com o CRM" (ícones `Minus`/`WalletCards`/`Unlink`).
  Descrição da ordenação muda quando não há custo. Cartão Meta × CRM: dois números rotulados, o do CRM em destaque, "diferença +252".
- Linha final fixa **"Sem origem conhecida"** (Leads CRM = N, investimento "—") para reconciliar com Conversas.
- Criativo (AJA-06): `lerAnuncios()` passa a pedir `creative{id,name,thumbnail_url,effective_object_story_id}`; espelho ganha colunas
  `creative_id`, `creative_name`, `thumbnail_url` (migration); linha da campanha expansível com sub-tabela "Criativos" (nome ·
  visitas · iniciaram conversa · identificados, casando `utm_content` ↔ `ad_id`/`creative_id`); estado "Criativo não informado pelo
  anúncio". **Permissão do token** (`ads_read` no System User) é verificação do líder contra a Graph API — o agente implementa com
  fixture e deixa a chamada tolerante a `#100`/`#200` (campo não permitido → coluna vazia com estado explícito).
- Colunas escondidas por `overflow-x-auto`: prioritárias fixas + "mais colunas" em `Collapsible`.

### 5.7 Áudio (AJA-15)

- `src/lib/whatsapp/transcricao.ts`: `transcrever(bytes, mime)` via gateway LiteLLM (`${LITELLM_BASE_URL}/audio/transcriptions`,
  modelo `TRANSCRICAO_MODELO` default `whisper-1`), com timeout e erro tipado. Ativa só com `TRANSCRICAO_AUDIO_ATIVA=true`.
- `midia-do-cliente.ts`: após `deps.baixar`, **loga `bytes.length`, `mimeType`, duração se disponível** (medição que não existia);
  se áudio e transcrição ativa → `content = transcrição` (com `metadata.transcricao = {modelo, duracaoMs, confiancaSeHouver}`) e
  **dispara o turno** (`processTextMessage` com o texto transcrito, mesma rota do texto); se falhar/vazio → `content = "Áudio recebido
  (não foi possível transcrever)"` e o agente responde pedindo texto (é fato do servidor: a transcrição falhou).
- Teste de integração com transcritor fake (bytes → texto), sem rede. `.env.example` documenta as duas variáveis. Registro no
  Langfuse: span `transcricao` com duração e tamanho.

### 5.8 Exportação e dados (AJA-16 + área nova)

- **Módulo `src/lib/exportacao/`** (puro, testável): `exportarConversas({de, ate, mascarar, formato})` → uma linha por **mensagem**:
  `conversation_id, contact_id, lead_id, canal, origem (utm_source/medium/campaign/content ou "sem vínculo: sem visita"),
  experimento (utm_campaign/utm_content crus — "não estruturado: derivado de utm"), msg_id, ordem, autoria (cliente|agente|atendente|
  sistema), tipo (texto|áudio|imagem|documento|template), conteudo, criado_em, etapa_no_momento (de lead_events), etapa_final,
  resultado_comercial (stage), remarketing (status/step), dado_indisponivel (lista)`; `exportarPercurso(...)` (evolui
  `exportar-percurso-prod.mjs`, adiciona "vínculo ausente" escrito); `exportarToquesDaRegua(...)`. **Toda célula vazia vira texto
  explícito** ("sem vínculo: conversa sem visita", "indisponível: nome não capturado") — regra do pedido do Gustavo.
- Mascaramento por padrão: telefone `55629***6793`, e-mail `m***@dominio`, nome só primeiro nome; `--completo` exige confirmação
  (tela: switch "Incluir dado pessoal completo" com aviso).
- **Tela `/admin/exportacao`** ("Exportação e dados"): três cartões (o que sai, quantas linhas no período, botões CSV/JSON),
  período pelo `DateRangeFilter`, switch de mascaramento, texto "Vínculos ausentes saem escritos, nunca em branco", histórico das
  últimas exportações (quem, quando, recorte) em tabela `exportacoes` (migration) para auditoria de LGPD.
- API `GET /api/admin/exportacao/<tipo>?from&to&formato&mascarar` com streaming; só `admin`.
- **Lote de validação (22/09):** `scripts/exportar-lote-validacao.mjs` chama o módulo contra `DATABASE_URL` de produção pelo túnel
  (leitura), 20 conversas do teste de growth (do 10/09 em diante), CSV + JSON, mascarado. Quem roda é o **líder**, não o agente.
  Entrega em `~/Downloads/aja-lote-validacao-2026-09-22.{csv,json}` + README de 10 linhas com prazo de disponibilidade dos dados.

### 5.9 Fala do agente e WhatsApp (AJA-12, AJA-13, AJA-14-copy)

- AJA-12: **não é código**. Passos: (1) líder roda `pnpm prompts:check` (o código já instrui a não listar faixas —
  `system-prompt.ts:371`; se prod diverge, é isso); (2) ajuste de prompt na seção da primeira pergunta: uma pergunta por turno na
  abertura, ≤2 frases, sem faixas até saber o bem; (3) **medição**: juiz no Langfuse `primeira_resposta_uma_pergunta` (score 0/1 +
  contagem de perguntas) sobre as conversas WhatsApp da semana; alvo ≥ 90%. Líder publica com `sync-prompts` na instância certa.
- AJA-13: documento `docs/decisoes/2026-09-18-primeira-mensagem-whatsapp-opcoes.md` com as duas opções prontas para terça:
  (A) conversa livre com prompt ajustado; (B) primeira resposta com **lista interativa** Carro/Moto/Imóvel reaproveitando
  `handleCategory` (`interactive-handlers.ts:104`) — com esforço, risco ("robótico", feedback do Edu) e como medir uma semana
  (taxa de 2ª mensagem). **Sem implementar.**
- AJA-14-copy: texto do CTA `PRIMEIRA_FALA` pode mudar ("frase mais crocante") sem quebrar atribuição — a `(ref …)` é o vínculo,
  não o texto. Fica para a decisão de terça junto com AJA-13.

## 6. Testes (pirâmide do projeto)

- **Integração com banco** (`pnpm test:integration`, padrão `describeIfDb` + janela de data sorteada + `semear`): funil (5.1), nome
  e corrida (5.2), lista com coluna de régua e motivo (5.3), ciclo da régua (5.4), exportação (5.8), áudio com transcritor fake (5.7).
- **Unitário**: dicionários, `resumoDaRegua`, `decodificarChaveDeCampanha`, `custoPor` com motivo, `motivoForaDaRegua` ⇔ `entrarNaRegua`.
- **Smoke** (só no fim, pelo líder, via `claude-in-chrome` no perfil Twin): abrir cada tela, período propagando, coluna Remarketing,
  export baixando. Sem Playwright.
- **Langfuse**: AJA-12 (juiz), `nome_capturado` (cobertura), span `transcricao`.

## 7. Equipe e ordem (execução por agentes Pi, um worktree por frente, escopo por arquivo)

| Frente | Itens | Rota | Pode editar (exclusivo) |
|---|---|---|---|
| **F1 funil-medicao** | AJA-01, AJA-17, meta 4%, "Quem chegou" | lithos | `src/lib/funil/**`, `src/lib/admin/performance-queries.ts`, `percurso-queries.ts`, `percurso-types.ts`, `filtro-origem.ts`, `src/components/admin/performance/**`, `src/components/admin/percurso/escada*`/funil (não a tabela) |
| **F2 nome-e-contato** | AJA-02, corrida `last_inbound_at`, vocabulário "Sem nome" (lib) | lithos | `src/lib/leads/contact-capture.ts`, `src/lib/contacts/**`, `src/lib/agent/langgraph/nodes/capture.ts`, `persist.ts`, `run-turn.ts`, `src/lib/whatsapp/session.ts`, `src/app/actions/whatsapp.ts`, `src/lib/admin/nome-exibido.ts` (novo), migration de backfill |
| **F3 admin-regua** | AJA-03, 04, 09-UI, 10-UI, 11, badges | lithos | `src/components/ui/badge.tsx`, `src/app/api/admin/conversations/route.ts`, `src/components/admin/conversations/conversations-table.tsx`, `conversation-detail-panel.tsx`, `src/lib/admin/remarketing-tela.ts`, `remarketing-queries.ts`, `remarketing-insights.test.ts`, `src/components/admin/remarketing/**`, `src/app/admin/(dashboard)/remarketing/**`, `src/components/admin/percurso/tabela*`, `src/app/api/admin/percurso/**`, `src/components/admin/app-sidebar.tsx`, `src/lib/admin/motivo-fora-da-regua.ts` (importa de `src/lib/remarketing/motivo-de-exclusao.ts` — F6 cria; até lá, tipo local) |
| **F4 periodo-e-calor** | AJA-05, mapa de calor | opencodego | `src/components/admin/conversations/conversations-filters.tsx`, `src/components/admin/pipeline/**`, `src/components/admin/dashboard/date-range-filter.tsx`, `periodo-provider.tsx`, `filtros.tsx`, `src/lib/admin/periodo*.ts`, `src/components/admin/mapa-de-calor/**`, `src/lib/heatmap/**` (só rótulos) |
| **F5 campanhas** | AJA-06, 07, 08, 17-campanhas | opencodego | `src/lib/meta-ads/**`, `src/lib/workers/meta-ads-sync-cycle.ts`, `src/lib/admin/campanhas-queries.ts`, `titulo-da-origem.ts`, `origem-label.ts`, `src/components/admin/campanhas/**`, `src/app/admin/(dashboard)/campanhas/**`, migration do espelho |
| **F6 regua-motor** | AJA-09, 10, 14, equipe | lithos | `src/lib/remarketing/**`, `src/lib/workers/remarketing-cycle*.ts`, `src/app/api/admin/conversations/[id]/route.ts`, `src/app/api/admin/remarketing/**`, `.env.example` (seção remarketing), migration de telefones internos |
| **F7 audio** | AJA-15 | opencodego | `src/lib/whatsapp/transcricao*.ts` (novo), `midia-do-cliente.ts`, `src/app/api/webhook/whatsapp/route.ts` (só o `case "audio"`), `.env.example` (seção transcrição) |
| **F8 exportacao** | AJA-16 + área | lithos | `src/lib/exportacao/**`, `src/app/admin/(dashboard)/exportacao/**`, `src/app/api/admin/exportacao/**`, `scripts/exportar-*.mjs`, migration `exportacoes` |
| **F9 fala** | AJA-12 (texto), AJA-13 (opções) | opencodego | `src/lib/agent/system-prompt.ts` (só a seção da abertura), `docs/decisoes/2026-09-18-primeira-mensagem-whatsapp-opcoes.md` |

**Arquivo fora do escopo → `.orientacao/pendencia-integracao.md`** (arquivo, o que precisa, por quê) e segue sem editar. O merge é do
líder, na ordem F2 → F6 → F1 → F3 → F4 → F5 → F7 → F8 → F9, com `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration`
depois de cada merge. Caminho crítico: **F8** (prazo 22/09) e **F1** (todo número que a Bruna olha).

## 8. Riscos e gaps honestos

- **Permissão do token da Meta** para `creative{thumbnail_url}` não está provada (não há escopo declarado no repo) — o líder testa
  contra a Graph API; se negar, AJA-06 entrega só `utm_content` como criativo.
- **"Experimento e versão"** do pedido do Gustavo não existem como dado estruturado — a coluna sai derivada de UTM e **declarada** como
  tal; confirmar com ele no lote.
- **Gateway LiteLLM e `/audio/transcriptions`**: precisa de modelo de ASR configurado no gateway (`tb-litellm-shared`); se não houver,
  a env fica desligada e o item vira `PENDENTE-KAIRO` com a evidência.
- **12 vs 11**: a call disse 11, o banco dá 12 — um provavelmente é o número interno; a UI passa a mostrar "Equipe" e resolve a dúvida.
- **Régua ligada só desde 11:47 de 18/09**: os números da régua na terça serão de 4 dias — dizer isso na tela ("Ligada desde 18/09").
- O predicado D5 depende dos textos do CTA; se o Lucas mudar o texto do chip, o dicionário precisa acompanhar — teste unitário com
  as constantes importadas (não copiadas) reduz o risco.

## 9. Fora de escopo (YAGNI)

CAC/conversão mínima (semana que vem, Bruna 12:18) · categorização dos comentários · peças de criativo (Lucas) · revisão do site
(Gustavo) · implementação dos botões/mensagem padrão do WhatsApp antes de 22/09 · de-para manual de nome de campanha em tela
(o espelho da Meta é a fonte; se falhar, o rótulo decodificado + badge basta por agora).
