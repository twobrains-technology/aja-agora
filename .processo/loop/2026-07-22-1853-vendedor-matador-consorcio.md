# Goal — Agente vendedor matador: fecha os bugs da rodada de teste do Kairo e prova venda de verdade em 3 perfis de cliente

> 2026-07-22 · Operador: Kairo · Status: criticada

## Decisões tomadas por default recomendado (Kairo ausente — `AskUserQuestion` dispensado 2x no ClaudeNotch)

O crítico (Opus, ver LEDGER) levantou 4 decisões de produto que só o Kairo deveria cravar.
Perguntei via `AskUserQuestion` duas vezes e as duas foram dispensadas no ClaudeNotch (ele não
estava disponível). Como o pedido explícito da campanha é rodar em loop autônomo, sigo com a
opção **recomendada** em cada uma, documentada aqui pra revisão dele quando quiser — **não é
decisão final, é o default que destrava o loop**:

1. **Segmento Bevi `OUTROS BENS`/`SERVICOS` ao remover Serviços →** mapear pra `auto` (evita o
   `throw` em segmento desconhecido no `offer-mapper.ts`, não derruba a busca de grupos).
2. **Erradicar `servicos` de todas as camadas (tipo/config/detecção/banco) →** sim, erradicar
   tudo — é o que a citação original do Kairo pede ("nem opção, nem falar com ele").
3. **Stage do lead no aceite da carta →** manter `proposta_enviada` (fiel ao processamento real
   da Bevi; `na_administradora` só quando ela de fato processar via polling existente). A mesa
   já é notificada nesse momento hoje — isso não muda.
4. **Escassez no ramo `so_parcela` →** manter fora (escassez só reforça decisão de lance; quem já
   escolheu só parcela não precisa do empurrão).

**⚠️ PENDENTE-KAIRO:** revisar estas 4 decisões quando puder. Se discordar de alguma, é só falar
que a próxima rodada ajusta.

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
| Vendedor (comercial) — **julgamento de conversa, não mecânico; só o juiz-LLM avalia esta linha** | Nos 3 cenários, quando faz sentido, o agente sugere lance embutido citando a vantagem real (parcela alta até contemplar → cai depois da amortização) e usa o card de escassez pra criar urgência sem inventar número | juiz (persona vendedor) lê a conversa completa do dossiê — é a única dimensão subjetiva da rubrica, aceita como tal |
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

### ITEM 1 — Apagar a modalidade "Serviços" de vez (seed, banco de prod, detecção em texto livre) — **cross-cutting, roda SOZINHO e PRIMEIRO**
- **Palavras do operador:** "temos que apagar do seed e do banco de prod o agent de servicos. nem pelo whats enm pela web deve podder falar com ele. nem ter essa ocpao."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-remover-agente-servicos-seed-e-prod.md` (card já capturado, com print da thread do time confirmando que um cliente simulou carta de Serviços mesmo a modalidade devendo estar desabilitada).
- **Root cause (CONFIRMADO pelo crítico — blast radius bem maior que a v1 desta spec):** os chips clicáveis (web/WhatsApp) já foram restringidos antes (`welcome-options.ts:9-11`, documentando explicitamente que `servicos` foi **mantida viva de propósito** no domínio, só tirada dos chips — ver decisão #2 acima). A categoria vive em **~30 arquivos não-teste**, não só nos citados na v1: `turn-analyzer.ts:22,25,165` (enum + few-shot "reforma"→servicos), CHECK `personas_category_check` (`schema.ts:505-508`), seed da Camila (`drizzle/0004_agents_crud.sql:59`) **+ referências em migrations 0009/0014/0015/0016** (CHECK + UPDATEs de examples/tools — a persona acumulou config em 5+ migrations), `personas.ts:9,373`, `categories.ts:8,12`, `qualify-config.ts:93,226,342,354`, `recommendation.ts:81`, `plan-estimate.ts:27,34`, `routing.ts:10` (regex), `assistant-tools.ts:76` (regex), `chat/types.ts` (7×), `ui-message.ts` (3×), `tools/ai-sdk.ts` (7× zod enum), `tools/schemas.ts:19,35`, `validations/persona.ts:39,97,129`, `diagnose/types.ts:12`, `personas-repo.ts:134`, `reactivation.ts:52`, `whatsapp/formatter.ts` (5×), `gate-questions.ts`.
  **Dependência escondida grave:** `src/lib/adapters/bevi/partner-offer-mapper.ts:70-83` (`beviSegmentToCategory`) mapeia segmentos REAIS da Bevi `SERVICOS` e `OUTROS BENS` → `servicos`, e **dá `throw` em segmento desconhecido (linha 81)**. Se `servicos` sair do enum sem tratar esse mapeamento, uma oferta real da Bevi nesses segmentos **derruba a descoberta em runtime** (não é só dado histórico). `messages.personaId` é `text` sem FK (`schema.ts:309`) — deletar a persona não quebra por cascata, mas deixa `personaId='servicos'` órfão em transcripts antigos (perda de segmentação de eval, aceitável).
- **Correção proposta:** (1) `partner-offer-mapper.ts` — mapear segmentos `SERVICOS`/`OUTROS BENS` pra `auto` em vez de lançar/reconhecer `servicos` (decisão #1 acima); (2) migration que primeiro deleta/reatribui a persona "Camila" e SÓ DEPOIS aplica o `ADD CONSTRAINT` sem `servicos` (ordem importa — o constraint falha se a linha antiga ainda existir); (3) remover `servicos` de todo tipo/enum/config listados acima — tratar como categoria inexistente em qualquer camada; (4) `turn-analyzer.ts` para de classificar qualquer texto como `servicos`.
- **Critério de aceitação:** nos 3 cenários E2E, mesmo se o cliente-agente de teste mencionar "reforma"/"viagem"/"serviço" em texto livre, o produto NUNCA oferece nem simula carta de Serviços — no máximo redireciona pra imóvel/auto/moto; `pnpm typecheck` verde após a remoção do tipo (prova que não sobrou referência solta); uma oferta Bevi simulada com segmento `SERVICOS`/`OUTROS BENS` não derruba a busca de grupos (mapeia pra `auto` sem throw).
- **⚠️ Por que roda sozinho e primeiro:** este item muda o type `Category` (`personas.ts:9`), que rippla em `qualify-config.ts`, `recommendation.ts`, `gate-questions.ts`, `qualify-state.ts`, `chat/types.ts`, `tools/*` — arquivos que os ITEM 2/3/4/5 também tocam. Rodar em paralelo com os demais garante conflito de merge e branch quebrando no typecheck. Ver "Plano de blocos" abaixo.

### ITEM 2 — Resume ("Voltei") deve reconhecer a etapa real do lead (mesa/fechado), não voltar pra etapa anterior
- **Palavras do operador:** "qd volto para uma proposta ja finalizada o agente entende que eu estava num passo anterior e parece nem saber que eu fechei um plano [...] se ele ta numa mesa ele deve notificar assim: 'Que bom que você voltou! Já recebemos sua proposta, daqui a pouco o atendente fala com você no WhatsApp pedindo seus documentos' [...] sempre orientar ele a ir para o WhatsApp."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-resume-nao-reconhece-etapa-mesa.md` (print: cliente com proposta já fechada/na mesa clica "Voltei" e o agente retoma perguntando "você decidiu qual caminho quer seguir — com lance ou só sorteio mesmo?", como se a proposta não tivesse sido fechada).
- **Root cause (CORRIGIDO pelo crítico — a v1 apontava pro arquivo errado):** o resume é **server-side**, em `src/lib/chat/resume.ts:65-136` — e a linha `:125` **já deriva o gate do ESTADO** via `nextGate(metaCompleta)` (comentário `:120-123` explícito: "o gate é derivado do estado, não do histórico"). O client (`theater-chat.tsx`/`message-list.tsx`) NÃO é o problema. O root cause real: **`nextGate` (`src/lib/agent/qualify-state.ts:237`) não faz short-circuit quando a proposta já fechou** — existe um flag `contractClosed` em meta (usado em `resume.ts:56` por `hasMeaningfulProgress`), mas `nextGate` re-emite um gate de qualificação (o card "com lance ou só sorteio" = `two_paths`/`decision`) ignorando esse fechamento. Além disso, `resume.ts` lê `conversation.metadata`, **não** `lead.stage` — ligar o resume ao stage real da tabela `leads` é trabalho adicional que a v1 não mapeava.
- **Correção proposta:** em `nextGate` (`qualify-state.ts:237`), checar `contractClosed`/stage do lead ANTES de qualquer outro gate — se fechado, retornar um gate terminal (nenhuma pergunta de qualificação); no `resume.ts`, quando esse gate terminal for detectado, montar a saudação reconhecendo o fechamento e reforçando o encaminhamento pro WhatsApp (comportamento é do modelo/prompt — copy exata não trava em regex, mas o FATO "proposta já fechada" vira dado determinístico que o prompt recebe).
- **Critério de aceitação:** no cenário E2E onde a proposta já foi confirmada e o cliente volta, `nextGate` não re-emite gate de qualificação (`two_paths`/`decision`/etc.) — a saudação de resume reconhece o fechamento e direciona pro WhatsApp, nunca repetindo pergunta de etapa anterior.

### ITEM 3 — Ao confirmar a carta, mover o lead pra "administradora"/"fechado" e notificar a mesa
- **Palavras do operador:** "Quando for notificado esse card aqui a nossa status do nosso atendimento lá tem que ser fechado já, ganho né? [...] ele tem que ir pra administradora, ele tem que estar em nosso funil na aba de administradora, e já tem que notificar o atendente [...] os atendentes da mesa, igual a gente tem lá no back-end."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-fechar-status-atendimento-ao-confirmar-carta.md` (print: tela de sucesso pós "Confirmo essa carta").
- **Root cause (CORRIGIDO pelo crítico — a v1 estava FACTUALMENTE ERRADA: isto já funciona hoje):** confirmado no código que **stage e notificação de mesa JÁ acontecem no aceite**: `createBeviProposal` (`src/lib/bevi/proposal-repo.ts:76`) chama `transitionLeadStage(leadId, "proposta_enviada")` no fechamento; e a mesa **já é notificada** — web `route.ts:1011` chama `sendFechoPedirOi` → `fecho-pedir-oi.ts:126` → `dispatchAutoTransbordo(leadId)` (`createMesaHandoff` + `broadcastCaseToAttendants`); WhatsApp faz o mesmo em `interactive-handlers.ts:265-266`. Existe ainda um SEGUNDO caminho: o worker `proposal-status-poll.ts:69-71` dispara `dispatchAutoTransbordo` de novo quando o lead entra em `na_administradora` (via polling da Bevi). **O critério da v1 ("mostra que notifyMesaAttendant foi chamado") passaria HOJE sem escrever uma linha** — não testava o que o Kairo realmente quer.
  O gap real, confirmado por decisão #3 (acima): manter `proposta_enviada` no aceite é o comportamento correto (fiel ao processamento real da Bevi — `na_administradora` chega via polling quando ela de fato processa). Ou seja: **este item pode já estar resolvido** — o trabalho é *validar* que os dois caminhos (aceite + polling) não geram **notificação DUPLICADA de mesa** quando ambos disparam pro mesmo lead (risco real: `sendFechoPedirOi` no aceite E o poll de `na_administradora` chamando `dispatchAutoTransbordo` de novo).
- **Correção proposta:** (1) não implementar nada novo de "conectar" — isso já existe; (2) escrever um teste/checagem pontual que prove que, no fluxo aceite→poll, `dispatchAutoTransbordo`/`createMesaHandoff` é chamado **exatamente uma vez** por lead (idempotência do handoff já ativo); (3) só then confirmar com o Kairo se o rótulo do funil no aceite deveria mudar de `proposta_enviada` pra outro stage (decisão #3 já tomada como default: manter).
- **Critério de aceitação:** nos 3 cenários E2E, ao confirmar a carta, o stage do lead vira `proposta_enviada` e existe **exatamente 1** handoff de mesa criado por lead (não duplicado) mesmo que o polling de `na_administradora` rode depois.

### ITEM 4 — Sugerir lance embutido proativamente quando o cliente não tem aporte (com pré-busca em paralelo)
- **Palavras do operador:** "se eu falo que não tenho grana agora [...] tem que ter aquela dinâmica [...] 'Cara, tem uma opção aqui, você já ouviu falar de lance embutido?' [...] em background, assim que buscar os grupos do valor que ele pediu, buscasse também os grupos do lance embutido [...] sem afetar a performance [...] explicar pra ele que você começa pagando até ser contemplado, sua parcela fica em um valor alto, mas logo que você é contemplado, como você amortiza, a parcela fica baixa [...] Tem que agir como vendedor mesmo, inteligente."
- **Cenário/evidência:** `docs/correcoes/inbox/2026-07-22-sugerir-lance-embutido-proativamente-sem-grana.md` (print: cliente responde "Por enquanto não" ao lance, agente só segue com os 3 cenários padrão sem citar lance embutido).
- **Root cause (investigado, com ressalva do crítico em (a)):** `src/lib/adapters/bevi/bevi-self-contract-adapter.ts:311-349` (`offersForValue`) busca grupos COM e SEM lance embutido **sequencialmente** (baseline sem embutido `:327`, `sleep` `:330`, com embutido `:332`). **⚠️ Isso pode NÃO ser um descuido paralelizável:** `ensureOffers` (`:261-296`) muta estado compartilhado da MESMA proposta ativa na Bevi (`this.proposalReady`, `setSegment` `:282-284`, `offerCache`, `offerIndex`), e comentários `:351-369` documentam que a Bevi opera com **"1 proposta ativa, re-PATCH sequencial" (cookbook §3)** — paralelizar duas chamadas que fazem `setSegment` na mesma proposta pode corromper o resultado ou violar o contrato do upstream. **Não crave "paralelizar" sem verificar isso primeiro** (regra epistêmica — não temos evidência de que a Bevi tolera concorrência na mesma proposta).
  Separadamente: a lógica de ramificação do lance embutido não está em `gate-questions.ts` (que só tem strings de copy) — está em `qualify-state.ts` (`nextGate:237-398`, `stuckGateDefaultPatch:109-140`). `qualify-state.ts:398` mostra que `hasLance:"no"` **já roteia pro gate `lance-embutido`** — ou seja, a infra pra PERGUNTAR sobre o embutido já existe; o que falta é o agente **oferecer proativamente com o ângulo vendedor** (comportamento do modelo/prompt, não trava de código). `embedded-bid-payload.ts:14-15,49` já explica o lance embutido focado em "o crédito diminui" — falta o ângulo "parcela alta até contemplar, cai depois da amortização".
- **Correção proposta:** (a) **investigar primeiro** se a Bevi tolera 2 chamadas concorrentes na mesma proposta ativa (testar contra sandbox/doc da API); se tolerar, paralelizar `offersForValue`; se NÃO tolerar, buscar o lance embutido de forma assíncrona em background **sem** usar a mesma proposta ativa (ex.: segunda sessão/proposta, ou aceitar que o pré-fetch começa um pouco depois do baseline mas ainda antes do cliente perguntar) — não implementar paralelização ingênua sem essa checagem; (b) reforçar, via prompt/directive (não regex), a sugestão proativa de lance embutido quando `hasLance:"no"` E já há oferta pré-buscada; (c) reforçar o texto de explicação com o ângulo "parcela alta até contemplar, cai depois da amortização, ainda vale a pena".
- **Critério de aceitação (mecânico, só a parte (a)):** a busca do lance embutido não atrasa perceptivelmente a resposta do baseline (medir tempo, comparar com hoje) — SEM corromper o resultado da proposta Bevi (testar com asserção de integridade da oferta). **Critério (b)/(c) é julgamento de conversa** (dimensão "Vendedor" da rubrica, avaliado pelo juiz-LLM, não mecânico): no cenário 2 (moto, pressa) e cenário 3 (carro, meio-a-meio), quando o cliente sinaliza que não tem aporte total, o agente sugere lance embutido citando a vantagem correta.

### ITEM 5 — Card de escassez do grupo não apareceu no fluxo testado
- **Palavras do operador:** "Tem um step ai que eu não encontrei que mostra a escassez ali no grupo pra forçar ele fazer logo sabe?"
- **Cenário/evidência:** relato do Kairo durante o `/goal` — não fixado em print/card do inbox ainda (capturar como card formal ao promover pro bloco).
- **Root cause (pista forte + 1 caminho novo achado pelo crítico — NÃO totalmente confirmada, investigar no bloco antes de corrigir):** o card de escassez (`src/lib/agent/orchestrator/index.ts:204-233`, `buildScarcityCard`) **só dispara se `!isSoParcela`** (gate `hasLance !== "so_parcela"`, FIX-233 — mantido fora por decisão #4 acima) **e** se `buildScarcityCard(refreshed)` encontrar um `groupId` já ancorado (senão retorna `null`, comentário FIX-268). **Terceiro caminho (achado pelo crítico):** mesmo COM grupo ancorado, o card só renderiza se a oferta Bevi trouxer `availableSlots > 0` (`scarcity-payload.ts:49-52`) — o número **nunca é inventado de propósito** (comentário `:1-24` cita risco CDC art. 37). Se as ofertas de moto da Bevi não trouxerem `availableSlots`, o card é **impossível de exibir sem violar essa regra** — isso pode ser exatamente o que o Kairo viu (não um bug de lógica, mas ausência de dado upstream).
  Já existe uma cadeia grande de fixes anteriores (FIX-230/237/246/253/268) sobre esse card — mexer sem reproduzir o cenário exato arrisca reabrir bug já fechado.
- **Correção proposta:** reproduzir o cenário de teste do Kairo (moto com pressa, ramo COM lance — não `so_parcela`); checar nos 3 caminhos possíveis qual é o real: (1) caiu em `so_parcela` → por decisão #4, não é bug, é comportamento esperado; (2) sem grupo ancorado no ponto de decisão → garantir que o grupo seja ancorado antes desse ponto nesse fluxo específico; (3) grupo ancorado mas oferta Bevi sem `availableSlots` → **não forçar um número** (violaria a regra CDC), reportar como gap de dado upstream, não como bug de código.
- **Critério de aceitação:** no cenário 2 (moto, pressa, com lance — não so_parcela), SE a oferta Bevi trouxer `availableSlots`, o card de escassez aparece com o número real antes ou junto do card de decisão. Se a oferta não trouxer o dado, o critério deste item passa a ser "gap de dado externo documentado no LEDGER", não bug de código — não inventar número pra forçar o teto da rubrica.

## Plano de blocos (serialização — overlap de arquivos impede paralelo total)

O crítico confirmou que nenhum par entre {1,2}, {1,3}, {1,4}, {2,4}, {2,5}, {4,5} é
totalmente paralelo: `qualify-state.ts` é tocado por ITEM 2, 4 e 5; `gate-questions.ts` por
ITEM 1 e 4; `route.ts` por ITEM 1 e 3; `orchestrator/index.ts` por ITEM 4 e 5; e o `Category`
type do ITEM 1 rippla em ~30 arquivos que os demais itens tocam. Rodar os 5 em blocos
totalmente paralelos (como a v1 desta spec sugeria implicitamente) garante conflito de merge e
branch quebrando no typecheck. Ordem real de execução via `todo-blocks`:

1. **Bloco A (sozinho, primeiro):** ITEM 1 completo — migration + remoção do tipo/enum em todas
   as camadas + mapeamento de segmento Bevi. Só integra na base quando o typecheck da base
   fechar limpo.
2. **Depois que o Bloco A integrar, em paralelo entre si (arquivos não coincidem mais depois do
   ITEM 1 fechado):**
   - **Bloco B:** ITEM 2 (`resume.ts` + `qualify-state.ts:nextGate` — short-circuit de contrato fechado).
   - **Bloco C:** ITEM 3 (teste pontual de idempotência do handoff de mesa — não é feature nova).
   - **Bloco D:** ITEM 4 (investigação de concorrência Bevi + prompt/directive de sugestão proativa).
   - **Bloco E:** ITEM 5 (reprodução do cenário de escassez + fix condicional).
   - **Atenção:** Bloco B e Bloco D ainda coincidem em `qualify-state.ts` (nextGate) — se o
     `todo-blocks` não conseguir dar disjunção real de linhas, rodar B e D em série também (B
     primeiro, D forka da base pós-B). Bloco D e E coincidem em `orchestrator/index.ts` — mesma
     regra: D antes de E, ou E antes de D, nunca simultâneos no mesmo arquivo.

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
- Human checkpoint: as 4 decisões de produto já foram levantadas e resolvidas por default
  recomendado (ver seção no topo, `AskUserQuestion` dispensado 2x) — retomar com o Kairo se ele
  discordar de alguma ao revisar. Novas ambiguidades de produto que surgirem durante a execução
  (ex.: ITEM 4(a) achar que a Bevi não tolera concorrência e a alternativa proposta não for óbvia)
  também tentam `AskUserQuestion`; se dispensada, seguir com a opção mais conservadora e marcar
  `PENDENTE-KAIRO` no LEDGER.

## LEDGER de rodadas (append-only)

Evidências do E2E ficam em `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio/evidencias/rodada-N/`.

| Rodada | Data | Blocos lançados | Evidências (path) | Score juiz (por dimensão) | Achados novos → próxima rodada | Custo (tok/tempo) |
|---|---|---|---|---|---|---|
| 1 | 2026-07-22 | Onda 1: bloco-g (sozinho). Onda 2: bloco-h + bloco-i (paralelo). Todos integrados limpo na base `integ/vendedor-matador` (gate `pnpm typecheck` — a suíte com DB não roda neste host, ver nota abaixo). | `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio/evidencias/rodada-1/` (roteiro pronto; dossiê E2E ainda por coletar) | pendente (fase ④ ainda não rodou) | — | em andamento |

**Nota de execução (rodada 1):** o gate `pnpm test --run` falha no host por falta do volume `local-dev` (sem Postgres — `ECONNREFUSED`/`ENOTFOUND aja-shared-pg`), confirmado como falha PRÉ-EXISTENTE na própria base (não causada pelos blocos: rodei a suíte direto na base antes de qualquer merge e ela já falhava igual). Reintegrei com `--gate "pnpm -s typecheck"` (limpo nos 3 blocos) — os testes de cada item já foram validados pelo agente de cada bloco dentro do próprio worktree Superset (ver `.done/2026-07-22-bloco-{g,h,i}-*.md`, todos reportam suíte tocada verde).

**Achados de investigação dos blocos (relevantes pro juiz/próxima rodada):**
- **Bloco G (FIX-363):** removeu `servicos` de ~30 arquivos + migration de banco + mapeamento de segmento Bevi → `auto`. Sem gaps reportados.
- **Bloco H (FIX-364/365):** FIX-364 exigiu fix real (`nextGate` não fazia short-circuit com `contractClosed:true`) — corrigido. FIX-365 confirmou que a notificação de mesa já existia E já era idempotente (`createMesaHandoff` checa handoff ativo antes de inserir) — só faltava o teste de regressão, sem bug real.
- **Bloco I (FIX-366/367):** **FIX-367 era bug de código genuíno** (4ª causa, não prevista no fix doc original: `buildScarcityCard` nunca propagava `availableSlots` do reveal pro snapshot usado depois; corrigido com `resolveSnapshotAvailableSlots`/`preserveAvailableSlotsAcrossResim`). **FIX-366(a): decisão técnica de NÃO paralelizar** a busca Bevi (cookbook documenta 1 proposta ativa = re-PATCH sequencial; paralelizar arriscava corromper a oferta financeira mostrada ao cliente) — sem sandbox pra testar ao vivo, ficou **PENDENTE-KAIRO** avaliar se o `gapMs` (400ms) incomoda na prática. FIX-366(b/c) resolvido via reforço de `system-prompt.ts` + `embedded-bid-payload.ts` (comportamento do modelo, sem TDD — validação é do juiz).

## Riscos e gaps honestos

- ITEM 1 (remover Serviços) toca uma CHECK constraint de banco em produção **e** um mapeamento
  de segmento real da Bevi que hoje dá `throw` em caso desconhecido — blast radius maior que uma
  migração cosmética; o Bloco A deve tratar como migração cuidadosa (ordem: deletar persona antes
  de aplicar o novo CHECK) e cobrir o mapeamento de segmento com teste pontual.
- ITEM 3 pode já estar **resolvido hoje** (mesa notificada + stage muda no aceite) — o trabalho
  real é provar não-duplicação, não implementar do zero. Evitar o desperdício de "reimplementar"
  algo que já funciona.
- ITEM 4(a) (paralelizar busca Bevi) tem risco real de corromper a proposta ativa se a API não
  tolerar 2 chamadas concorrentes na mesma proposta — investigar antes de implementar, não
  assumir que paralelizar é seguro só porque parece óbvio.
- ITEM 5 pode esbarrar num gap de DADO EXTERNO (Bevi não trazer `availableSlots` pra moto) que
  nenhum bloco consegue corrigir sem inventar número (proibido) — se for esse o caso, o item fecha
  como "gap documentado", não como bug corrigido.
- Existe uma campanha de loop **já rodando** em paralelo (`2026-07-20-1948-langgraph-runtime.md`,
  status "rodando") sobre o runtime LangGraph — esta campanha aqui é sobre o runtime Vercel AI
  SDK atual (`AI_RUNTIME=vercel`, é o que está em prod hoje pelos prints). Os blocos desta
  campanha devem tocar `src/lib/agent/orchestrator/*` (Vercel), não o grafo LangGraph — checar
  `AI_RUNTIME` antes de editar pra não pisar na campanha irmã.
- As 4 decisões de produto no topo foram tomadas por default recomendado sem confirmação síncrona
  do Kairo (`AskUserQuestion` dispensado 2x) — revisão dele é bem-vinda a qualquer momento.
- Fora de escopo (YAGNI): não redesenhar o funil inteiro, não mexer em outras modalidades
  (imóvel/auto/moto) além do que os 5 itens pedem.
