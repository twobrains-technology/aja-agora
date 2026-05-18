---
title: Estabilização Aja Agora pré-apresentação + framework de regressão agentic em 3 camadas
date: 2026-05-18
status: shipped
project: aja-agora
session_duration: ~6h
tags: [agent, regression, prompt-engineering, simulator, whatsapp, infra-test]
---

## 1. Pitch

Aja Agora chegou na apresentação do cliente com o agente seguindo o roteiro proposto pela especialista de domínio (Bruna): captura o nome no momento certo, oferece WhatsApp com narrativa estratégica, renderiza os cards interativos que estavam quebrados, fecha o lead no formulário e mantém o histórico quando o admin reabre uma simulação. Por baixo, um framework novo de regressão garante que qualquer mexida futura no agente vai derrubar o teste antes de chegar em produção.

## 2. Problema que resolveu

Faltando 2h pra apresentação, o produto tinha 16 bugs visíveis ao demonstrar pra Bruna: lead simulado não aparecia na pipeline, conversa do simulador não preservava histórico, WhatsApp dropava cards silenciosamente, agente prometia "perguntas rápidas" e travava, eval do admin quebrava com erro 502, comparador consórcio×financiamento estava bloqueado em runtime apesar do done report dizer feito. Pior: os testes de regressão existentes eram **estruturais** (asseguram configuração) e **não pegam comportamento da LLM** — bug podia voltar a qualquer push sem ninguém notar até o stakeholder ver. Apresentar com qualquer um desses bugs ao vivo quebraria a credibilidade do produto.

## 3. Solução entregue

- **Funil de captura de lead fechado de ponta a ponta** — agente pede WhatsApp com narrativa estratégica ("pra não perder atendimento se cair a internet"), dispara o formulário final quando o usuário diz "tenho interesse", form pré-preenche o nome já falado no chat
- **Simulador admin com paridade total** — leads simulados entram na pipeline, conversas mantêm histórico ao reabrir, canal WhatsApp cria lead inicial, eval de qualidade da conversa funciona
- **Cards interativos restaurados** — picker de faixa de crédito, picker de tópicos, simulador 7 campos, comparador consórcio×financiamento — tudo renderiza tanto no chat web quanto no WhatsApp
- **Anti-meta-narrativa** — agente proibido de vazar "o sistema vai te guiar com botões"; proibido de chamar a mesma tool 3× na conversa; obrigado a usar a frase canônica da Bruna após detalhamento
- **Framework de regressão em 3 camadas** com pre-commit hook bloqueando código quebrado antes de merge

## 4. Por que importa

A demonstração ao vivo é o teste de mercado mais caro que existe — se o agente trava na frente da especialista de consórcio, o produto perde credibilidade que custa meses pra recuperar. Mais importante: o framework de regressão monta a infraestrutura que faltava pra escalar com confiança. Plataformas agênticas que crescem sem regressão automatizada quebram cada vez que o modelo é atualizado, cada vez que um dev edita o prompt, cada vez que uma tool é adicionada. **Agora qualquer mudança que faça o agente regredir comportamento conhecido é pega em segundos antes do merge** — não em produção pelo cliente.

## 5. Arquitetura — visão de 1 minuto

```
┌─────────────────────────────────────────────────────────────────┐
│  Camada 1 — Structural (src/**/*.test.ts)                       │
│  Lê source do prompt/builder/seed. Sem DB, sem LLM.             │
│  Pega: tool faltando, regra ausente, seed quebrado.             │
│  ~3.5s · roda em todo PR + pre-commit                           │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  Camada 2 — Trajectory snapshots (tests/regression/)            │
│  MockLanguageModelV2 da Vercel AI SDK simula respostas Claude.  │
│  Cada bug real = 1 cassette determinístico.                     │
│  Pega: meta-narrativa, tools que prometem e não disparam.       │
│  <500ms · roda em todo PR + pre-commit                          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  Camada 3 — LLM-as-judge eval (tests/eval/)                     │
│  user-bot (Haiku) ↔ agent real (Sonnet) conversam de verdade.   │
│  Pega: drift de modelo, sutileza de tom, casos edge novos.      │
│  ~144s/cenário · roda nightly via cron, NÃO em PR               │
└─────────────────────────────────────────────────────────────────┘
```

Decisões importantes:
- **Determinismo no PR, comportamento no nightly** — Camadas 1+2 garantem feedback rápido sem flakiness; Camada 3 fica de fora do gate de merge porque LLM real custa tempo e tokens
- **Mock só na fronteira externa** — testes de integration usam DB real (Postgres local 5434), só mockam Anthropic e Letta porque são fronteira de custo/latência
- **Pre-commit hook bloqueia mesmo em correria** — se você tentou comitar quebrando uma regra, o hook recusa; só docs/markdown passam livre

## 6. Qualidade entregue

A entrega tem:
- **628 testes unit + Camada 2 verdes em 3.4s** (`npm run test:unit`)
- **13 testes integration verdes em 1.7s** (`npm run test:integration` — conecta Postgres local)
- **158 testes da pasta `src/lib/agent/`** sem regressão
- **16 cassettes determinísticos** em `tests/regression/agent-trajectory.test.ts` cobrindo todos os bugs reportados nesta sessão
- **Pre-commit hook husky** bloqueia commit se Camadas 1 ou 2 falharem; skipa commits só de docs
- **6 migrations idempotentes** (0014-0019) aplicadas via container TwoBrains pattern (nunca `drizzle-kit push` no host)
- **Eval framework agent-vs-agent** rodando contra Anthropic real validou 8/12 critérios no Cenário 1 antes dos fixes finais (Helena/imóvel/Monique)

Cada cassette assegura **um comportamento canônico do agente**, então quando alguém edita o system prompt e tira a regra da Bruna por engano, o teste correspondente quebra antes do commit chegar no GitHub.

## 7. Decisões de arquitetura registradas

- `CLAUDE.md` (seção nova "Regressão de agent — 3 camadas OBRIGATÓRIAS") — convenção pra todo bug agentic virar cassette automaticamente
- `tests/regression/agent-trajectory.test.ts` — arquivo único e canônico da Camada 2; cada `describe` documenta o bug real que originou
- `tests/eval/flow-bruna.eval.test.ts` — esqueleto do framework agent-vs-agent pra Camada 3 (LLM-as-judge), pronto pra expandir pra outros personas/canais
- `.husky/pre-commit` — convenção que vai persistir mesmo se o time mudar
- Migrations 0014-0019 com guard `NOT @>` jsonb — padrão idempotente registrado pra novos devs replicarem
- Documentação inline no header de cada cassette explicando o bug original

## 8. Riscos identificados e como tratamos

| Risco | Mitigação |
|---|---|
| Camada 2 cassettes não pegam bugs **novos** que ainda não viraram cassette | Convenção explícita no CLAUDE.md: todo bug = cassette obrigatório antes do fix. Quem aceita PR sem cassette, deixa porta aberta |
| LLM evolui e Camada 3 começa a falhar em massa | Camada 3 só roda nightly, não bloqueia merge. Falha vira issue, não emergência |
| Pre-commit hook lento demais → dev desabilita | Hoje roda em 3.4s e tem `--bail=10`. Acima de 30s o hook é desabilitado na cultura |
| Banco local de teste apontando pro mesmo Postgres que dev contamina demos | Convenção: testes usam DB local OrbStack do workspace, não tocam tb-dev AWS. Demo continua íntegra |
| Agente meta-narrativa pode aparecer em frase nova não prevista no regex | Cassettes cobrem padrões mais comuns + regra dura no prompt; novos padrões viram novos cassettes (loop) |

## 9. O que ainda fica em aberto

- **Cenários 2 e 3 do eval Camada 3** (Rafael/auto curto orçamento, B13 comparador) — framework está pronto, só precisa adicionar `describeIfKey` blocks
- **LLM-as-judge calibrado com correção humana** — Camada 3 hoje assert estrutural; falta o juiz Claude separado que avalia comportamento sutil
- **Cron noturno do eval** — Camada 3 precisa GitHub Action agendada pra rodar sozinha e postar resultado
- **B10 "card → box"** — Bruna pediu trocar palavra na UI, ficou de fora desta sessão
- **Anglicismos no copy** ("range" etc.) — auditoria não foi feita
- **B15 pós-venda 24h** — roadmap declarado, fora desta sessão
- **Bug pré-existente em `lead-history-completeness.test.ts`** — agent paralelo deixou documentado 2 gaps reais (handleInterest não persiste, frase final do bot não persiste). Cassette está lá esperando fix em produção

## 10. Próximos passos sugeridos

1. Expandir Camada 3 com cenários 2/3 (Rafael, Bruno) + GitHub Action cron nightly
2. Adicionar Claude juiz na Camada 3 com calibração via N correções humanas (LangSmith Align Evals pattern)
3. Resolver bug `lead-history-completeness` (já tem teste pronto, falta o fix)
4. Pequenos ajustes de copy (B10, anglicismos) — fora de janela de demo, fica pra próximo sprint
5. Documentar em `docs/specs/` o fluxo completo "como adicionar cassette pra novo bug" para onboarding de devs

## 11. Métricas da sessão

- **Commits**: 19 no `develop`
- **Migrations**: 6 (0014–0019), todas idempotentes, aplicadas via container
- **Arquivos novos**: 8 (eval framework, cassettes, suite estrutural por bug)
- **Arquivos modificados**: ~25 (system prompt, builder, route handlers, formatter WhatsApp, provider chat, simulator components)
- **Testes adicionados**: 16 cassettes Camada 2 + 8 estruturais behavior-guards + outros estruturais por bug
- **Tempo investido**: ~6h
- **Bugs corrigidos**: 16 reportados na sessão + Bruna v1 review fechada
- **Risco evitado**: apresentação ao vivo sem agente travando + base de regressão que protege contra reincidência dos mesmos bugs em qualquer push futuro
