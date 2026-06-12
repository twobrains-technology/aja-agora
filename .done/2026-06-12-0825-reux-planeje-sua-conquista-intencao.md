# Planeje sua conquista — re-UX guiada por intenção

**Data:** 2026-06-12 · **Tipo:** re-UX de componente interativo (passo 2 da jornada)
**Origem:** design handoff `componentes-aja` (Bernardo/design) + apontamento do Kairo ("esse componente não era pra existir dessa forma mais")

## O que mudou pro usuário

O cartão **"Planeje sua conquista"** (a primeira coisa que o cliente preenche depois de dizer o que quer) deixou de jogar **4 sliders ao mesmo tempo** na cara dele — valor, quando usar, parcela, lance — que confundiam e pareciam um formulário disfarçado.

Agora ele segue o raciocínio natural de quem está sonhando com a conquista:

1. **"Quanto custa o que você quer?"** — um slider só.
2. **"O que mais importa pra você agora?"** — escolhe a prioridade: *Menor parcela · Receber rápido · Tenho um lance*.
3. **Só o controle relevante aparece** — quem quer receber rápido vê "em até quantos meses"; quem tem lance vê o campo de lance + embutido; quem quer parcela leve não vê nada disso.
4. **A parcela é a consequência, calma e clara:** *"Sua parcela fica em R$ 1.277,78/mês · R$ 92 mil no total · taxa de 15% já inclusa"* — em vez de o usuário ter que adivinhar quanto pode pagar.

O resultado é uma conversa, não um painel de controle. E o agente reage como vendedor: confirma a **prioridade** do cliente ("72 meses é a jogada certa pra manter a parcela enxuta") sem re-perguntar nada que ele já disse.

## Por que isso importa pro negócio

- **Aderente à jornada canônica** (a regra do produto): a jornada pede "valor → em quanto tempo quer o bem → lance", com a parcela como resultado. A forma antiga (parcela como campo de entrada) é que divergia. A nova **cumpre o docx**.
- **Menos atrito = menos abandono** no passo onde o funil mais perde gente (o primeiro "formulário").
- **Coerência de marca:** segue o handoff hi-fi de design ponto a ponto.

## Qualidade entregue

- **Tudo via TDD** (teste → ver falhar → corrigir): engine, componente e o ajuste de funil.
- **Suite verde: 1578 testes** (Camada 1 estrutural + Camada 2 cassettes de comportamento do agente), incluindo regressão nova que **impede a volta dos 4 sliders** e a re-pergunta de prazo.
- **E2E real no browser** (Playwright/DevTools): navegado da escolha de categoria até o submit, validando as 3 prioridades, o cálculo (80k × 1,15 ÷ 72 = R$ 1.277,78) e a reação do agente.
- **Selo "estimativa de mercado" preservado** — regra inviolável (a Bevi só simula com CPF; nada aqui é número de administradora).

## Risco tratado no caminho

O E2E pegou um defeito que os testes de unidade não veriam: depois de escolher "Menor parcela", o agente **re-perguntava** "em quanto tempo você quer o carro?" — redundante com a prioridade recém-escolhida. Corrigido na hora (a intenção agora preenche o prazo de contemplação e o funil pula a pergunta), com teste de regressão dedicado.

## Decisão de arquitetura

Mantivemos o **contrato de dados com o agente quase intacto**: a parcela continua indo pro backend (agora calculada, não digitada) e adicionamos só `termMonths`/`intent`. Isso preservou todo o funil, a recomendação e os cassettes existentes — re-UX de alto impacto visual, blast radius baixo no agente.

## Escopo / honestidade

- **Picker:** reescrito (era o que estava divergente).
- **Mostrador de contemplação (dial):** auditado — **já estava aderente ao handoff** (feito no rebrand #27, reusa o engine real). Zero mudança necessária; diferenças são só copy menor que não justifica mexer.
- **Não tocado:** o simulador do passo 4 (oferta real) segue como está — é território do conceito do Bernardo.

## Arquivos

11 arquivos, +490/−246. Núcleo: `plan-estimate-picker.tsx` (componente), `plan-estimate.ts` (engine), `qualify-config.ts` (intenção→prazo/objetivo), `route.ts`/`directives.ts`/`actions.ts`/`adapter.ts` (contrato do agente), `ui-message.ts` (props). Regressão em `agent-trajectory.test.ts` + testes de unidade.

**Sugestão de commit:** `feat: Planeje sua conquista guiado por intenção (re-UX do passo 2)`
