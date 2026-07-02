# Bloco B — Reveal: hero fixo + seletor de cotas (UI) · entrega

> Onda reveal-refino · branch `feat/reveal-hero-seletor-ui` · 2026-07-02
> Frontend do refino da tela de recomendação. FIX-196, FIX-197, FIX-198.

## O que muda para o usuário

Na tela de recomendação, o cliente agora **escolhe qual cota vira o card
principal sem sair da conversa**. Antes, se ele preferia outra administradora,
tinha que digitar "quero o Itaú" em texto livre — e o agente travava tentando
re-descobrir o grupo, despejando mensagens técnicas de erro e entrando em loop
(o P0 da rodada de QA). Agora:

- **Um card em destaque (hero) com o simulador**, e abaixo uma fileira de
  **chips** com as outras cotas. Tocar um chip **promove aquela cota ao destaque
  na hora** — parcela, valor, prazo e o simulador de contemplação recalculam no
  lugar, sem recarregar nada e sem empurrar a conversa.
- **"Seguir com <cota>"** leva direto ao contrato **da cota escolhida**, com o
  grupo já resolvido — sem o agente ter que adivinhar de novo. Fim da raiz do loop.
- **Números honestos:** contemplação só aparece quando há o dado real ("N por
  mês"); nunca mais uma taxa percentual disfarçada de contagem. A cota que não é a
  recomendada não finge ter um "score de recomendação" que não é dela.
- **Transparência do ajuste de faixa:** quando a carta do grupo é de R$ 300 mil e
  ajustamos para a sua faixa (~R$ 131 mil), a tela **avisa** — em vez de deixar o
  cliente confuso com dois números.
- **Acessibilidade:** o mostrador de contemplação agora funciona **pelo teclado**
  (setas, Home/End, PageUp/Down) — não só arrastando com o dedo/mouse (WCAG).

## Qualidade entregue

- **Régua de 3 camadas** respeitada (comportamento de UI do agente):
  - Camada 1 (estrutural): 3 arquivos de teste novos — o seletor troca a cota
    client-side sem chamar o agente; "Seguir" emite a ação estruturada
    `choose_offer` com o grupo certo; contemplação some quando não há dado; aviso
    de ajuste só quando os valores diferem; slider responde a cada tecla.
  - Camada 2 (cassette): o cassette que **trava o retorno do P0** (agente
    re-resolvendo grupo) é do bloco-a — este bloco garante que a UI **não**
    re-dispara busca (emite ação estruturada, não texto livre).
- **Gate do projeto verde:** `pnpm test:unit` — **2329 testes, 0 falhas** (rodado
  em container transitório com Postgres migrado; host sem node_modules por regra).
- **Zero regressão:** todos os testes existentes dos cards tocados seguem verdes;
  fora do reveal, os componentes mantêm o comportamento legado (fallback inerte).

## Arquitetura

O reveal virou um **conjunto de artefatos com estado compartilhado por mensagem**
(contexto React `reveal-selection`), sem mudar o formato do que o backend emite:
hero, seletor e simulador leem/escrevem o mesmo `selectedGroupId`. Integridade de
dados como código, não como texto no prompt — a UI só exibe o que vem coagido do
servidor (Lei 3/4/5 de arquitetura de IA).

## Contrato com o bloco-a (a fechar no merge)

Este bloco **consome** o payload coagido e **emite** a ação `choose_offer` (ambos
stubados com `TODO(bloco-a)`). Dependências pro bloco-a no merge:
1. Tratar `choose_offer` no route (avançar ao contrato com o `groupId`, sem
   re-resolução).
2. Coagir server-side: `groupId`/`ofertaId`/`quotaId`/`availableSlots` por cota.
3. **`rawCreditValue`** (valorCarta bruto) para o aviso de ajuste de faixa (FIX-197)
   — extensão além do adendo B8; sem ele o aviso fica dormente (degrada sem quebrar).

## Fora de escopo (PENDENTE-Bernardo)

FIX-96 (hero + 5 + "ver todas") e as mudanças do dial ligadas a T2 (lance embutido
amortiza × reduz) seguem segurados aguardando aval do Bernardo — não tocados.

## Commits

- `f6536b85` feat: reveal com hero fixo + seletor de cotas (FIX-196)
- `14275c32` feat: aviso de ajuste de faixa no reveal e no card real (FIX-197)
- `947476eb` feat: slider do contemplation_dial operável por teclado (FIX-198)
