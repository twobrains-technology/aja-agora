# Bloco funil/turno — governança determinística de DADO e ERRO (FIX-186 + FIX-187)

**Data:** 2026-07-01 · **Branch:** `fix/turno-governanca-dado-erro` · **Onda:** 1

## O problema (o print do Kairo)

Numa jornada real, o usuário respondeu o gate de lance, o sistema tentou buscar as
opções reais na Bevi — e a busca **falhou**. O agente reagiu do pior jeito possível:

1. **Vazou o erro cru + empilhou preâmbulos.** Numa bolha só: "Deixa eu buscar as
   melhores opções... / Vou buscar as opções certas... / Preciso primeiro buscar os
   grupos... / tô com uma **dificuldade técnica pontual** pra acessar os grupos".
2. **Mostrou uma proposta fantasma.** MESMO com a busca falhada, apareceu o card
   "Esse plano faz sentido? (BANCO DO BRASIL)" com Valor R$ 131.042, Parcela R$
   2.365,57, Grupo 1797 — **números ancorados em dado que não carregou naquele turno**.

Os dois sintomas ferem o coração do produto: confiança. Um agente que narra defeito
técnico e propõe número que não existe destrói a percepção de "isso aqui é sério".

## A cura (determinística, em código — não "mais uma regra no prompt")

Fundamento: as 6 leis de arquitetura de IA. **O LLM não decide o que falar no erro;
o código dispõe.** Zero mudança em system-prompt/HARD_RULES — a garantia virou código.

### FIX-186 — erro de descoberta vira fallback humano
- A busca na Bevi que falhava e **re-lançava** o erro (virando texto narrado pelo
  modelo) agora: faz **1 retry silencioso** em falha transitória (soluço de rede/5xx),
  e se ainda falhar, devolve um **sinal determinístico** em vez de deixar o modelo
  improvisar.
- O sistema então **suprime** qualquer narração de erro e entrega uma **mensagem
  amigável fixa**, em português correto, que enquadra a falha como da nossa busca (não
  do perfil do cliente) e oferece as saídas: tentar em instantes ou falar com um
  especialista da Aja. Nunca "problema", "dificuldade técnica", "instabilidade".

### FIX-187 — nenhuma proposta sobre dado que não carregou
- Card de recomendação, simulação ou decisão **só sai se a descoberta do turno teve
  sucesso**. Duas linhas de defesa: uma allowlist que recusa a ação na origem, e um
  guard reativo que dropa o card mesmo que o modelo insista. É a regra inviolável de
  produto (Bevi como fonte única de número) feita em código.

## Qualidade entregue (anti-regressão nas 3 camadas)

- **Camada 1 (structural, roda em todo PR):** classificador de erro transitório×duro,
  a mensagem de fallback (limpa + PT-BR correto), a tabela de precondição (as 3 tools
  de proposta) e a regra do guard.
- **Camada 2 (cassettes determinísticos):** o detector reprova a narração crua do
  print e o empilhamento de preâmbulos; prova que o fallback passa limpo; prova que a
  precondição e o guard bloqueiam a proposta fantasma.
- **Camada 2 (integration com DB):** o pipeline ponta a ponta — a busca falha, a
  narração é suprimida, o fallback é materializado e persistido, e **nenhum** card de
  proposta chega ao usuário.
- **Camada 3 (eval nightly):** cenário com a Bevi forçada a falhar — o agente entrega
  fallback humano e nunca mostra card com números.

Gate verde no container transitório: **`pnpm test:unit` = 2351 testes, 0 falhas**;
integração dos arquivos tocados verde; `pnpm typecheck` sem nenhum erro novo (os 20
erros restantes são dívida pré-existente em test files de `mesa`, na develop).

## Decisões de implementação

- **1 retry silencioso, backoff 300 ms, só em erro transitório** (rede/timeout/5xx).
  Erro duro (config/4xx) não retenta — vai direto ao fallback. Alinhado ao "< 3s".
- **Fallback como texto** (não botões clicáveis): o artifact `quick_reply` renderiza
  `null` no front e criar um componente novo é UI (fora do escopo deste bloco). A
  mensagem embute o convite às duas saídas em linguagem natural. Ver "Gaps".
- **Sinal `discoveryFailedThisTurn` via flag de closure por turno** (o agent de
  specialist é reconstruído a cada turno, então o flag é fresco) + marcador no
  tool-result pro runner detectar. Sem tocar o meta/DB.
- **Guard `discovery-failed` como 1ª regra** (mais forte, vence as demais).

## Gaps honestos / PENDENTE-KAIRO

- **Botões dedicados "Tentar de novo / Falar com especialista da Aja":** hoje o
  convite é textual. Os botões são UI — ficam pra onda 2 (chat layer) / próxima rodada.
- **Caso teórico de tool-calls paralelas no mesmo step** (busca + apresentação juntas):
  o artifact é emitido do input antes do tool-result, então no fluxo SEQUENCIAL (o do
  print) o guard barra, mas num step paralelo — não observado na jornada — o card
  sairia antes do sinal. Mitigado por supressão de texto + não-avanço de gate +
  fallback; registrado, não escondido.
- **Evidências irmãs `agente-trava-apos-valor` e `valor-componente-nao-aparece`:**
  bugs de orquestração do turno NÃO investigados nesta rodada (o `_bloco.md` os
  referencia, mas os arquivos de evidência não estão versionados neste worktree).
  **Triados como "próxima rodada"** — não inventei root cause. Se forem da mesma
  família (avanço de gate determinístico em `qualify-state.ts`/`orchestrator`), viram
  `fix-NN` num próximo bloco.

## Arquivos

Produção: `bevi-errors.ts`, `tools/ai-sdk.ts`, `orchestrator/{action-policy,artifact-guard,directives,runner,index}.ts`.
Testes: os `.test.ts` ao lado + `runner.discovery-failed.integration.test.ts` + `tools/ai-sdk.fix-186.test.ts` + `tests/regression/agent-trajectory.test.ts` (cassettes) + `tests/eval/agent-flow.eval.test.ts` (nightly).
Docs: ADR em `docs/correcoes/decisions/2026-07-01-bloco-funil-turno-orquestracao.md`; cards em `docs/correcoes/done/fix-186-*.md` e `fix-187-*.md`.
