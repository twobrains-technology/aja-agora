---
titulo: "Bloco r2-valor-compliance — carta fora da faixa, âncora de dinheiro, compliance de fala, parcela sem arredondar, contract-submit guard, higiene"
data: 2026-07-10
bloco: bloco-r2-valor-compliance
branch: fix/r2-valor-compliance-consorcio
tipo: fix (rodada 2 do loop de qualidade — verificador independente Fable, nota 3/10)
---

# Bloco r2-valor-compliance — 6 gaps de VALOR/MOTOR, COMPLIANCE e higiene

Rodada 2 do loop de qualidade sobre a jornada de consórcio: um verificador independente
(Fable) conduziu 2 runs determinísticos ao vivo contra o worktree `integ/agente-vendas-consorcio`
e deu nota 3/10 ("não é matador pra prod"). Este bloco fecha os 6 gaps de VALOR/MOTOR
(D1), COMPLIANCE (D5) e higiene (D4) atribuídos a esta sessão — o irmão paralelo
(`bloco-r2-funil-cards`) cobriu os gaps de funil/cards (D2/D3).

Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r1.md`. Executado NA ORDEM pedida:
FIX-240 → FIX-241 → FIX-243 → FIX-242 → FIX-244 → FIX-245, TDD strict em todos (teste
vermelho confirmado antes de cada fix, verde depois).

## TL;DR por item

- **FIX-240 (P0, CDC art. 30)** — o fechamento podia confirmar uma carta MUITO acima da
  faixa pedida sem aviso (pedido 120k → recomendada 150k → fechou 211k, 41% acima,
  silencioso). `pickClosestOffer` agora abre mão da fidelidade de marca
  (BUG-ADMIN-TROCADA-NO-FECHAMENTO) quando a oferta da administradora preferida diverge
  >20% do pedido e existe opção mais próxima; quando não há opção mais próxima, o
  `real_offer` sempre carrega `rawCreditValue` (valor pedido) e o aviso de ajuste
  (FIX-197) renderiza — estendido também ao canal WhatsApp, que não tinha o aviso.
- **FIX-241 (P1, spec 03 "Âncora de dinheiro")** — `anchorMonth()` (motor já existia,
  testado, nunca chamado em produção) e `monthlySavings` (só tipo, nunca capturado):
  "junto uns 4 mil por mês" nunca virava sinal, a agulha ancorava no PRAZO DESEJADO em
  vez do mês em que o BOLSO cobre o lance. Novo slot capturado por texto livre
  (turn-analyzer + merge oportunista em qualifyAnswers), `computeMoneyAnchor()` liga o
  cálculo ao slider (dial-payload) e à narração do agente (directives.ts) — "cálculo
  único, duas apresentações" nos dois canais. FGTS (vertical imóvel) capturado no mesmo
  padrão (decisão de escopo: passiva, não pergunta ativa — fora do que o card pedia).
- **FIX-243 (P1, spec 05, campo proibido)** — o agente vendeu com "a ITAÚ se destaca pela
  boa taxa de contemplação" na FALA (o guard existente só cobria payload/UI). Sanitizer
  novo (`isTaxaContemplacaoClaim`) dropa o segmento em runtime; system-prompt + HARD_RULES
  proíbem o termo explicitamente (paridade byte-a-byte mantida).
- **FIX-242 (P2, CDC art. 30)** — parcela arredondada (`maximumFractionDigits: 0`) em 3
  cards (comparison-table, contemplation-dial, two-paths): R$ 2.182,01 virava "R$
  2.182/mês". Corrigido pra centavos; carta segue sem centavos (não é o problema).
  `embedded-bid.tsx` (4º arquivo citado no veredito) foi REFUTADO — não tem campo de
  parcela.
- **FIX-244 (P2, defesa em profundidade)** — o handler `contract-submit` aceitava o
  fechamento mesmo sem `present_contract_form` ter aparecido na conversa (só
  `revealCompleted` era validado, FIX-12). Nova flag `contractFormDispatched`
  (mesmo hardening do `decisionDispatched`) + guard gêmeo no handler.
- **FIX-245 (P3, higiene)** — contradição TRIPLA de regra de emoji no system-prompt
  (proibição total × parcimônia com 2 ratios diferentes) resolvida pra fonte única
  (parcimônia, 1 a cada 3-4); comentário stale do FIX-C4 (dizia "só dinheiro abate",
  código já amortiza tudo desde o FIX-221) corrigido; educação de lance embutido passa a
  usar a carta REAL do cliente (disponível pós-reveal desde o FIX-215) em vez do exemplo
  genérico "R$ 100 mil".

## Achados extras corrigidos de quebra (não fazem parte do escopo original, mas apareceram)

Cada fix legítimo, ao alongar/renomear código, quebrou testes pré-existentes que fixavam
o comportamento ANTIGO — corrigidos no mesmo commit, sempre verificando a causa raiz
antes de tocar (nunca larguei um teste vermelho):

- 2× regex de slice frágil em `agent-trajectory.test.ts` (janela de caracteres fixa que
  não acompanhou o crescimento do bloco do gate `lance`/`simulator-offer` — corrigido pra
  travar na profundidade certa, não um número mágico maior).
- `contemplation-dial.oferta-real.test.tsx`/`.test.ts`: fixavam literalmente o valor
  ARREDONDADO como esperado (era o próprio bug documentado como certo) — atualizados pro
  valor real.
- `reveal-hero-seletor.fix-196.test.tsx`: assumia que só o hero mostrava centavos —
  agora os dois batem (ambos corretos), query escopada por testid.
- `no-emoji-fix212.test.ts`: cobrava a regra DURA original (superada pelo FIX-234,
  parcimônia) — testava uma regra que o produto já não seguia mais.
- Mesmo cassette: nome literal da const `LANCE_EMBUTIDO_EDU` → `lanceEmbutidoEdu`.

## Gate

- `pnpm test:unit`: 323 arquivos, 3035 testes verdes (cresceu de ~2994 no início do
  bloco — todo fix chegou com regressão TDD nova).
- `pnpm test:eval:quick` (Camada 3, LLM real): 5 avaliações verdes em cada commit que
  tocou prompt/directive/tool.
- `pnpm test:integration` (DB real, rodado explicitamente por tocar `route.ts`/adapters
  em 3 dos 6 itens): 61 suites, 268 testes verdes, 5 skips esperados. Achado de ambiente
  (não de código): 2 arquivos de integração precisam de `IDENTITY_ENC_KEY` exportado no
  shell — não têm o fallback self-contido que outros arquivos da mesma suíte têm;
  documentado no done/ do FIX-244, sem alteração de produto.

## Commits

| Commit | O quê |
|---|---|
| `3936837` | fix: clampa carta fora da faixa pedida e avisa ajuste no fecho (FIX-240) |
| `57f399f` | docs: move FIX-240 pra done |
| `4e0118d` | fix: âncora de dinheiro captura poupança mensal e ancora a agulha no bolso (FIX-241) |
| `9dbcd82` | docs: move FIX-241 pra done |
| `9403b65` | fix: proibe 'taxa de contemplação' na fala do agente, mesmo com número (FIX-243) |
| `492c8ea` | docs: move FIX-243 pra done |
| `7e97ec7` | fix: parcela nunca arredonda em comparison-table/dial/two-paths (FIX-242) |
| `efefb03` | docs: move FIX-242 pra done |
| `7fcd5c8` | fix: contract-submit exige present_contract_form já apresentado (FIX-244) |
| `a81ae1d` | docs: move FIX-244 pra done |
| `44750f8` | fix: higiene — regra única de emoji, comentário stale e exemplo real na educação de lance (FIX-245) |
| `de48621` | docs: move FIX-245 pra done |

(O commit `00cd4f9`, sob o mesmo título do FIX-240, ficou vazio de código por um
stash/pop de investigação durante a sessão — o conteúdo real está em `3936837`.)

## Gaps conhecidos (fora de escopo deste bloco)

- Gaps de funil/cards (D2/D3 do veredito): cobertos pelo bloco paralelo
  `bloco-r2-funil-cards` (branch `fix/r2-funil-cards-consorcio`).
- FGTS como fonte de embutido (spec 03): implementado só como captura PASSIVA por texto
  livre (mesmo padrão de `monthlySavings`); uma pergunta ATIVA/gate dedicado é decisão de
  produto/UX não coberta pelo card nem pela checklist de regressão desta rodada.
