---
data: 2026-06-19
bloco: bloco-b-simulador-recomendacao
escopo: FIX-54, FIX-55, FIX-56, FIX-57 — mecânica do simulador e da recomendação
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do Bloco B (simulador + recomendação)

Contexto: rodada 2 de teste manual do Bernardo (`jornada2_revisão.docx`) apontou
quatro defeitos na mecânica do simulador e da recomendação de grupos. As decisões
abaixo foram tomadas com o raciocínio da skill `brainstorming` (explorar contexto,
levantar 2-3 abordagens, pesar trade-offs, YAGNI), mas o executor é o decisor —
sem perguntas, best practice + padrões do repo. Limite de escopo: NÃO tocar
`system-prompt.ts`, `ai-sdk.ts` nem reposicionar o simulador no fluxo (isso é o
Bloco A, FIX-58). Aqui é só config/lógica/componentes.

---

## Decisão 1 — Novo teto de carro (FIX-54)

**O que decidir:** `CREDIT_BOUNDS.auto.max` está em R$ 300.000 — o Bernardo bateu
no teto ("carro está indo só até 300k"). Qual o novo teto realista?

**Opções consideradas:**
- (a) Subir para ~R$ 400 mil — cobre a maioria dos SUVs premium nacionais.
- (b) Subir para **R$ 500 mil** — cobre importados de volume e premium, e alinha
  com `servicos.max` (já 500k).
- (c) Subir para R$ 1 mi+ — cobre superesportivos/luxo extremo.

**Escolhida: (b) — R$ 500.000.** Cobre a faixa real de carros novos/premium que
estourava o teto antigo (importados, SUVs top de linha) sem entrar no irreal:
consórcio de automóvel raramente entrega carta acima disso, e teto exagerado
arriscaria oferta absurda / erro na Bevi (o `clampCreditToCategory` clampa pro
teto antes de bater na administradora). 500k ainda **alinha auto com `servicos`**
(coerência da config) e é um número redondo e legível. Min (20k) e default (80k)
permanecem coerentes.

**Coerência multicanal:** o WhatsApp usa `CREDIT_BUCKETS.auto`, cujo último bucket
("Acima de R$ 200 mil") tinha `max: 300_000`. Subi esse `max` para `500_000`
também — o título "Acima de R$ 200 mil" continua correto e os dois canais passam
a ter o mesmo teto (a config é "fonte única", divergir entre web e WhatsApp seria
o mesmo bug em outro canal).

---

## Decisão 2 — Números quebrados: step vs input livre (FIX-55)

**O que decidir:** o slider de valor do bem só aceita múltiplos do `step`
(`auto.step = 10_000` → 80k, 90k, 100k…). O usuário não consegue informar
R$ 347.500. Reduzir o step, adicionar input livre, ou ambos?

**Opções consideradas:**
- (a) Só reduzir o `step` (ex. 1.000) — ainda não permite valor 100% quebrado
  (347.500 não é múltiplo de 1.000), e step muito fino degrada o arraste no
  celular (muitos passos).
- (b) Só input numérico livre — resolve a precisão mas perde a exploração rápida
  do slider.
- (c) **Ambos** — slider com step menor (faixa rápida) + input numérico livre ao
  lado (precisão de centavo).

**Escolhida: (c) — ambos.** O slider continua sendo a ferramenta de exploração
rápida (mobile-first: arrastar é confortável), mas com `step` reduzido para
**R$ 1.000** em `auto` (granularidade fina sem virar 480 micro-passos). E um
**input numérico livre** ao lado dá a precisão exata (R$ 347.500) que o stakeholder
pediu. O input usa `inputMode="numeric"` (teclado numérico no celular) e clampa só
ao [min, max] da categoria — **nunca re-quantiza** para múltiplo do step.

**Por que o input livre não é re-quantizado:** a engine de link
(`recalcLinkedValues`) preserva o valor do campo que foi alterado (só re-deriva os
campos linkados, esses sim com snap). E `clampCreditToCategory` faz apenas
min/max clamp, sem snap. Logo um valor digitado livre sobrevive ponta a ponta.

**Onde aplica:**
- `qualify-config.ts`: `auto.step` 10.000 → 1.000 (beneficia o slider de ambos os
  componentes, que herdam o step via payload).
- `plan-estimate-picker.tsx` (componente da jornada real, gate "credit"): input
  livre no "Quanto custa o que você quer?".
- `value-picker.tsx` (artifact `present_value_picker`, ainda vivo no
  `artifact-renderer`/`gate-renderer`): input livre nos campos `currency`.
- O step do lance em `plan-estimate-picker.tsx:229` já é derivado de
  `credit.step / 10` — com o step novo vira ~100, granularidade fina automática;
  mantido como está (sem hardcode).

---

## Decisão 3 — Estratégia de dedup por administradora (FIX-56)

**O que decidir:** `rankGroups` ordena 100% por score e fatia top N, sem nenhuma
dedup — duas cotas da mesma administradora com score alto entram juntas. "1 por
administradora estrito" ou "diversifica mas completa N se faltar"?

**Opções consideradas:**
- (a) Estrito: no máximo 1 por administradora, mesmo que sobrem vagas no top N —
  arrisca devolver 1-2 opções quando o universo tem poucas administradoras
  (regressão do bug #09, que garante ≥3 opções).
- (b) **Diversifica e completa:** primeiro 1 por administradora (greedy por score),
  depois, se faltar para N, completa com os melhores grupos restantes.

**Escolhida: (b) — diversifica e completa.** Maximiza administradoras distintas no
top N (o que o usuário quer: comparar fontes diferentes) **sem** quebrar a garantia
de ≥3 opções quando há poucas administradoras. Algoritmo determinístico:
1. Ordena todos por score desc (sort estável preserva ordem em empate).
2. 1ª passada greedy: pega o 1º grupo de cada administradora ainda não vista, até N.
3. 2ª passada (fallback): se faltou para N, completa com os melhores restantes
   (na ordem de score), aí sim podendo repetir administradora.

Mantido em `rankGroups` (arquivo permitido) — o caller `executeRecommendGroups`
em `ai-sdk.ts` não muda (re-anota a flag `alternativa` por id, que `rankGroups`
preserva).

---

## Decisão 4 — Sinalizar o próximo passo + clareza meses×lance (FIX-57)

**O que decidir:** ao fim da simulação o usuário não percebe o próximo passo
(card parece um fim; único CTA é "Tenho interesse", a transição pro card de
decisão é silenciosa do servidor). E o stakeholder perguntou se "é regra do grupo"
que mais meses = menos lance (não é bug — `contemplation-dial.ts` está correto;
é falta de comunicação). Como resolver sem reposicionar o fluxo (FIX-58 do Bloco A)?

**Opções consideradas:**
- (a) Reposicionar/encadear o card de decisão no fluxo — **fora de escopo** (Bloco A).
- (b) Mudar o cálculo do dial — **proibido** (a mecânica está certa).
- (c) **Affordance + microcopy no próprio card de simulação** — sem tocar
  orquestração nem fórmula.

**Escolhida: (c).** Dois acréscimos no `simulation-result.tsx`, ambos puramente de
UI/copy:
1. **Microcopy meses×lance** dentro do bloco "Cenário com lance": uma linha
   explicando a relação ("Quanto antes você quiser ser contemplado, maior o lance.
   Mais meses, menos lance."). Responde a dúvida do stakeholder sem mudar número.
2. **Affordance de próximo passo** acima do CTA "Tenho interesse": uma microcopy
   curta ("Próximo passo: confirmar se esse plano faz sentido") que transforma o
   card de "fim" em "avançar", deixando claro o que o clique destrava. NÃO duplica
   o card de decisão (que continua sendo emitido pelo servidor) — só sinaliza a
   continuidade na UI.

Não mexo no `decision-prompt.tsx` (já tem CTAs claros) nem em `contemplation-dial.ts`
(fórmula correta). Mantém o escopo cirúrgico e sem overlap com o FIX-58.
