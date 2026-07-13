---
data: 2026-07-12
titulo: "Funil-reveal — reordena o pré-reveal + recoreografa o reveal (FIX-296/FIX-297)"
status: aceita
decisor: Kairo
contexto: rodada 10 do loop-de-goal consórcio, bloco bloco-r10-1-funil-reveal
---

# ADR — Bloco r10-1 funil-reveal (FIX-296 + FIX-297)

Fonte: estudo de causa-raiz `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md`
+ mockup `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html`. A
coreografia adaptativa (Madalena rica × Mario compacto) e a abertura por
categoria com divider já vinham aprovadas pelo Kairo — não foram re-perguntadas.
Três decisões de implementação reais ficaram para o executor; registradas aqui.

## D1 — Abertura por categoria com divider: mecanismo já existe, não recriado

**Achado (verificado no código antes de agir, não assumido):** o mecanismo
"X entrou na conversa — Especialista em Y" já existe em
`src/lib/agent/orchestrator/transition.ts` (`planTransition`) +
`TransitionDivider` em `src/components/chat/chat-message.tsx:448-477`, e já
dispara corretamente no PRIMEIRO contato — `routing.ts`'s `decideRouting`
trata qualquer categoria detectada com `!meta.currentCategory` (concierge →
primeira categoria) como transição, disparando o mesmo divider usado em trocas
de categoria subsequentes. Nenhum componente novo foi criado; o card FIX-296
tinha esse ponto como root cause, mas a investigação mais funda (feita durante
a execução) mostrou que já estava resolvido.

## D2 — Gate `reco-consent`: novo valor no enum `Gate`

**Trade-off:** o card FIX-297 deixava em aberto se `reco-consent` deveria virar
um novo valor no enum `Gate` ou um sub-passo ad-hoc do `experience` (pra não
"arriscar" o enum).

**Decisão (Kairo, via AskUserQuestion):** novo valor no enum `Gate`, seguindo o
mesmo padrão dos gates binários já existentes (`experience`/`simulator-offer`/
`decision`). Reaproveita 100% da infraestrutura genérica de renderização
(`GateRenderer` + `gateQuestion` + `quick_reply`, sem card novo), e cada switch
sobre `Gate` é exaustivo — o compilador TS força atualizar
`gateQuestion`/tool-policy/testes de sequência, o que é rede de segurança, não
risco extra.

## D3 — Gatilho do caminho compacto do Mario (pula experience/reco-consent/hero)

**Trade-off:** no mockup, o Mario pula `experience`→`reco-consent`→hero porque
ele MESMO escolhe uma administradora da lista ("A Canopus parece boa") antes de
qualquer gate de recomendação rodar — um sinal (`mentionedOffer`) que hoje só
`index.ts` conhece, não a máquina de estados pura.

**Decisão (Kairo, via AskUserQuestion):** NÃO plugar esse sinal na máquina de
estados. `experience` continua SEMPRE no caminho padrão (diverge do mockup
neste ponto específico para o Mario). A coreografia adaptativa real que FOI
implementada: o caminho `reco-consent`/hero é pulado quando
`qualifyAnswers.hasLance` resolve pra `"so_parcela"` — capturado
oportunisticamente pelo analyzer a qualquer momento pós-reveal (mesmo
mecanismo já usado por `creditMax`/`desiredItem`), sem exigir um sinal novo de
"o usuário se autosselecionou da lista".

**Gap honesto:** isso diverge do script exato do mockup pro Mario (ele ainda
vê o gate `experience` antes de cair no caminho sem-lance) — divergência
consciente, escolhida pelo Kairo em tempo real sobre a recomendação mais
simples.

## Reversão consciente do FIX-53 (registrada também em `jornada-canonica.md`)

O `credit` (valor do bem) volta a preceder o `identify` (CPF+celular) — o
mockup novo pede rapport antes de dados. O invariante que NUNCA mudou:
identidade continua SEMPRE obrigatória antes do `search` (D1 Bevi) — só a
posição relativa ao `credit` mudou. "Palavra nova vence": a razão do FIX-53
era "dados antes do valor"; a intenção nova é confiança antes de dados.
