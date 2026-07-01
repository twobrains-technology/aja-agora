---
id: FIX-121
titulo: 'Welcome do chat web com 3 categorias (tirar "Outros"/serviços)'
status: todo
severidade: baixa
projeto: aja-agora
bloco: bloco-entrada-welcome-upload
arquivos: [src/lib/web/adapter.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem (auditoria D21 — divergência código×jornada)

Divergência **D21** do Mapa em `docs/jornada/jornada-canonica.md`. A **voz do operador** (regra
canônica do Passo 1 da jornada) diz:

> No Passo 1 (entrada), o usuário escolhe entre **3 categorias — Imóvel, Carro e Moto**. Moto
> SUBSTITUIU "serviços"/"Outros" nos chips de entrada (decisão **Bv2-01 / Bruna v1 #20**).

WhatsApp e landing já cumprem a regra (3 opções). O **chat web ainda exibe uma 4ª categoria
("Outros"/serviços)** no card de boas-vindas. Divergência código×jornada = defeito do código
(REGRA de produto inviolável, `CLAUDE.md`).

**A REGRA aqui é a PARIDADE com o comportamento web já correto dos outros canais** — WhatsApp
(`welcomeButtonsToWhatsApp`, 3 botões) e landing (`CHIPS`, 3 chips) são a referência. O chat web
tem que mostrar exatamente as mesmas 3 categorias.

## Cenário exato

- **Rota/tela:** chat web — primeira interação (card de boas-vindas / `data-welcome`, Passo 1
  da jornada).
- **Passos:** 1) usuário abre o chat web; 2) o adapter emite o evento `welcome-categories`;
  3) o card de boas-vindas renderiza as opções clicáveis de categoria.
- **Comportamento divergente hoje:** o card mostra **4 opções** — Imóvel, Automóvel, Moto e
  **"Outros"** (`servicos`). No WhatsApp e na landing aparecem só **3** (Imóvel/Carro, Moto,
  sem "Outros").
- **Evidência (file:line, código atual):**
  - `src/lib/web/adapter.ts:175-180` — `WELCOME_OPTIONS` com 4 entradas, a 4ª sendo
    `{ value: "servicos", label: "Outros" }` (linha 179).
  - `src/lib/web/adapter.ts:273` — consumo: `data: { options: WELCOME_OPTIONS }` no case
    `welcome-categories` (emite `data-welcome`).
  - WhatsApp CORRETO: `src/lib/whatsapp/formatter.ts:806-826` — `welcomeButtonsToWhatsApp`
    retorna exatamente 3 botões (imovel/auto/moto), com comentário citando Bv2-01/Bruna v1 #20.
  - Landing CORRETA: `src/components/landing/hero.tsx:19-23` — `CHIPS` com 3 entradas
    (Imóvel/Carro/Moto).

## Esperado × Atual

- **Esperado:** card de boas-vindas do chat web com **3 categorias clicáveis** — Imóvel,
  Automóvel, Moto — em paridade com WhatsApp e landing.
- **Atual:** card com **4 categorias** — Imóvel, Automóvel, Moto e "Outros" (`servicos`).

## Root cause (INVESTIGADO — provado no código atual)

`WELCOME_OPTIONS` (`src/lib/web/adapter.ts:175-180`) é um array estático que **ainda carrega a
entrada legada** `{ value: "servicos", label: "Outros" }` (linha 179). Esse array é consumido
deterministicamente em `adapter.ts:273` (`data: { options: WELCOME_OPTIONS }`), disparado pelo
evento `welcome-categories` (case em `adapter.ts:268-275`) — **não passa por turno de LLM**, é
código puro. Ou seja: o card sempre renderiza as 4 opções.

Quando a decisão **Bv2-01 / Bruna v1 #20** ("moto substitui serviços nos chips de entrada")
foi aplicada, o WhatsApp (`formatter.ts:806-826`, com comentário explícito da decisão) e a
landing (`hero.tsx:19-23`) foram atualizados para 3, mas **`WELCOME_OPTIONS` do web ficou para
trás** com a 4ª entrada. Confirmado lendo os três arquivos no HEAD atual do worktree.

**Nuance importante (não estourar o escopo):** a categoria `servicos` **continua viva no
domínio** e NÃO deve ser removida — o tipo `Category` tem os 4 valores
(`src/lib/agent/personas.ts:7`), `CATEGORY_META.servicos` existe
(`src/lib/agent/categories.ts:12`), o `turn-analyzer` detecta `servicos` a partir de texto livre
(`src/lib/agent/turn-analyzer.ts:22-25,130`) e há config de qualificação/recomendação para
`servicos` (`qualify-config.ts`, `recommendation.ts`). O usuário que digita "quero fazer uma
reforma" continua caindo em `servicos` normalmente. **A correção é SÓ tirar a opção CLICÁVEL de
entrada do card** — o mesmo recorte que WhatsApp e landing já fazem (mostram 3 chips, mas a
categoria serviços segue acessível por texto livre). Remover `servicos` do enum quebraria
`CATEGORY_META`, `turn-analyzer`, `qualify-config` e `recommendation` — **proibido**.

## Correção proposta (o quê × onde)

| O quê | Onde |
|-------|------|
| Remover a entrada `{ value: "servicos", label: "Outros" }` de `WELCOME_OPTIONS`, deixando exatamente 3 opções (imovel/auto/moto) | `src/lib/web/adapter.ts:179` (dentro do array `WELCOME_OPTIONS`, linhas 175-180) |
| NÃO tocar no enum `Category`, `CATEGORY_META`, `turn-analyzer`, `qualify-config` nem `recommendation` — `servicos` permanece acessível por texto livre | (fora de escopo — só validar que nada disso muda) |

## Regressão exigida

Este é **código puro determinístico** (array estático consumido pelo adapter no evento
`welcome-categories`, sem passar por LLM) → a regressão é **unit/structural**, não precisa de
cassette da Camada 2.

**Camada 1 — structural/unit (obrigatória), em `src/lib/web/adapter.test.ts`:**

O arquivo de teste **já existe e HOJE PINA o comportamento errado** — o teste
`adapter.test.ts:10-12` afirma `it("tem exatamente 4 categorias: imovel, auto, moto, servicos")`
com `expect(values).toEqual(["auto", "imovel", "moto", "servicos"])`. Esse teste precisa ser
**virado** para refletir a REGRA (paridade com WhatsApp/landing):

1. **Ver falhar primeiro (TDD strict):** trocar a asserção para "**exatamente 3 categorias:
   imovel, auto, moto**" (`expect(values).toEqual(["auto", "imovel", "moto"])`) e adicionar
   `expect(values).not.toContain("servicos")`. Rodar **antes** do fix — deve FALHAR (o código
   ainda tem 4 e o array contém `servicos`).
2. **Aplicar o fix** (remover a linha 179 de `WELCOME_OPTIONS`).
3. **Ver passar:** re-rodar `pnpm test:unit` (ou vitest do arquivo) — verde.
4. Manter os testes existentes que continuam válidos (`inclui 'moto'`, `label 'Moto'`).

Opcional/recomendado — **teste de paridade explícito** (mesma REGRA D21): asserir que os
`value`s de `WELCOME_OPTIONS` batem com o conjunto de categorias exibidas pelo WhatsApp
(`welcomeButtonsToWhatsApp` → ids `category_imovel/category_auto/category_moto`) — assim uma
futura divergência entre os canais quebra o teste.

Commit único `test+fix:` (teste virado primeiro, fix depois), conforme regra TDD.
