---
bloco: bloco-r-scroll-inteligente
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-o-outras-opcoes-dedupe, bloco-p-acoes-e-lance-do-card, bloco-q-handoff-msg-duplicada]
itens: [FIX-32]
escopo_arquivos:
  - src/components/chat/message-list.tsx
conflitos_esperados: []
---

# Bloco R — Scroll inteligente do chat (gesto do usuário vence)

Item único: FIX-32. Testes manuais do Kairo no dev (2026-06-11): auto-scroll
força o fundo durante streaming mesmo com o usuário rolando pra cima
(`|| isStreaming` no effect), e a detecção de "fundo" por
IntersectionObserver confunde posição com intenção (não acompanha resposta
nova em outro cenário). Arquivo único, disjunto dos demais — merge limpo.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-r-scroll-inteligente/ (item FIX-32). A regra de
> produto está nas palavras do operador dentro do item — gesto do usuário
> SEMPRE vence o auto-scroll. Avalie `use-stick-to-bottom`/scroll anchoring
> nativo antes de reimplementar na mão (registre a escolha no item). TDD
> strict (testes do componente ANTES, ver falhar) + validação E2E Playwright
> do cenário de streaming + wheel up. 1 commit `test+fix:`, mover pra done/
> ao concluir e apagar a pasta do bloco.
