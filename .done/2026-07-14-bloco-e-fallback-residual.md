# Bloco E — o fallback que não morreu + o opt-in que voltou por outra porta

## Resumo

Dois itens da rodada 2 do loop "desamarra-agente" (juiz Sonnet, 3/10): o sintoma-mor do produto
(servidor descarta a fala do modelo e cospe texto fixo) e o pedido de WhatsApp dentro do próprio
WhatsApp. Os dois têm a MESMA lição — blindar um caminho não resolve quando o mesmo comportamento
é montado em outro lugar — e as duas correções aplicam essa lição de forma literal: replicam, no
caminho que faltava, um fix que uma rodada ANTERIOR já tinha provado certo num caminho irmão.

## FIX-343 — o fallback enlatado ainda vazava em sub-turnos narrativos

### Root cause PROVADO (não corrigido no escuro)

Não consegui reproduzir com o LLM real vivo (sem stack completa de pé nesta sessão) — a causa foi
**provada por leitura de código + correlação byte-a-byte com o dossiê `moto-web.md` (rodada 2,
t15)**, depois **confirmada por reprodução determinística**: escrevi um teste de integração que
gera, com um mock de modelo controlado, o MESMO texto "Frankenstein" do dossiê real, palavra por
palavra (RED antes do fix, GREEN depois).

`dispatchDecisionCascade` (`orchestrator/index.ts`) roda sub-turnos **puramente narrativos**
(scarcity, decision/so_parcela) via `runTurn({ isUserTurn: false, ... })`. O directive de cada um
só proibia tool-call em TEXTO de prompt ("NÃO chame NENHUMA tool") — regra-no-prompt, não
invariante em código. Quando o modelo desobedecia e tentava uma tool removida do toolset
(`present_two_paths`/`present_decision_prompt`, server-side-only desde FIX-246/253), o AI SDK
emitia `tool-error` → o runner descartava toda a fala do sub-turno → o orchestrator materializava
`buildToolErrorRecoveryFallback` — texto escrito pra responder uma pergunta de usuário sobre
oferta, que não existe num sub-turno de transição. Pior: `dispatchDecisionCascade` não verifica o
resultado do `yield* runTurn(...)` interno — segue incondicionalmente e cola o card+texto
determinístico da cascata logo depois do fallback, produzindo o texto colado visto no dossiê.

**O mesmo defeito estrutural já tinha sido encontrado e corrigido** — pelo FIX-319 (rodada 10) —
no caminho IRMÃO: `pipeClosingCeremony` (`route.ts`, fecho por CLIQUE), via
`forceToolChoice: "none"`. Só faltava aplicar o MESMO mecanismo no caminho de TEXTO
(`dispatchDecisionCascade`), que é exatamente o caminho exercido no dossiê `moto-web` (confirmação
final por texto livre, não por clique).

**Achado adicional, fora de escopo:** o texto "reapresentar as opções" em `servicos-web.md` NÃO é
este bug — é o modelo tentando resolver uma administradora ALUCINADA ("Estrela"), mesma classe do
P0.1 (alucinação de oferta) do bloco-d.

### Correção
`forceToolChoice: "none"` nos 4 sub-turnos puramente narrativos de `orchestrator/index.ts`: os 2 de
`dispatchDecisionCascade` (scarcity, decision/so_parcela) + reco-consent aceito + o directive de
WhatsApp optin — mesmo mecanismo já provado pelo FIX-319, convertendo o invariante de
regra-no-prompt pra código (Lei 4). Sem guard novo, sem texto fixo novo, sem re-buscar a Bevi.

### Testes
- Novo: `index.fix-343-directive-turn-tool-error-vaza.integration.test.ts` — RED reproduziu o
  texto do dossiê byte-a-byte; GREEN confirma que o fallback nunca aparece e a cascata
  determinística segue intacta.
- `src/lib/agent/orchestrator/` inteiro rodado — 704 testes; os 5 únicos que falham são
  PRÉ-EXISTENTES (comparados com/sem este diff via `git stash`, falha idêntica nos dois lados —
  `index.fix-301-clarify-usuario-confuso` e `runner.fix-326-p4-gate-question-collision`, fora do
  escopo deste bloco).

## FIX-344 — o pedido de WhatsApp dentro do WhatsApp voltou por outra porta

### Root cause
`closingPresentation` (`closing-presentation.ts`) montava o beat "acabei de te mandar uma
mensagenzinha no seu WhatsApp... responde por lá com um oi" **sem nenhum parâmetro de canal**. O
FIX-338 (rodada 1) blindou `shouldEmitWhatsappOptin` — um guard DIFERENTE, que decide SE o card de
opt-in aparece. A COPY do fecho em si (função separada, chamada de outro lugar) nunca ganhou esse
parâmetro. `interactive-handlers.ts:169` (fecho por clique dentro do próprio WhatsApp) chamava
`closingPresentation(res)` sem opts e herdava o texto inteiro — em 100% dos 4 fechos WhatsApp do
dossiê, o cliente (já dentro da conversa de WhatsApp) era instruído a "ir até o WhatsApp".

Mesma lição do FIX-343: blindar um caminho (o guard) não resolve quando o comportamento é montado
em outro (a copy).

### Correção
`closingPresentation` ganhou `opts.channel?: "web" | "whatsapp"`. Os dois itens do beat só entram
na lista quando `channel !== "whatsapp"` — extraídos num array `whatsappPingBeat`, spreadado no
ponto exato do docx. `interactive-handlers.ts` passa `channel: "whatsapp"`; `route.ts` (fecho web)
passa `channel: "web"` explicitamente (Lei 1: não depender de default implícito). O resto do fecho
(reserva de cota, booking, Parabéns, especialista chama em seguida) é igual nos dois canais — só o
beat "vai até o WhatsApp" é específico de canal. O beat "te mandei uma mensagem/responde com um oi"
CONTINUA existindo no canal WEB, como pedido.

### Testes
- Novo describe em `closing-presentation.test.ts` (3 casos: canal whatsapp sem o beat mas com o
  resto do fecho; canal web com o beat intacto).
- Sem regressão: `closing-presentation.test.ts` (36/36),
  `interactive-handlers.template-routing`/`interactive-handlers.contract`,
  `offer-confirm-whatsapp-channel-gate`, `route.closing-persistence`, `system-prompt.fix-112`,
  `template-dispatch.test.ts` — todos verdes.

## Decisões tomadas nesta sessão

1. **Root cause por código + correlação de evidência, não por log ao vivo.** Sem stack completa +
   túnel LiteLLM de pé no início da sessão, optei por provar a causa lendo o código e cravando a
   hipótese contra o texto LITERAL do dossiê (byte-a-byte), depois confirmando com um teste
   determinístico que reproduz o mesmo texto. Não corrigi no escuro — a prova é reproduzível e
   está no teste, não só na leitura.
2. **Não toquei `runner.ts`/`tool-policy.ts` (root cause genérica de tool-error).** A correção do
   card citava `index.ts:797` + `runner.ts` como possíveis pontos de mexida, mas a causa PROVADA
   está inteiramente em `orchestrator/index.ts` (falta de `forceToolChoice:"none"` nos sub-turnos
   narrativos) — mexer no comportamento genérico de `toolErrorThisTurn` teria alterado proteções
   já validadas por FIX-262/266/282/286/332 sem necessidade.
3. **Apliquei `forceToolChoice:"none"` em 4 sub-turnos, não só nos 2 com evidência direta.** Os
   sub-turnos de reco-consent-aceito e whatsapp-optin directive têm exatamente a mesma vulnerabilidade
   estrutural (narrativos, sem tool esperada) — corrigi os 4 de uma vez em vez de deixar 2 gêmeos
   vulneráveis pra próxima rodada achar de novo.
4. **Túnel SSM pro LiteLLM shared, só nesta sessão.** O pre-commit hook do FIX-343 exige eval real
   (Camada 3) porque o diff toca `src/lib/agent/`. `ANTHROPIC_API_KEY` local não é válida contra a
   Anthropic direto (é a virtual key do gateway) — abri um túnel SSM (`aws ssm start-session`, já
   autenticado via SSO) pro EC2 do LiteLLM shared e apontei `ANTHROPIC_BASE_URL`/`LITELLM_API_KEY`
   pro túnel em `.env.local` (não versionado). O commit rodou com o eval real, verde de verdade.
5. **5 testes pré-existentes fora do escopo, não tocados.** Descobertos rodando a suíte completa do
   diretório orchestrator; confirmados como pré-existentes via `git stash` (falham idênticos com e
   sem este diff). Não fazem parte do escopo deste bloco (`index.fix-301-clarify-usuario-confuso`,
   `runner.fix-326-p4-gate-question-collision`) — sinalizando aqui em vez de corrigir por conta,
   pra não misturar 2 causas-raiz não relacionadas num bloco de 2 itens já fechado.
