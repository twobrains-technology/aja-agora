---
id: FIX-432
titulo: "Sem telefone, sem número: o modelo deixa de receber valor de oferta antes do WhatsApp"
status: done
bloco: sem-telefone-sem-numero
commit: 93277d14
arquivos:
  - src/lib/agent/langgraph/nodes/converse.ts
  - src/lib/agent/langgraph/nodes/converse.desbloqueio.integration.test.ts
  - src/lib/agent/langgraph/testing/scripted-model.ts
  - src/lib/agent/langgraph/testing/scenario.ts
  - src/lib/agent/langgraph/cenario-ancora-muda-devolve-o-gate.test.ts
  - src/lib/agent/langgraph/cenario-faixa-so-reposiciona-com-oferta-vista.test.ts
  - src/lib/agent/langgraph/cenario-jornada-rute.test.ts
  - src/lib/agent/langgraph/cenario-nome-oferecido-chega-ao-banco.integration.test.ts
  - src/lib/agent/langgraph/cenario-parcela-manda-na-busca.test.ts
  - src/lib/agent/langgraph/cenario-tool-escolher-cota.fix-410.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "A questão é, ele não pode mostrar enquanto ele não falar o telefone." (Kairo, call 01/10 11:45:16)

## O que estava no ar (medido no código e em produção)
O hold da oferta valia só para o **artefato**; a **fala** do agente não passava por ele. E os números
entravam no **contexto** do modelo sem condição de braço/telefone (`converse.ts` nos blocos de oferta/tela
e no bind de tools), com as instruções dizendo que os cards "JÁ estão na tela". Em produção:

- `7b5082a1` (braço **A**, 02/10 10:55:35, antes do telefone das 10:59): *"Banco do Brasil… R$ 3.484 em
  197 meses…"*;
- o braço **B** mandava o cliente "olhar as parcelas" que estavam borradas (`db26cd54`).

## O que mudou
**D1 — a fonte deixa de ser a fala e passa a ser o contexto.** Com `leituraDoDesbloqueio(...).estado` ∈
{`pede-antes`, `borrado`} no canal web, o modelo **não recebe** carta, parcela, prazo, taxa, contemplações
nem lance da oferta.

1. `TOOLS_QUE_REVELAM_OFERTA` (12 tools de número) sai do `bindTools` enquanto o desbloqueio está pendente;
2. os blocos de contexto numérico (`blocoOfertas`, `blocoTela`, `blocoOpcoesNaTela`, `blocoEmbutido`,
   `blocoEscolha`, `blocoGrupoTrocado`, `blocoLance`, `blocoCartaMenor`, `blocoVazia`,
   `blocoChamarEscolherCota`) vão a `null`;
3. entra o bloco de **fato** `blocoOfertaAguardandoTelefone` — as opções já foram buscadas e só liberam
   quando o cliente informar o WhatsApp no card, e o modelo **não tem os valores agora** (é contexto, não
   fala; nenhuma frase nova fixa para o cliente);
4. `turnoDeApresentacao` cai para `false` — a âncora que dizia "os cards JÁ estão na tela" não roda nesse
   estado. Quando o telefone chega, o turno seguinte volta a receber tudo.
5. `contexto-da-tela.ts` **não** foi tocado: a supressão ficou no ponto de chamada do `converse`.

**Sem guard/regex sobre a fala** (anti-padrão do PRD/CLAUDE.md) — resolve-se no contexto.

### Correção de fixture (B1b — commit `d3aaafb8`)
O gate do B1 cobria só `langgraph/nodes/`; 11 casos dos `cenario-*` da **raiz** rodam `channel: "web"` sem
lead/identidade e passaram a ser tratados como `pede-antes`/`borrado` (comportamento correto). A causa é a
**fixture**: os cenários encenam o fluxo pós-telefone e a conversa precisa nascer `livre`. `runScenario`
ganhou `telefone?: string` e semeia `identityEnc` (PII falsa); 6 arquivos de cenário ajustados. Nenhuma
linha de produto mudou e nenhuma asserção de trajetória foi enfraquecida.

## Provado
- `pnpm -s vitest run src/lib/agent/langgraph/nodes/converse.desbloqueio.integration.test.ts src/lib/agent/langgraph/nodes`
  → **17 arquivos / 105 testes verdes** (braço A e B sem número/tools; controle com telefone).
- `pnpm -s vitest run src/lib/agent/langgraph` → **66 arquivos / 295 testes verdes** (após B1b).
- `pnpm -s typecheck` → **exit 0**.

## Fora do escopo (registrado)
- O dossiê cross-canal (`blocoDaPessoa`) não foi suprimido: são fatos de OUTRAS conversas da pessoa.
- `escolher_cota`, `check_proposal_status`, `suggest_handoff`, `save_contact_*` e `present_quick_reply`
  continuam no bind (nenhuma devolve/desenha número de oferta).