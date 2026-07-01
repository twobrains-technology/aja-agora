# ADR — Trilho B só descobre, Trilho A fecha (fechamento-via-B descartado)

> 2026-06-28 · Decisão do Kairo na sessão de arquitetura do "fechamento via Trilho B".

## Contexto

Pedido inicial: tornar o Trilho B (self-contract) um item do adapter capaz de
**fechar** (não só descobrir), exposto como opcional por env/fallback ("as duas
camadas"). A investigação (mapa do adapter + estudo de payloads ao vivo —
`docs/integracoes/trilho-b-payload-study.md`) revelou:

- **O estado já é esse:** o Trilho B JÁ é o adapter de descoberta
  (`BeviSelfContractAdapter`); o Trilho A JÁ é o gateway de fechamento
  (`BeviApiAdapter`), com handoff B→A via `pickClosestOffer` (`fulfillment.ts`) —
  já exercitado em E2E.
- **Restrição dura do Trilho B:** 1 proposta ativa por loja/device (hash único).
  `/system` e `update-step` resolvem a proposta corrente **só pelo hash** (sem CPF
  nem fingerprint no request — confirmado via curl pelado). O nosso backend é 1
  "device" pra N usuários → conversas simultâneas compartilham a proposta corrente
  no servidor. **Tolerável na descoberta** (simulação é stateless: só lê ofertas de
  `(segmento, valor)`), **catastrófico no fechamento** (KYC/finalização escreveria
  na proposta de outro usuário).
- **O Trilho A não tem esse problema:** enforcement por CPF (`409 ongoing`) +
  `proposalId` explícito em cada chamada → multi-tenant nativo.

## Decisão

1. **Trilho B = só descoberta. Trilho A = sempre o fechamento.** O "fechamento via
   Trilho B" foi descartado (inviável multi-usuário com hash único). Isto é o
   status quo — a feature original era o desvio.
2. O handoff descoberta→fechamento permanece: re-simular no A + casar a oferta
   escolhida (`pickClosestOffer` por administradora + valor mais próximo).

## Consequências

- **A fidelidade B→A está GATED por pendência externa da Bevi/AGX.** O
  `calculate_simulation` do A devolve `400 "Proposta não pertence ao Bevi
  Consórcio"` — o `productId` aceito pelo `insert` está desvinculado do produto
  "Consórcio" na conta do token (dossiê `2026-06-26-dossie-validacao-endpoints-bevi.md`
  + re-validação ao vivo em 28/06). Sem isso o A **não simula** → o handoff não é
  validável E2E.
- **FIX-79 revertido** (28/06): `productId` removido do `simulate` do A (a doc
  oficial não tem o campo; ele não resolvia o ownership-400). Commit `test+fix`
  com regressão em `bevi-api-adapter.test.ts` + reconciliação de
  `fulfillment.fix-79.test.ts`.
- **PENDENTE-KAIRO:** acionar a Bevi/AGX pra corrigir o vínculo do `productId` com
  o produto Consórcio na conta do token — é a causa-raiz e o desbloqueio do
  fechamento.
- **Robustez do `pickClosestOffer`:** melhorável (casar por mais atributos), mas só
  validável quando o A destravar.

## Concorrência da descoberta (dívida registrada, não resolvida)

A descoberta compartilha a proposta corrente por hash entre conversas (corrida
benigna em piloto/baixa concorrência; a janela `setSegment→simulate` é de ms e o
`offerCache` mitiga). Vira problema ao escalar multi-usuário. Mitigação real
depende de isolamento por device (fingerprint sintético) — não investigado;
fora do escopo desta decisão.

---

## Evolução (2026-06-28/07-01) — fechamento-via-B deixa de ser descartado

> `bloco-c-fechamento-trilho-b` (FIX-88/FIX-89). Design completo:
> `docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md`.

**A premissa que sustentava a Decisão 1 (item 1 acima) mudou:**

1. **O Trilho A está travado sem prazo.** A pendência AGX/`productId` (item
   "Consequências" acima) não tem ETA — reconfirmado ao vivo em 28/06. Esperar
   o A destravar pra fechar a jornada não é mais uma opção viável pro piloto.
2. **O piloto é single-user (ou baixíssima concorrência).** O risco
   "catastrófico no fechamento" (KYC/finalização de um usuário escrevendo na
   proposta de outro, por causa do hash único por device) é real em escala,
   mas **tolerável no piloto atual** — mesma lógica que já tolera o risco na
   descoberta (ver seção acima).

**Decisão revisada:** o Trilho B **também fecha** agora (não só descobre).
Descoberta e fechamento passam a ser a **MESMA proposta** (reuso automático —
o self-contract é stateful por hash: não criar proposta nova = continuar na
proposta ativa). O handoff B→A (`pickClosestOffer` + re-simular no A) **deixa
de ser o caminho principal** enquanto o A estiver travado — o `PROPOSAL_GATEWAY`
plugável (env `selfcontract` vs `bevi`) mantém os dois caminhos disponíveis: o
dia que o A destravar (`PENDENTE-KAIRO` original), volta a ser uma troca de
env, não um retrabalho de código.

**A dívida de concorrência multi-usuário (seção acima) permanece NÃO
resolvida** — segue valendo integralmente pro fechamento também (antes só
valia pra descoberta). Mitigação real (isolamento por device/fingerprint
sintético) continua fora do escopo; vira bloqueador de verdade quando o
piloto sair de single-user.
