# Adendo B8 ao refino da tela de recomendação — hero + seletor de cotas + fix do P0

> 2026-07-01 · complementa `2026-07-01-refino-tela-recomendacao-design.md` (backlog §8) com o
> achado da 1ª rodada de QA (skill `qa-dono-produto`, conversa `fe2e8a09-…`) e a decisão do Kairo.

## B8 — Troca de cota client-side (hero + seletor) + fim do loop de conversão (P0)

**Achado (P0, evidência `passo5-6-META-NARRATIVA-loop.png`):** ao escolher outra cota por
**texto livre** ("quero seguir com o BB"), o agente não re-resolve o grupo/ID e despeja
meta-narrativa admitindo falha técnica ao cliente ("esse grupo deu um problema", "preciso trazer
os IDs reais") → **loop**. É o sintoma de superfície do mesmo defeito de raiz do B1 (hero não
coagido / grupo não ancorado server-side).

**Decisão do Kairo (2026-07-01, "palavra nova vence"):** o reveal passa a ser **hero fixo +
seletor de cotas** (Opção 1). Tocar um chip promove aquela cota ao hero e recalcula o simulador
**no lugar** (client-side); "Seguir com <cota>" dispara **ação estruturada** carregando o
`groupId` real → contrato **sem** re-resolução pelo agente. Escolher cota por texto livre passa a
ser **defeito**. Spec completa: `2026-07-01-reveal-hero-seletor-cotas-design.md`.

## CONTRATO entre os blocos desta onda (nível 3)

Ambos os blocos implementam contra este contrato (bloco-b usa stub `TODO(bloco-a):` até o merge):

- **Payload coagido do reveal (bloco-a fornece):** a lista de cotas do reveal carrega, por cota,
  campos **coagidos server-side** a partir do retorno real da Bevi:
  `{ administradora, valorCarta, parcela:number, prazo:number, availableSlots:number,
  groupId:string, ofertaId:string, quotaId:string }`. `availableSlots` = `monthlyAwardedQuotas`
  real coagido (0 quando ausente). `tipoOferta` entra como critério **interno** de ranking/dedup,
  **não** vai pra UI.
- **Ação de escolha (bloco-b emite → bloco-a trata):**
  `{ kind: "choose_offer", groupId: string, ofertaId?: string }`. O handler server-side (bloco-a)
  avança direto ao `contract_form`/`real_offer` re-simulando **com esse `groupId`**, **sem**
  `search_groups`/re-resolução, e **sem** nenhuma frase do padrão proibido §8 do roteiro.
