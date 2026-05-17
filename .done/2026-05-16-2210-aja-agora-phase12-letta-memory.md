---
title: Aja Agora — memória persistente cross-channel (Phase 12)
date: 2026-05-16
status: testing
project: aja-agora
session_duration: ~8h
tags: [ai-agents, memory, cross-channel, fintech-adjacent]
---

## 1. Pitch

O agente do Aja Agora agora **lembra do usuário entre sessões e entre
canais**. Pessoa que conversou no site há 5 dias, sumiu e volta hoje pelo
WhatsApp, é reconhecida automaticamente — o agente retoma de onde parou,
sem fazer ela começar a jornada de novo.

## 2. Problema que resolveu

Até hoje, cada conversa no Aja Agora era uma ilha. Usuário conversa
sobre carro de R$ 60k no site, sai sem virar lead, volta uma semana
depois pelo WhatsApp — o agente trata como pessoa nova. Pergunta de
novo "primeiro consórcio?", "qual categoria?", "qual orçamento?". Em
mercado B2C de consórcio (decisão de R$ 50k+), essa repetição mata
confiança e abandono dispara.

Custo de não fazer: cada usuário que **voltava** após 24h vivia uma
experiência igual a quem chegava pela primeira vez. Diferencial de
produto era invisível em uso real.

## 3. Solução entregue

- **Identifica o usuário automaticamente** quando ele volta — por
  telefone (WhatsApp) ou por cookie do site (anônimo)
- **Lembra preferências, simulações e objeções** entre conversas (nome,
  categoria, faixa de crédito, prazos discutidos, "medo de não ser
  contemplado", etc.)
- **Detecta retorno após N dias** e adapta o tom: depois de 5 dias
  parado, retoma com "olá de novo, vi que você tinha simulado X — quer
  continuar daí?" em vez de começar a jornada do zero
- **Une site e WhatsApp** sob a mesma memória quando o usuário se
  identifica pelo número de telefone
- **Funciona com fallback** — se a camada de memória cair, o chat
  continua respondendo normalmente (sem memória, mas sem travar)

## 4. Por que importa

Nenhuma administradora de consórcio tradicional oferece isso hoje. O
modelo competidor: PDF + corretor humano + e-mail. Aja Agora vinha
prometendo experiência conversacional — agora a promessa **inclui
continuidade**, que é o que torna o produto pegajoso.

Esperado (a medir em produção):
- Aumento da taxa de retorno semanal
- Conversão maior no "voltei depois pra fechar" (cenário comum em
  decisão de consórcio que dura 2-4 semanas)
- Redução de drop-out em conversas de mais de 1 sessão

## 5. Arquitetura — visão de 1 minuto

```
Usuário          Camada do produto (já existia)        Camada nova
   │                       │                                │
   ├──> Site / WhatsApp ───┤                                │
   │                       ├──> Orquestrador (Vercel AI SDK) ──> Letta
   │                       │       Personas + Gates         │ (memória
   │                       │       Eval system              │  cross-
   │                       │                                │  channel)
   │                       └──> Postgres do app             │
   │                                                        │
   └────────── memória reconhecida no próximo turno ◄───────┘
```

Decisão chave: **não substituímos o agente que já funciona**. Adicionamos
o Letta **ao lado**, como camada de memória persistente consultada antes
e atualizada depois do turno. O sistema de personas, gates, eval e
artefatos interativos (130+ commits acumulados) continua intacto.

A camada de memória é **opcional em runtime**: se o Letta cair, ela cai
silenciosamente pro fallback (NoopAdapter) — usuário continua conversando
normalmente, só sem o reconhecimento.

## 6. Qualidade entregue

**Cobertura de testes**:
- 173 testes automatizados passando, 0 falhando
- Coverage: **93.9% das linhas** e **86.4% dos branches** da camada nova
- Suite roda em **~10 segundos** — cabe em CI sem atrito
- Inclui testes de integração contra o Letta real (não mock) — pega
  bugs de contrato de API que mocks não pegariam

**Endurecimentos de produção**:
- **Circuit breaker síncrono**: se o Letta falhar 2 vezes seguidas, o
  app cai pro modo "sem memória" em milissegundos (não espera timeout)
- **Lock anti-race**: dois acessos simultâneos do mesmo usuário não criam
  duplicatas no Letta
- **Timeout 2s**: nenhuma operação de memória pode travar o chat
- **Observabilidade**: cada operação loga em JSON estruturado com
  latência — operação que demorar mais de 500ms aparece em log direto
- **Retenção de dados**: usuários inativos por mais de 365 dias têm
  agente Letta purgado por job mensal (LGPD-friendly)

**Validações executadas nesta sessão**:
- Smoke test contra Letta real (criação, leitura, atualização, busca
  semântica) — todos verdes
- Dump real do banco de desenvolvimento AWS pra local (170 mensagens
  reais, 22 conversas) — testado contra dados realistas
- `npx tsc --noEmit` e `npm run build` passam sem warnings

## 7. Decisões de arquitetura registradas

- `~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-aja-agora-letta-sidecar-integration.md`
  — 14 decisões travadas sobre como Letta entra na arquitetura
- `~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-local-dev-shared-letta.md`
  — espelho do Letta-prod localmente, por que e como
- `~/obsidian-vault/00 - System/Patterns/local-dev-workspaces.md`
  — padrão TwoBrains pra ambiente de dev por workspace (vale pra
  outros projetos da empresa)
- `docs/test-plan-letta-memory-PO.md` — 22 cenários funcionais
  priorizados por valor de negócio
- `docs/test-plan-letta-memory-QA.md` — matriz técnica de testes
- `docs/qa-suggestions.md` — 7 observações pós-execução

Repositório novo da empresa publicado pra reuso em outros projetos:
**twobrains-technology/tb-local-dev**.

## 8. Riscos identificados e mitigações

| Risco | Mitigação |
|---|---|
| **Memória vazar entre pessoas distintas** (incidente de confiança) | Namespace isolado por ambiente, identidade por telefone E.164 normalizado, testes específicos cobrindo o caso |
| **Letta cair e derrubar o app** | Circuit breaker síncrono + fallback NoopAdapter — degradação graciosa documentada e testada |
| **Hint de reativação aparecer em todos os turnos** (agente fica robótico) | Faixa de 0 dias → sem hint; faixas distintas pra 1d, 2-6d, 7+d com tons diferentes |
| **Stale memory** (recomendação antiga retomada como nova) | Listado como gap aberto (ver seção 9) — bucket >90d ainda não implementado |
| **Custo descontrolado** (archival cresce indefinidamente) | Listado como gap (ver seção 9) — ainda sem cap por agente, mitigado pelo purge 365d |

## 9. O que ainda fica em aberto

Honesto: a feature está **provada em camada de teste automatizado, mas
ainda não foi exercitada manualmente em chat real no browser**. Itens
explícitos:

- **Browser smoke test manual**: subir `npm run dev`, simular conversa
  de 4 turnos no site, capturar lead, validar visualmente que o agente
  reconhece no turno seguinte. Não rodado nesta sessão
- **Testes E2E automatizados (4) estão `skipped`** — precisam `next dev`
  rodando + flag de debug
- **5 bugs documentados em `docs/qa-suggestions.md`** — todos pequenos,
  nenhum bloqueia, mas existem (ex: `normalizePhoneBR` aceita formato
  US como BR sintético; valores de env vazios cair em path estranho)
- **Telefone compartilhado** (esposo+esposa mesmo número WhatsApp):
  hoje tratado como mesma pessoa — vale conversar com produto antes
  do primeiro caso real
- **Stale memory >90 dias**: bucket extra de reativação não
  implementado — usuário que volta após 6 meses recebe mesmo hint de
  "voltou após N dias" sem distinção
- **Archival cap (LRU)** por agente: não implementado — risco de custo
  em conversas muito longas
- **Deploy em ambiente dev/prod AWS**: implementação está local. Subir
  pro AWS dev e validar contra Letta-shared real ainda é passo seguinte

## 10. Próximos passos sugeridos

1. **Validação manual no browser** (1h) — o teste que destrava produção
2. Implementar 1-2 fixes do `qa-suggestions.md` que tocam
   `normalizePhoneBR` e tratamento de env vazio
3. Decisão de produto sobre telefone compartilhado
4. Implementar bucket >90 dias no hint de reativação
5. Deploy local-dev pattern em outros projetos TwoBrains que vão
   adotar memória cross-canal (sparkflow, letdrill em backlog)

## 11. Métricas da sessão

- **Arquivos novos**: 26 (14 em `src/lib/memory/` + 11 testes + 1 schema)
- **Linhas líquidas**: ~3.500 adicionadas (código + testes + docs)
- **Commits**: 5 no projeto + 3 no vault + 1 no repo team
  `tb-local-dev`
- **Duração**: ~8h de sessão (planejamento + implementação + testes +
  documentação)
- **Stakeholders convergidos**: PO e QA via agentes especializados
  (não 1 pessoa unindo papéis) — separação reduz viés
- **Documentação criada**: 5 documentos permanentes (ADR, pattern,
  test plans, qa suggestions, este `.done/`)
- **Risco evitado documentado**: feature de memória persistente entrando
  com fallback, observability e circuit breaker desde o dia 1 — não é
  "MVP que vamos endurecer depois"
