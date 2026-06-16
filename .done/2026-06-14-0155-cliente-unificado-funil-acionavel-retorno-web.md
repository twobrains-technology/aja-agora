---
title: Cliente unificado, funil acionável e retorno do usuário na web
date: 2026-06-14
status: testing
project: Aja Agora
session_duration: ~5h (sessão autônoma /to-saindo)
tags: [funil, crm-admin, identidade, retorno-web, seguranca]
---

## 1. Pitch

O Aja Agora passou a tratar cada pessoa como **um cliente só** — não importa se
ela falou pelo site ou pelo WhatsApp. O funil agora **anda sozinho** até o
fechamento (proposta, mesa, boleto, ganho), o time enxerga **tudo que o cliente
fez num lugar só**, e quem volta ao site **continua de onde parou** — com os
dados sensíveis protegidos por verificação.

## 2. Problema que resolveu

Antes, o mesmo cliente que conversava no site e depois no WhatsApp virava **dois
cards separados** no painel — o time via pedaços soltos da mesma pessoa. O funil
parava no meio: a proposta nascia automática, mas a raia **não acompanhava**, e o
desfecho na administradora (mesa manual, boleto, aprovação) **só era visto se
alguém perguntasse no chat**. E o usuário que voltava ao site **começava do
zero**, mesmo tendo conversado dias antes. Resultado: leads perdidos por falta de
acompanhamento e experiência de retorno frustrante — exatamente onde se ganha ou
perde a venda de um consórcio.

## 3. Solução entregue

- **Reconhece o cliente como entidade única** resolvida por telefone, CPF ou
  e-mail — unifica conversas, leads e propostas de qualquer canal.
- **Move o funil sozinho** do início ao fim: a proposta enviada, a entrada na
  administradora, o aguardo do pagamento e o ganho são detectados e refletidos
  automaticamente (sem ninguém arrastar card).
- **Mostra o cliente inteiro num painel só**: linha do tempo web + WhatsApp,
  propostas com link do PDF, e o histórico de cada movimentação no funil.
- **Retoma a conversa no mesmo dispositivo**: quem volta ao site continua de onde
  parou, sem atrito — e quem chega pela primeira vez não vê diferença nenhuma.
- **Recupera o histórico em outro aparelho** por telefone/CPF, com **verificação
  de posse (código)** antes de revelar dado sensível — telefone de terceiro não
  abre os dados de ninguém.

## 4. Por que importa

- **Diferencial competitivo:** consórcio tradicional trata canais como silos. Um
  funil que se move sozinho e um cliente unificado cross-canal são o que separa
  uma operação AI-first de um CRM comum.
- **Valor pro usuário:** zero retrabalho ao voltar (não reconta o que já contou),
  e segurança de que seus dados não vazam por um número digitado.
- **Métricas esperadas:** menos leads abandonados (acompanhamento automático do
  fechamento), maior taxa de retomada de conversas, e atendimento mais rápido
  (time vê tudo num lugar). Não medido ainda — projetado.

## 5. Arquitetura — visão de 1 minuto

```
   CONTATO (cliente único: telefone / CPF / e-mail)
        ├── conversas web + WhatsApp  ── timeline unificada (painel admin)
        ├── leads (1 card por cliente, badge multi-canal)
        └── propostas Bevi
                 │
   FUNIL ────────┴───────────────────────────────────────────
   novo → engajado → qualificado → em negociação → proposta enviada
        → na administradora → aguardando pagamento → fechado ganho   (perdido)
        ▲ automático (eventos + polling da administradora)  ▲ forward-only

   RETORNO WEB
   mesmo device  → cookie reidrata a conversa (sem verificação)
   outro device  → telefone/CPF: contexto leve livre | dado sensível só após código
```

Decisões de contorno:
- A entidade `contacts` foi **adicionada ao lado** do que já existia — leads e
  conversas continuam funcionando; ganharam só um ponteiro pro cliente.
- O fechamento é lido por **polling** (a administradora não avisa — não há
  webhook), por um worker dedicado.
- Segurança da recuperação: **contexto leve é livre, dado sensível exige posse do
  número** (código de verificação) — protege contra "digitei o telefone, vi os
  dados de outro".

## 6. Qualidade entregue

- **1.675 testes unitários/estruturais** verdes (suíte completa), incluindo as
  novas regras de funil, identidade e dedup.
- **26 testes de integração contra banco real** (Postgres) cobrindo: consolidação
  de cliente e merge por telefone/CPF, backfill idempotente, máquina de estados do
  funil (avanço, bloqueio de regressão, terminais), automação do desfecho por
  status, perdido por inatividade, agregação do painel, retomada same-device e o
  gate de verificação da recuperação.
- **6 testes E2E (Playwright)** contra o app rodando: login admin → painel
  consolidado com timeline dos dois canais; retomada same-device (e primeira vez
  intacta); e o **anti-pretexting** ponta a ponta (telefone sozinho não revela
  dado sensível; só após o código).
- Endurecimentos: funil **forward-only** (automação nunca regride; admin só
  regride com intenção explícita), código de verificação **single-use, com
  expiração e comparação em tempo constante**, CPF **mascarado por padrão** e
  **nunca logado nem enviado cru**, migrações **idempotentes aplicadas no
  container** (nunca na mão).

## 7. Decisões de arquitetura registradas

- `docs/jornada/proposta-funil-contatos-retorno.md` — proposta-base (raias,
  identidade, retorno) aprovada nesta sessão.
- `.away/2026-06-14-0048-funil-contatos-retorno-web.md` — diário de decisões
  (D1–D10) tomadas em modo autônomo, com alternativas e reversibilidade.
- `docs/correcoes/done/fix-41..47-*.md` — spec + critérios de aceite por item.

## 8. Riscos identificados e como tratamos

- **Vazamento de PII na recuperação cross-device** → gate de verificação (código
  pro próprio número) antes de qualquer dado sensível; testado com anti-pretexting.
- **Regressão acidental do funil** (arrasto que volta o cliente de fase) →
  forward-only por padrão; regressão exige flag explícita e fica auditada.
- **CPF em texto puro** (decisão de piloto) → mitigado: nunca logado, nunca no
  prompt do agente, mascarado na UI; dívida `DES-CPF-RAW` registrada pra endurecer.
- **Funil parado no fechamento** → worker de polling reflete o desfecho sozinho;
  proposta abandonada vira `perdido` por inatividade (14 dias).
- **Quebra da primeira experiência** ao adicionar retorno → regra de ouro testada:
  sem cookie / sem identificação, o fluxo de primeira vez é idêntico ao de hoje.

## 9. O que ainda fica em aberto

- **Redis e o worker de polling em produção** não foram provisionados (infra =
  fora do escopo autônomo). O worker está pronto e testado; falta subir o Redis e
  rodar o processo.
- **Backfill dos contatos existentes em produção**: rodado no ambiente local;
  falta encadear no release de produção (idempotente).
- **Recuperação cross-device: backend completo, interface no chat não**: a UX de
  "quando/como oferecer a recuperação" depende de decisão de produto — o backend
  seguro está pronto pra plugar.
- **Notificação proativa do desfecho** (avisar o cliente quando a proposta anda):
  é mensagem para fora — depende de aprovação antes de ativar.

## 10. Próximos passos sugeridos

1. Confirmar a política de segurança da recuperação (com verificação vs piloto).
2. Provisionar Redis em produção e ligar o worker de polling.
3. Encadear o backfill no release de produção.
4. Desenhar a interface de recuperação no chat com o Bernardo.
5. Decidir se o aviso proativo do desfecho é para o cliente ou para o time.

## 11. Métricas da sessão

- 68 arquivos alterados · ~3.585 linhas adicionadas (líquido ~3.335).
- 19 commits (conventional), 7 itens de backlog concluídos (FIX-41 a FIX-47).
- 3 blocos de trabalho encerrados (identidade, funil, retorno web).
- ~5h de sessão autônoma (/to-saindo), com diário de decisões para revisão.
- Risco evitado: vazamento de dados pessoais na recuperação por outro dispositivo.
