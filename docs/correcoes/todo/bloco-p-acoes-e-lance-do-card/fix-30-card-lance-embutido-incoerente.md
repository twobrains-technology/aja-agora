---
id: FIX-30
titulo: "Card de simulação rotula o lance TOTAL necessário (74,43%) como 'lance embutido' e mostra 'recebe R$ 80.000' (carta cheia) ao mesmo tempo — contradição na tela"
status: todo
bloco: bloco-p-acoes-e-lance-do-card
decisao_pendente: "Semântica bidPercentage/receivedCredit com a AGX (perguntas 7 e 8 da proposta-simulador.md) — a ROTULAGEM honesta não depende disso e pode ir já"
arquivos:
  - src/lib/adapters/bevi/offer-mapper.ts (embeddedPercent reusa bidPercentage)
  - src/components/chat/artifacts/simulation-result.tsx (rotulagem do bloco de lance)
  - docs/jornada/proposta-simulador.md (pergunta 8 — já adicionada na anotação)
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
---

# FIX-30 — Bloco de lance do card de simulação com semânticas misturadas

### Palavras do operador

> "eh muita alucinacao, eu nao estou entendendo de verdade." (mesma sessão do
> FIX-29 — a percepção de "alucinação" vem em parte destes números
> contraditórios na tela)

### Cenário exato (print, dev 2026-06-11 — oferta ÂNCORA, bem R$ 80.000)

O card de simulação mostrou, em sequência:

- "CENÁRIO COM LANCE: Com lance de **74.43%** do valor do bem, expectativa de
  contemplação em ~6 meses"
- "COM LANCE EMBUTIDO (**74.43%**): Valor que você recebe **R$ 80.000,00** ·
  Lance estimado p/ contemplar **R$ 59.544,00** · 'Usa parte da própria carta
  como lance — sem precisar do valor todo em dinheiro'"

Três contradições visíveis pro usuário:

1. O MESMO 74,43% aparece como "lance" e como "lance embutido" — conceitos
   diferentes com o mesmo número.
2. Embutido de 74,43% é impossível na prática (teto regulatório/comercial
   típico ≤ 25-30%; maior visto nas ofertas reais: ~53%).
3. "Embute 74% da carta" + "recebe R$ 80.000 (a carta CHEIA)" não fecham —
   se embute, recebe carta − embutido.

### Root cause INVESTIGADO (provado no código + aritmética)

Os números são LITERAIS da fonte (pós-FIX C3 o payload é coagido server-side
contra o retorno real do simulate_quota — o LLM não digita nada). O defeito é
de MAPEAMENTO e ROTULAGEM:

- **Aritmética**: 59.544 / 80.000 = **0,7443 exato** → o `bidPercentage` da
  Bevi nesta oferta é o **lance TOTAL necessário ÷ carta**, NÃO o teto do
  embutido.
- `src/lib/adapters/bevi/offer-mapper.ts:135` — `lancePercent =
  bidPercentage × 100` (74,43) alimenta o "CENÁRIO COM LANCE".
- `offer-mapper.ts:140` — `embeddedPercent = lancePercent || 30` **reusa o
  mesmo número** pro rótulo "COM LANCE EMBUTIDO (74.43%)". Mistura provada.
- `offer-mapper.ts:142` — `receivedCredit` usa o literal da fonte, que nas
  ofertas ao vivo de junho vem como carta CHEIA (pergunta 7 à AGX) →
  contradição com o rótulo de embutido na mesma tela.

### Correção proposta

| O quê | Onde |
|---|---|
| Separar semânticas no mapper: `lancePercent` (lance total necessário) NUNCA vira `embeddedPercent`; embutido só com dado REAL de embutido (campo próprio da oferta) — sem dado, OMITIR a seção (padrão FIX-8: real ou nada) | `offer-mapper.ts` |
| Rotulagem honesta no card: o que temos REAL é "lance estimado p/ contemplar R$ X (Y% da carta)" — exibir assim; "lance embutido" só quando a oferta traz o teto de embutido de verdade | `simulation-result.tsx` |
| Coerência recebido×embutido: enquanto a AGX não responder (perguntas 7/8), nunca exibir "% embutido" e "recebe carta cheia" juntos — mostrar só o que não se contradiz | `simulation-result.tsx` |

### Estado da arte (pesquisa web 2026-06-11 — ver `docs/correcoes/2026-06-11-pesquisa-stack-padroes.md`)

- **`toModelOutput`** (novo no AI SDK 6) é o upgrade natural do nosso padrão
  de coação (FIX-6/C3): o `execute` retorna o payload completo pra UI e o
  modelo recebe só uma REFERÊNCIA ("oferta #123 renderizada") — números nunca
  entram no contexto do modelo, coação server-side vira 2ª linha de defesa.
  Avaliar na execução se cabe junto.
- Guia fintech 2026: **logar cada coerção aplicada** (valor que o modelo
  tentou × valor injetado) como trilha de auditoria — em produto regulado,
  número alucinado exibido é finding de auditoria. Conecta com o turn-trace
  (FIX-21).

### Regressão exigida (3 camadas)

- Camada 1: unit do mapper com a captura real da ÂNCORA (bidPercentage 0,7443,
  necessaryBid 59.544, receivedCredit 80.000) → embeddedBid omitido/separado;
  component test — card nunca renderiza "% embutido" + "recebe carta cheia"
  juntos.
- Camada 2: cassette dispensável se o fix ficar todo em mapper+render
  (não-agêntico); adicionar mesmo assim se a directive/prompt mudar.
- Camada 3: cenário de eval com oferta de bidPercentage alto — texto do agente
  não chama o lance total de "embutido".
