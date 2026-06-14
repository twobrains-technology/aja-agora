---
bloco: bloco-c-retorno-web
branch: feat/retorno-web
workspace: feat-retorno-web
onda: 2
depends_on: [bloco-a-identidade-contatos]
paralelo_com: [bloco-b-funil-raias]
itens: [FIX-46, FIX-47]
escopo_arquivos:
  - src/app/api/chat/route.ts
  - src/app/api/chat/resume/route.ts        # novo
  - src/lib/chat/provider.tsx
  - src/app/chat/page.tsx
  - src/components/chat/*
  - src/lib/conversation/messages.ts
  - src/lib/memory/reconciler.ts
  - src/lib/contacts/resolve.ts             # CONSOME (read-only) o de bloco-a
conflitos_esperados:
  - "Quase nenhum vs bloco-b (admin-side × chat-side, disjuntos). Toque comum possível em src/lib/memory/* — regiões diferentes, merge mecânico."
---

# Bloco C — Retorno do usuário na web

**Feature 2.** Faz o usuário web **voltar com contexto no mesmo dispositivo**
(cookie já existe, falta a ponte) e **recuperar por telefone/CPF em outro
dispositivo** — sem nunca atrapalhar a experiência de primeira vez.

> **Gate de aval:** só lançar após o Kairo decidir a Parte 4.3 da
> `proposta-funil-contatos-retorno.md` — **(A)** verificação de posse (OTP) vs
> **(B)** modo piloto sem OTP. FIX-47 muda conforme a escolha.

## Depende de bloco-a (mergeado)

FIX-47 usa `resolveContact({ phone, cpf })` (read-only) pra achar o cliente e
puxar "tudo que ele já fez". FIX-46 (same-device) **não** depende de contacts —
pode até começar antes, mas o bloco inteiro espera A pra não brigar na migração.

## Ordem interna

1. **FIX-46** — retomada same-device (cookie↔conversa, `/api/chat/resume`, hydration). Independente de contacts.
2. **FIX-47** — recuperação cross-device por telefone/CPF + verificação (conforme decisão do Kairo). Usa contacts.

## Prompt de lançamento (colar no Superset)

> Leia `docs/correcoes/README.md` e `docs/jornada/proposta-funil-contatos-retorno.md`
> (Parte 4) e execute `docs/correcoes/todo/bloco-c-retorno-web/` na ordem
> FIX-46 → FIX-47. **Pré-requisito:** bloco-a (contacts) mergeado — rebaseie.
> **Antes do FIX-47, confirmar a decisão 4.3 do Kairo** (A=OTP / B=piloto) no
> próprio arquivo do item. TDD strict. Regra de ouro da F2: **a primeira vez não
> pode regredir** — o caminho de quem chega sem cookie e sem se identificar fica
> idêntico ao de hoje. 1 commit `test+feat:` por item; mover pra `done/`.
> Regressão: Camada 1 + integration (resume retorna a conversa do cookie; lookup
> por telefone/CPF). **Camada 2 (cassette) no FIX-47** se a IA passar a saudar o
> retorno ("vi que você já tinha simulado X") — comportamento do agente. E2E
> Playwright pros dois fluxos de retorno.
