# Os 22 blocos de `converse.ts` — FATO × CONDUTA

Classificação feita em 17/10/2026, na fase 2 da campanha do motor-pi
(mandato em `docs/design/planos/2026-10-17-aja-pi-limpo-local-dev.md`).

O critério é o do `CLAUDE.md`: **invariante verificável vira código; conversa é do
modelo.** Então:

- **FATO** — o que o sistema SABE do turno, derivado do estado (números, o que está na
  tela, o que já foi entregue) ou um invariante que alguma coisa a jusante impõe
  (trava do telefone, tool gating, conta verificável). **Fica em código.**
- **CONDUTA** — como falar, o que priorizar, o que não repetir, como explicar.
  **Vai para a caixa** (`SYSTEM_PROMPT` em `src/lib/agent/system-prompt.ts` e, em
  produção, o prompt gerenciado `aja-system-prompt` no Langfuse — efeito ≤60s, sem
  deploy).

Fonte: `src/lib/agent/langgraph/nodes/converse.ts` (linhas em 17/10/2026, antes da
migração).

| # | bloco | linha | veredito | por quê |
|---|---|---|---|---|
| 1 | `blocoEmbutido` | 651 | **FATO** | números calculados + a regra do embutido (sai da própria carta) é invariante |
| 2 | `blocoOfertaAguardandoTelefone` | 684 | **FATO/INVARIANTE** | espelho da trava `TOOLS_QUE_REVELAM_OFERTA`; o mandato proíbe migrar |
| 3 | `blocoPessoa` | 761 | **FATO** | dossiê cross-canal |
| 4 | `blocoTela` | 767 | **FATO** | o que está na tela agora |
| 5 | `blocoJaRespondido` | 771 | **FATO** | o que já foi respondido |
| 6 | `blocoAbandono` | 785 | **FATO** | bem anterior vs. atual |
| 7 | `blocoVazia` | 793 | **FATO** | busca voltou vazia |
| 8 | `blocoOpcoesNaTela` | 807 | **FATO** | lista de ofertas exibidas |
| 9 | `blocoChamarEscolherCota` | 818 | **FATO** | o ancoramento da cota é tool + anti-erro de contratação |
| 10 | `blocoEscolha` | 856 | **FATO** | a escolha está no estado, com números |
| 11 | `blocoGrupoTrocado` | 875 | **FATO** | o grupo mudou; número novo |
| 12 | `blocoLance` | 884 | **FATO** | números do lance vs. médio |
| 13 | `blocoOfertas` | 927 | **FATO** | números reais; o "proibido dizer só um instante" é invariante de não prometer |
| 14 | `blocoNovato` | 963 | **CONDUTA** ✅ migrado | como explicar consórcio a quem é de primeira vez |
| 15 | `blocoCanal` | 981 | **CONDUTA** ✅ migrado | como escrever em cada canal (sem tela no WhatsApp, formulário na web) |
| 16 | `blocoFormularioAberto` | 1019 | **FATO** | formulário pendente na tela |
| 17 | `blocoBuscaVazia` | 1040 | **FATO** | busca tentada e sem oferta |
| 18 | `blocoCartaMenor` | 1061 | **FATO** | conta verificável (o comentário já dizia: "a conta é verificável → código") |
| 19 | `blocoIdentidade` | 1078 | **FATO** | nome e dados já registrados |
| 20 | `blocoFechamento` | 1183 | **CONDUTA** ✅ migrado | o que não repetir depois do fecho |
| 21 | `blocoRetomadaPosFechamento` | 1198 | **CONDUTA** ✅ migrado | como retomar quando o cliente volta (helper `resumeAfterCloseSection`) |
| 22 | `conducaoDoTurno` / reveal | 1146/1199 | **CONDUTA** ✅ (reveal migrado) | como conduzir o turno e a apresentação das opções |

**Migrados:** 14, 15, 20, 21 e 22 (reveal). Ou seja: **toda a conduta identificada já
saiu de `converse.ts`**. O mecanismo é `src/lib/agent/box/situacoes.ts` (fato) + seção
"Situações do turno" na caixa (conduta), e o guard `situacoes.test.ts` recusa conduta
que volte para o código.

**Não migram, por decisão:** 2 (trava do telefone) e 9 (ancoramento de cota), e o
número em si de 1, 10-13 e 18 — são o que a administradora e o contrato exigem, não
estilo.