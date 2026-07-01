# Bloco whatsapp-funil-paridade — o WhatsApp agora vende igual ao web

**Data:** 2026-07-01 · **Branch:** `fix/whatsapp-funil-paridade` · **Onda:** auditoria código×jornada 2026-07-01

## O pitch

A auditoria da jornada canônica achou **6 quebras de paridade silenciosas** — bugs onde
uma correção foi aplicada só no chat web e o WhatsApp ficou pra trás fazendo o comportamento
antigo. Este bloco fechou as **5 que estão no funil de vendas do WhatsApp** (reveal → decisão
→ fechamento). O cliente que conversa por WhatsApp passa a ter **exatamente** a mesma jornada
de quem usa o web: mesmas perguntas, mesma ordem, mesmas regras. Nenhum passo existe num canal
e não no outro — que é a regra-mãe da jornada canônica.

Na prática, some fricção que fazia o cliente do WhatsApp desistir ou receber informação errada:
não promete mais uma "assinatura" que não existe, não pede confirmação duas vezes de quem já
decidiu, não pula a educação que ajuda quem não tem o lance em mãos, não deixa o modelo
inventar ofertas, e para de forçar o cliente a escolher uma faixa de preço em vez de dizer
quanto quer gastar.

## O que mudou (5 fixes, cada um levando o WhatsApp à paridade com o web já corrigido)

| Fix | Divergência | Antes (WhatsApp) | Agora (paridade web) |
|-----|-------------|------------------|----------------------|
| **FIX-116** (D11) | Fechamento | Prometia "finalizar a **assinatura**" e rotulava o link como "Assinatura digital" | Apresenta a **proposta pronta** ("ver minha proposta") — a assinatura é etapa da mesa, não deste link (DES-1) |
| **FIX-117** (D18) | Reveal → decisão | "Tenho interesse" intercalava o card "Esse plano faz sentido?" e só o 2º clique avançava | 1º "Tenho interesse" **avança direto** ao fechamento (paridade FIX-38) |
| **FIX-118** (D19) | Qualificação | Quem respondia Não/Talvez ao lance **pulava** a educação de lance embutido | Não/Talvez **veem a educação** (o texto existe justamente pra quem não tem o lance hoje) — paridade FIX-92 |
| **FIX-119** (D22) | Card de decisão | "Ver outras opções" caía no modelo (risco de alucinar/omitir ofertas) | Comparativo **determinístico** das ofertas reais (`buildOtherOptions`) — zero free-run do modelo |
| **FIX-120** (D5) | Valor do bem | Forçava escolher uma **faixa** de preço numa lista (gravava o teto da faixa) | **Pergunta o valor por conversa** ("uns 80 mil") e ouve a resposta livre — paridade FIX-115 |

## Arquitetura / como ficou

- **Copy determinística (FIX-116):** `signatureHandoffToWhatsApp` e o resumo da contratação
  (`contract-summary.ts`) passam a compartilhar com o web a proibição do regex
  `/assinatura|assinar/i`. Um único detector protege os dois canais.
- **Handlers do funil (FIX-117/118/119):** `handleInterest` avança direto; `handleLance`
  manda no/maybe pro gate `lance-embutido` antes da busca; novo `handleDecisionOutras` roteia
  `decision_outras` pro mesmo `buildOtherOptions` model-free do web (com fallback espelhado).
- **Gate credit conversacional (FIX-120):** `gateInteractive("credit")` retorna `null` e o
  adapter envia a pergunta como **texto** (`gateTextPrompt` → `gateQuestion("credit")`),
  espelhando o gate `identify`. A resposta livre é capturada pelo analyzer + backstop
  determinístico `parseAssetValue` (FIX-115). Código morto aposentado
  (`creditRangeQuestionToWhatsApp`, `resolveCreditReply`, roteamento `credit_`, `handleCredit`)
  — sem import órfão. `CREDIT_BUCKETS` e `parseAssetValue` preservados.

## Qualidade entregue (3 camadas por fix, como manda o CLAUDE.md)

- **Camada 1 (structural/unit, roda em todo PR):** 6 arquivos novos ao lado do código
  (`formatter.whatsapp-nao-promete-assinatura`, `interactive-handlers.interest-avanco-direto`,
  `interactive-handlers.lance-embutido-no-maybe`, `interactive-handlers.decision-outras`,
  `adapter.fix-120`, `qualify-config.fix-120`).
- **Camada 2 (cassettes determinísticos):** 5 `describe` novos em
  `tests/regression/agent-trajectory.test.ts` (FIX-116 a FIX-120), cada um travando a paridade
  com o web e cross-referenciando os cassettes/handlers correspondentes.
- **TDD strict:** cada teste foi visto **falhar** com a assinatura certa antes do fix e passar
  depois. 1 commit `test+fix:` por item.
- **Gate final:** `pnpm test:unit` completo **verde — 211 arquivos, 2155 testes, 0 falhas**.
  Biome sem erros nos arquivos do bloco.

## Decisões

- **FIX-120 — valor por TEXTO determinístico** (confirmado via `AskUserQuestion`): o adapter
  envia `gateQuestion("credit")` como texto fixo, espelhando o `identify`, em vez de deixar o
  LLM formular a pergunta no directive. Motivo: determinismo e paridade — a pergunta nunca some
  e não depende do LLM não narrar mecanismo. Alternativa (directive do agente) descartada por
  ser não-determinística. Registrada em
  `docs/correcoes/decisions/2026-07-01-bloco-whatsapp-funil-paridade.md`.
- **FIX-120 — remoção do código morto** (decisão técnica, sem perguntar): removidos
  `creditRangeQuestionToWhatsApp`/`resolveCreditReply`/`handleCredit`/roteamento `credit_`
  (regra global: sem import órfão). `CREDIT_BUCKETS` fica (serve `lanceValueOptions`).
- **FIX-119 — escopo restrito à D22:** só `decision_outras` (onde o modelo poderia
  fabricar/omitir números) ganhou handler determinístico. `decision_contratar`/
  `decision_especialista` seguem no fluxo de texto — fora do escopo deste card.
- Os demais fixes tinham correção fechada (espelhar o web) — **sem decisão de design**,
  brainstorming pulado conforme o prompt.

## Gaps / fora de escopo (honestidade)

- As **outras 3 quebras de paridade** da auditoria (D12 upload, D13 upload inbound WhatsApp,
  D14-16 mesa) são de outros blocos — não tocadas aqui.
- **T1/T2** (tensões jornada×ADR) seguem PENDENTE-Kairo/Bernardo — não são bug, fora do escopo.
- Os cassettes de comportamento model-free (FIX-119) provam a **fronteira** por source + Camada 1
  comportamental; a Camada 3 (LLM-judge nightly) segue como relatório, não gate — inalterada.
- 7 warnings pré-existentes de biome em cassettes antigos de `agent-trajectory.test.ts` não
  foram tocados (fora do escopo; o único warning que eu havia introduzido foi eliminado).

## Integração

Branch pushada; **integração na base é do orquestrador** (merge-wave). Nada de PR/merge/deploy
por esta sessão.
