# Goal — Agente vendedor matador: fecha os bugs da rodada de teste do Kairo e prova venda de verdade em 3 perfis de cliente

> 2026-07-22 · Operador: Kairo · Status: draft

## Objetivo macro

Fechar os 5 defeitos que o Kairo encontrou numa rodada de teste manual (thread de time + chat
web) e provar, com evidência de conversa real em 3 perfis de cliente (casa sem lance, moto com
pressa, carro meio-a-meio), que o agente age como **vendedor de consórcio bom** — sugere lance
embutido de forma proativa e vantajosa, usa escassez pra criar urgência, nunca oferece a
modalidade "Serviços", reconhece corretamente quando a proposta já está fechada/na mesa, e
dispara a notificação de mesa + mudança de stage no momento certo do fechamento. Encerra quando
um **juiz** com a cabeça de um **vendedor de consórcio experiente que virou especialista em
IA/LangGraph** (ver "Papel do juiz" abaixo) dá nota 10/10 nos 3 cenários e nos 5 itens.

## Definition of Done — a RUBRICA (mecanicamente checável)

Só encerra quando **todas** as dimensões batem o teto E o juiz (Opus, no fechamento) declara
"matador pra prod, vendedor nota 10".

| Dimensão | Critério de teto (o que o juiz exige pra dar pass) | Como checa (sobre o dossiê do coletor) |
|---|---|---|
| Negócio | Nenhuma simulação/carta de "Serviços" é possível em nenhum canal; lead avança pro stage certo (`na_administradora`/`fechado_ganho`) e a mesa é notificada no momento da confirmação da carta; resume reconhece proposta já fechada/mesa sem regredir a etapa anterior | E2E dos 3 perfis + inspeção de stage/notificação no dossiê |
| Funcional | `turn-analyzer` e qualquer outro ponto de detecção de categoria não classificam mais texto livre como `servicos`; busca de grupos com/sem lance embutido roda em paralelo (não sequencial); gate de "não tenho aporte" verifica se já há oferta de lance embutido pronta e oferece | log de asserções + diff dos arquivos tocados |
| Vendedor (comercial) | Nos 3 cenários, quando faz sentido, o agente sugere lance embutido citando a vantagem real (parcela alta até contemplar → cai depois da amortização) e usa o card de escassez pra criar urgência sem inventar número | juiz (persona vendedor) lê a conversa completa do dossiê |
| UX | Sem beco-sem-saída; saudação de retomada ("Voltei") consistente com a etapa real do lead; nenhuma modalidade fantasma nos chips | juiz percorre os prints/transcript como cliente real |
| UI | Copy pt-BR correta (acentos/cedilhas), cards renderizam sem erro nos 3 cenários (web) | screenshots do coletor |
| E2E/integração | Testes pontuais de regressão (TDD rápido, só onde há lógica/invariante) passam; typecheck/lint da base integrada verdes | saída de `pnpm typecheck`/`pnpm test` no LEDGER |

## Papel do juiz (persona explícita, pedida pelo Kairo)

O juiz da rodada (Sonnet) e o selo de fechamento (Opus) devem julgar **vestindo dois chapéus ao
mesmo tempo**:
1. **Vendedor de consórcio experiente** — sabe reconhecer objeção, sabe quando insistir em lance
   embutido, sabe usar escassez sem soar forçado, sabe fechar.
2. **Especialista em IA/agentes/LangGraph** — conhece os padrões de agente conversacional (grafo
   de estado, invariante-vira-código vs. conversa-é-do-modelo, tool-call determinístico
   server-side) e sabe apontar onde a arquitetura do Aja Agora está errando estruturalmente.

Ao encontrar um gap, o juiz deve perguntar: **"esse problema pode acontecer em outro lugar
parecido?"** — se sim, o achado deve pedir a correção **estrutural** (ex.: se o bug é "categoria
detectada mas nunca devia existir", checar se há OUTRA categoria/flag no mesmo estado; se é
"gate que não conversa com outro gate", checar todos os gates irmãos), não só o caso pontual
testado.

## Itens (o que a rodada corrige/implementa)

### ITEM 1 — Apagar a modalidade "Serviços" de vez (seed, banco de prod, detecção em texto livre)
- **Palavras do operador:** "temos que apagar do seed e do banco de prod o agent de servicos. nem pelo whats enm pela web deve podder falar com ele. nem ter essa ocpao."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-remover-agente-servicos-seed-e-prod.md` (card já capturado, com print da thread do time confirmando que um cliente simulou carta de Serviços mesmo a modalidade devendo estar desabilitada).
- **Root cause (investigado):** os chips clicáveis (web/WhatsApp) já foram restringidos antes (`welcome-options.ts`, só imóvel/auto/moto) — remoção superficial. Mas a categoria `servicos` continua viva embaixo: `src/lib/agent/turn-analyzer.ts` ainda **detecta "servicos" em texto livre** (reforma/viagem/educação/saúde); a persona "Camila" (seed em `drizzle/0004_agents_crud.sql`) continua cadastrada; `Category` type (`src/lib/agent/personas.ts`), `CATEGORY_META`, `CREDIT_BOUNDS` (`qualify-config.ts`), ranges de recomendação (`recommendation.ts`), `plan-estimate.ts`, `gate-questions.ts` e o formatter do WhatsApp seguem tratando `servicos` como categoria válida; há CHECK constraint `personas_category_check` no schema/banco permitindo o valor.
- **Correção proposta:** nova migration que remove a persona "Camila"/servicos do banco de prod + o valor `servicos` do CHECK constraint; `turn-analyzer.ts` para de classificar qualquer texto como `servicos` (trata como categoria inexistente, nunca ativável); tirar `servicos` de `Category`/`SPECIALIST_CATEGORIES`/`CATEGORY_META`/`CREDIT_BOUNDS`/ranges/`plan-estimate`/`gate-questions`/formatter — o objetivo é a modalidade deixar de existir em QUALQUER camada, não só na UI.
- **Critério de aceitação:** nos 3 cenários E2E, mesmo se o cliente-agente de teste mencionar "reforma"/"viagem"/"serviço" em texto livre, o produto NUNCA oferece nem simula carta de Serviços — no máximo redireciona pra imóvel/auto/moto.

### ITEM 2 — Resume ("Voltei") deve reconhecer a etapa real do lead (mesa/fechado), não voltar pra etapa anterior
- **Palavras do operador:** "qd volto para uma proposta ja finalizada o agente entende que eu estava num passo anterior e parece nem saber que eu fechei um plano [...] se ele ta numa mesa ele deve notificar assim: 'Que bom que você voltou! Já recebemos sua proposta, daqui a pouco o atendente fala com você no WhatsApp pedindo seus documentos' [...] sempre orientar ele a ir para o WhatsApp."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-resume-nao-reconhece-etapa-mesa.md` (print: cliente com proposta já fechada/na mesa clica "Voltei" e o agente retoma perguntando "você decidiu qual caminho quer seguir — com lance ou só sorteio mesmo?", como se a proposta não tivesse sido fechada).
- **Root cause (a confirmar, pista registrada):** suspeita em `src/components/chat/theater/theater-chat.tsx` / `message-list.tsx` — o resume provavelmente reconstrói contexto a partir do histórico de mensagens (pega a penúltima pergunta antes do fechamento) em vez de checar o `stage` real do lead (`na_administradora`/`em_atendimento`/`fechado_ganho`, ver ITEM 3). Precisa confirmar isso ao investigar o bloco.
- **Correção proposta:** o resume deve, antes de montar a saudação, checar o stage atual do lead; se `>= na_administradora`, a saudação reconhece o fechamento e reforça o encaminhamento pro WhatsApp (comportamento é do modelo/prompt — copy exata não trava em regex, mas o FATO "proposta já fechada" vira dado determinístico que o prompt recebe).
- **Critério de aceitação:** no cenário E2E onde a proposta já foi confirmada e o cliente volta, a saudação de resume reconhece o fechamento e direciona pro WhatsApp — nunca repete pergunta de etapa anterior (lance/sorteio) como se nada tivesse acontecido.

### ITEM 3 — Ao confirmar a carta, mover o lead pra "administradora"/"fechado" e notificar a mesa
- **Palavras do operador:** "Quando for notificado esse card aqui a nossa status do nosso atendimento lá tem que ser fechado já, ganho né? [...] ele tem que ir pra administradora, ele tem que estar em nosso funil na aba de administradora, e já tem que notificar o atendente [...] os atendentes da mesa, igual a gente tem lá no back-end."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-fechar-status-atendimento-ao-confirmar-carta.md` (print: tela de sucesso pós "Confirmo essa carta").
- **Root cause (investigado):** todas as peças **já existem**: `leadStageEnum` (`src/db/schema.ts`) já tem `na_administradora`, `em_atendimento`, `fechado_ganho`; a aba "Na Administradora" já existe no funil (`src/lib/admin/dashboard-types.ts`, `FUNNEL_STAGES`); o mecanismo de notificar mesa já existe (`notifyMesaAttendant` em `src/lib/whatsapp/mesa/notify.ts`, `buildDossierMessage` em `outbound.ts`, `claimMesaHandoff` em `src/lib/mesa/handoff.ts`). O ponto de confirmação é `startContract()` (web, `src/app/api/chat/route.ts:789`, action `contract-submit`) e `fireContract()` (WhatsApp, `src/lib/whatsapp/contract-capture.ts:201`). **Falta confirmar** (é o trabalho do bloco): se esses dois pontos, ao ter sucesso, já chamam a mudança de stage e `notifyMesaAttendant()` — ou se as peças existem mas não estão ligadas nesse gatilho específico.
- **Correção proposta:** se não estiver ligado, conectar `startContract()`/`fireContract()` (sucesso) → transição de stage pra `na_administradora` (ou `fechado_ganho`, decidir qual é o correto olhando o significado dos dois stages no funil) → `notifyMesaAttendant()` com o dossiê do lead. Reaproveitar os mecanismos existentes — não reinventar.
- **Critério de aceitação:** nos 3 cenários E2E, ao confirmar a carta, o dossiê mostra (via query no banco/log) que o stage do lead mudou e que `notifyMesaAttendant` foi chamado.

### ITEM 4 — Sugerir lance embutido proativamente quando o cliente não tem aporte (com pré-busca em paralelo)
- **Palavras do operador:** "se eu falo que não tenho grana agora [...] tem que ter aquela dinâmica [...] 'Cara, tem uma opção aqui, você já ouviu falar de lance embutido?' [...] em background, assim que buscar os grupos do valor que ele pediu, buscasse também os grupos do lance embutido [...] sem afetar a performance [...] explicar pra ele que você começa pagando até ser contemplado, sua parcela fica em um valor alto, mas logo que você é contemplado, como você amortiza, a parcela fica baixa [...] Tem que agir como vendedor mesmo, inteligente."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-sugerir-lance-embutido-proativamente-sem-grana.md` (print: cliente responde "Por enquanto não" ao lance, agente só segue com os 3 cenários padrão sem citar lance embutido).
- **Root cause (investigado):** `src/lib/adapters/bevi/bevi-self-contract-adapter.ts:311-349` (`offersForValue`) busca grupos COM e SEM lance embutido, mas **sequencialmente** (baseline sem embutido, depois com embutido após um `sleep`) — não em paralelo. `src/lib/agent/orchestrator/gate-questions.ts:160-165` (`LANCE_EMBUTIDO_ASK`) só oferece lance embutido se perguntado especificamente ali; se o cliente recusa (linha 239-240), a resposta "vou seguir sem considerar... se quiser, a gente volta depois" **fecha o assunto** e não é reaberta quando o cliente, no gate do lance NORMAL (linha 156), diz que não tem aporte. `src/lib/agent/orchestrator/embedded-bid-payload.ts:14-15,49` já explica o lance embutido, mas focado em "o crédito diminui" — falta o ângulo comercial de parcela alta→baixa.
- **Correção proposta:** (a) paralelizar as duas chamadas em `offersForValue` e cachear o resultado do lance embutido na memória da conversa assim que o valor é conhecido, mesmo sem o cliente ter pedido; (b) quando o gate de lance normal recebe recusa de aporte, checar se há oferta de lance embutido pré-buscada e a IA (via prompt/directive, não regex fixo) sugerir proativamente, citando a vantagem; (c) reforçar o texto de explicação do lance embutido com o ângulo "parcela alta até contemplar, cai depois da amortização, ainda vale a pena".
- **Critério de aceitação:** no cenário 2 (moto, pressa) e no cenário 3 (carro, meio-a-meio), quando o cliente sinaliza que não tem aporte total, o agente sugere lance embutido citando a vantagem correta, sem atraso perceptível de resposta (grupos já pré-buscados).

### ITEM 5 — Card de escassez do grupo não apareceu no fluxo testado
- **Palavras do operador:** "Tem um step ai que eu não encontrei que mostra a escassez ali no grupo pra forçar ele fazer logo sabe?"
- **Cenário/evidência:** relato do Kairo durante o `/goal` — não fixado em print/card do inbox ainda (capturar como card formal ao promover pro bloco).
- **Root cause (pista forte, NÃO totalmente confirmada — investigar no bloco antes de corrigir):** o card de escassez (`src/lib/agent/orchestrator/index.ts:204-233`, `buildScarcityCard`) **só dispara se `!isSoParcela`** (gate `hasLance !== "so_parcela"`, FIX-233) **e** se `buildScarcityCard(refreshed)` encontrar um `groupId` já ancorado — se não houver grupo ancorado, a função retorna `null` e nada aparece (comentário FIX-268 confirma esse caminho null). Hipótese: no fluxo que o Kairo testou, ou o cliente caiu no ramo "só parcela", ou chegou no ponto de decisão sem grupo ainda ancorado — em qualquer um dos dois casos o card de escassez é pulado por design atual, não por bug óbvio. **Antes de "corrigir"**, o bloco precisa reproduzir o cenário exato e confirmar qual dos dois caminhos é o real, porque já existe uma cadeia grande de fixes anteriores (FIX-230/237/246/253/268) sobre esse card — mexer sem reproduzir o cenário arrisca reabrir bug já fechado.
- **Correção proposta:** reproduzir o cenário de teste do Kairo (moto com pressa é o mais provável de precisar de urgência); se cair no ramo `so_parcela`, decidir (com o Kairo, se for ambíguo) se a escassez também deveria aparecer nesse ramo; se cair sem grupo ancorado, garantir que o grupo seja ancorado antes do ponto de decisão nesse fluxo específico.
- **Critério de aceitação:** no cenário 2 (moto, pressa), o card de escassez aparece com número real (nunca inventado) antes ou junto do card de decisão, reforçando a urgência.

## Cenários E2E (as 3 personas pedidas pelo Kairo — usadas na fase ④ VERIFICAR)

1. **Casa, sem lance, sem pressa** — cliente quer imóvel, deixa claro que não tem dinheiro pro
   lance agora e que não está com pressa (tempo não é problema). Verifica: não é oferecida
   modalidade Serviços (ITEM 1); o agente não força lance embutido de forma deselegante (esse
   cliente pode preferir só sorteio — vendedor bom não empurra o que não serve); resume depois
   de sair/voltar reconhece a etapa certa (ITEM 2, se chegar a uma proposta).
2. **Moto, com muita pressa** — cliente quer moto e está com urgência de contemplar rápido.
   Verifica: o agente SUGERE lance embutido proativamente como caminho de fechar rápido trazendo
   vantagem real (ITEM 4); o card de escassez aparece reforçando a urgência (ITEM 5); ao fechar,
   dispara stage+notificação de mesa (ITEM 3).
3. **Carro, "meio a meio"** — cliente tem parte do dinheiro pro lance, mas não tudo, e está em
   dúvida. Verifica: o agente age como vendedor consultivo, também sugere lance embutido como
   alternativa (ITEM 4), explica a mecânica de parcela alta→baixa; ao fechar, mesmo fluxo do
   ITEM 3.

O planner (Opus, fase ④) escreve o roteiro de conversa detalhado (o que cada persona fala em
cada turno) a partir destas 3 descrições antes da 1ª rodada de verificação.

## Model routing

| Fase | Modelo | Como se força |
|---|---|---|
| definir / criticar / plano | Opus (frontier) | `model: "opus"` (Agent tool) |
| executar (implementação do fix, blocos) | haiku/sonnet — pin por-bloco, **modo de urgência** (sem TDD ceremonial pesado; só teste pontual onde há lógica/invariante real) | `TB_BLOCK_MODEL` no `launch-blocks.sh` |
| ④ planeja o E2E (roteiro das 3 personas) | Opus (frontier), 1x/rodada | `model: "opus"` |
| ④ coleta o dossiê (visual, app logado/web) | haiku operando Claude in Chrome | `model: "haiku"` (só print + transcript; não julga) |
| ④ coleta o dossiê (conversacional, 3 personas) | haiku, segue o roteiro do planner | `model: "haiku"` (não decide nada novo) |
| ④ julga a RODADA (persona vendedor+especialista IA) | Sonnet, LÊ o dossiê | `model: "sonnet"` |
| ④ SELA o marco (fechamento) | `claude-opus-4-8`, LÊ o dossiê | `model: "opus"` (1x/marco) |

## Política de exits

- Exit primário: **verifier-pass** (juiz 10/10 matador nos 3 cenários + 5 itens — **Opus sela**
  no fechamento). Sem cap de rodadas / sem escalada automática — roda até passar, decisão do
  Kairo (`/goal` armado como stop hook da sessão).
- No-progress (2 rodadas sem ganho de score) → **troca de ângulo obrigatória**: reescreve a spec
  do item, decompõe diferente, sobe o modelo do bloco daquele item, ou reforça o roteiro do
  planner. NÃO encerra.
- Observabilidade: loga tokens/tempo por rodada no LEDGER.
- Human checkpoint: se o ITEM 3 (qual stage exato — `na_administradora` vs `fechado_ganho`) ou o
  ITEM 5 (qual dos dois ramos é o real, e se escassez deveria existir em `so_parcela`) exigir
  decisão de produto ambígua que o código não resolve sozinho, `AskUserQuestion` antes de cravar.

## LEDGER de rodadas (append-only)

Evidências do E2E ficam em `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio/evidencias/rodada-N/`.

| Rodada | Data | Blocos lançados | Evidências (path) | Score juiz (por dimensão) | Achados novos → próxima rodada | Custo (tok/tempo) |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## Riscos e gaps honestos

- ITEM 1 (remover Serviços) toca uma CHECK constraint de banco em produção — é mudança
  estrutural, não cosmética; o bloco que pegar esse item deve tratar como migração cuidadosa
  (não é "apagar linha de config").
- ITEM 3 e ITEM 5 têm partes "a confirmar" que só fecham depois de reproduzir o cenário real —
  os blocos que pegarem esses itens devem investigar ANTES de implementar (regra epistêmica:
  não cravar sem evidência).
- Existe uma campanha de loop **já rodando** em paralelo (`2026-07-20-1948-langgraph-runtime.md`,
  status "rodando") sobre o runtime LangGraph — esta campanha aqui é sobre o runtime Vercel AI
  SDK atual (`AI_RUNTIME=vercel`, é o que está em prod hoje pelos prints). Os blocos desta
  campanha devem tocar `src/lib/agent/orchestrator/*` (Vercel), não o grafo LangGraph — checar
  `AI_RUNTIME` antes de editar pra não pisar na campanha irmã.
- Fora de escopo (YAGNI): não redesenhar o funil inteiro, não mexer em outras modalidades
  (imóvel/auto/moto) além do que os 5 itens pedem.
