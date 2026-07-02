# BRIEF de refino — Tela de recomendação + simulação (contra o JSON REAL da Bevi)

> **Isto é o BRIEF de kickoff, não a spec final.** A sessão de refino (colaborativa, Kairo + Claude)
> parte daqui via `superpowers:brainstorming`, vira uma spec em `docs/design/specs/…-design.md`, e só
> depois a implementação é lançada com `todo-blocks`. **Não implementar direto** — pensar a tela primeiro.
>
> **Regra-mãe do projeto:** nada mockado em runtime — todo número exibido vem do retorno REAL da Bevi.
> Evidência de referência: `_evidencia/2026-07-01-bevi-simulation-130k-auto.json` (captura real, auto, R$130k).

## Objetivo (palavras do Kairo)
> "temos que refinar em outra sessão para ficar perfeito, pensar na tela e ajustar tudo muito bem...
> veja a dinâmica os planos que estão aí olhando para o json de retorno de exemplo."

Deixar a tela de recomendação + o card de simulação/confirmação **perfeitos**, ancorados 100% no que
a Bevi realmente retorna. Fonte de verdade da UI = os campos do JSON, não suposição.

## O que a Bevi REALMENTE devolve (por oferta)
`administradora` · `tipoOferta` (**SPECIAL_OFFER** | **FREE_BID**) · `grupo` · `valorCarta` ·
`parcela` (string BRL) · `prazo` (meses) · `lanceMedio` (opcional) · `taxaContemplacao` (**0..1**, é
uma TAXA/fração, não uma contagem) · `quotaId`. O retorno de exemplo teve **24 offers** numa faixa só.

## O que a tela mostra HOJE (prints 2026-07-01)
- **Hero "Recomendação / Boa compatibilidade":** BANCO DO BRASIL · Parcela R$ 2.365,57/mês · Valor do
  bem R$ 131.042,24 · Prazo 72 meses · **Contemplados/mês: "36 por mês"** · Tipo de grupo Automóvel ·
  "Por que esta recomendação?" (colapsável) · botão "Tenho interesse".
- **Cards secundários (4):** BANCO DO BRASIL (Top) R$ 2.366 / 72m / R$ 131.042 · RODOBENS R$ 1.756 /
  96m / R$ 130.000 · CANOPUS R$ 2.197 / 76m / R$ 130.000 · ÂNCORA R$ 2.084 / 79m / R$ 130.000.
- **Card de confirmação (pós "contratar"):** Valor do bem R$ 131.042 · Parcela R$ 2.365,57 · Prazo 72m ·
  Grupo 1797 · **Lance médio do grupo R$ 79.281** · Administradora BANCO DO BRASIL.

## Pontos a investigar/refinar (levantados do JSON × tela — HIPÓTESES, confirmar no código)
1. **"Contemplados/mês: 36 por mês" — de onde vem?** O JSON só tem `taxaContemplacao` (fração, ex.
   0,605 pro BB), **não** uma contagem mensal. "36 por mês" pode estar **fabricado ou mal-mapeado** —
   viola a regra "nada mockado". CONFIRMAR a origem do número; se não vier da Bevi, é defeito.
2. **`tipoOferta` (SPECIAL_OFFER × FREE_BID) não aparece na tela.** FREE_BID = lance livre; SPECIAL =
   oferta especial. O Kairo respondeu **sim ao lance embutido** — isso deveria influenciar quais
   ofertas entram e como o simulador calcula. Decidir se/como exibir e ranquear por tipo.
3. **`lanceMedio`** só aparece na confirmação (R$ 79.281 — que NÃO bate com o `lanceMedio` do JSON do
   grupo 1797 = 181.500; o 79.281 parece ser lance embutido/ajustado). CONFIRMAR o cálculo e onde exibir.
4. **`taxaContemplacao`** (a informação de liquidez REAL) hoje não é mostrada como taxa — vira o
   "36 por mês" suspeito. Repensar como comunicar chance de contemplação de forma honesta e clara.
5. **Ranking/seleção do hero + secundários:** 24 offers → 1 hero + 4/5 cards. Como deduplica por
   administradora (FIX-56), ranqueia (recommendation.ts) e escolhe o hero. O teto de 3 já foi removido
   (FIX-180 area) — desenhar o "ver todas" (hero + 5 + expansível) que é o **FIX-96, SEGURADO aguardando
   aval do Bernardo** — este refino é a chance de fechar a UX com ele.
6. **`valorCarta` 300.000 no JSON × R$ 130.000 na tela:** há uma camada de ajuste (o usuário pediu 130k;
   a Bevi devolve cartas de 300k e o sistema ajusta/simula pra faixa). CONFIRMAR o mapeamento
   (creditAdjustmentNotice, Bv2-08) e garantir que parcela/valor exibidos são coerentes.
7. **`taxaContemplacao: 0`** em algumas ofertas (RODOBENS grupo 10801) — como ranquear/exibir sem dado?
8. **Copy de transição ainda colando** ("...simular com os dados corretos.Show, esse plano encaixa") +
   "tive um problema" — pode ser conversa PRÉ-deploy dos fixes de hoje (FIX-182/183). Reconfirmar numa
   conversa nova; se persistir, é escopo desta tela também.
9. **Simulador (agulha de contemplação, passo 4 — conceito do Bernardo):** "escolhe o mês e vê ao vivo o
   que precisa de lance e quanto fica de crédito líquido". Amarrar o cálculo (lance embutido até 30% +
   lance próprio → mês-alvo) aos dados reais da oferta escolhida.

## Fora de escopo desta tela (não confundir)
- A doença de governança do agente (allowlist estado→ação→precondição) — já foi pra prod hoje (FIX-179/180).
- Aqui o foco é **a tela** (recomendação + simulação + confirmação) e o **mapeamento dado-real → UI**.

## Próximo passo
Sessão de refino: `superpowers:brainstorming` a partir deste brief → decisões de produto com o Kairo
(especialmente o item 1, 2, 5, 9 — decisão de produto/UX) → spec final em `docs/design/specs/` →
`todo-blocks` pra implementar. Design system: shadcn/studio Pro (regra do projeto).
