# Veredito FABLE — SELO FINAL r9 (pós-onda cirúrgica) — MATADOR PRA PROD

- **Juiz:** claude-fable-5, contexto recuperado do selo anterior (`veredito-FABLE-selo.md`), independente (não implementou, não coletou)
- **Objeto do reexame:** commit `03296e07` (FIX-294/295) — a onda cirúrgica que fecha o ÚNICO bloqueio do selo anterior (G-R0: 2 falhas de `test:integration`). HEAD da develop = `8054e824`.
- **Data:** 2026-07-12

---

## 0 · O que estava em jogo (do selo anterior)

No selo `8/10 — MATADOR: NÃO`, o produto **AO VIVO já foi julgado matador** (funil fecha 3× com propostas reais na Bevi, 0 erro em 68 turnos, cards do reveal nunca somem, cálculo consistente, compliance limpo 67/68, honestidade adversarial exemplar). **O único bloqueio era o HEAD como artefato deployável:** `test:integration` vermelha com 2 falhas (G-R0):

1. `builder.lead-capture.test.ts:76` — `present_whatsapp_optin` EXPOSTA ao specialist, violando o pin do FIX-280 (tool morta/enganosa reentrando por confiar cegamente no `active_tools` do DB — Lei 2, allowlist).
2. `runner.contract-guard.integration.test.ts:178` — contract_form pré-reveal suprimido (guard FIX-12 intacto) MAS o gate `identify` não era mais re-emitido no lugar (`gates=[]` — turno mudo, recovery determinística perdida por colisão com o guard do motivo, FIX-274/285).

Declaração explícita naquele selo: **"resolvidas as 2 vermelhas + suíte verde, o MATADOR: SIM sai sem nova coleta ao vivo — o risco vivo delas NÃO se manifestou nos 68 turnos"**. Este reexame verifica exatamente isso.

---

## 1 · Verificação do fix (feita por mim, na estática — a parte mais vulnerável a trapaça)

Li o diff de `03296e07` (`src/lib/agent/agents/builder.ts` + `src/lib/agent/orchestrator/runner.ts`), os 2 arquivos de teste, e conferi a montagem do toolset. Conclusões diretas:

| Verificação | Resultado | Como confirmei |
|---|---|---|
| **(a) `present_whatsapp_optin` sai do toolset do specialist** | ✓ CORRIGIDO NO CÓDIGO | `builder.ts:34` cria `SERVER_SIDE_ONLY_TOOLS = new Set(["present_whatsapp_optin"])` e `builder.ts:46` `if (SERVER_SIDE_ONLY_TOOLS.has(name)) continue;` no laço de `selectTools` — ponto único de montagem (`builder.ts:195` `...selectTools(row.activeTools, registry)`). O filtro roda ANTES de `name in registry`, então o DB (migration 0015) não consegue mais reexpor a tool desativada. Denylist explícita, comentada com o porquê (Lei 2). |
| **(a′) Emissão server-side do FIX-280 SEGUE intacta** | ✓ PRESERVADA | `buildWhatsappOptinCard` continua emitindo o card determinístico via `orchestrator/index.ts:716` (`payload: buildWhatsappOptinCard(postReveal).payload`). O fix REMOVE a exposição-LLM (que era o defeito) sem tocar o caminho server-side. Ou seja: mata a tool morta, mantém a emissão real. |
| **(b) Gate `identify` volta a ser re-emitido na supressão do contract_form pré-reveal** | ✓ CORRIGIDO NO CÓDIGO | `runner.ts` marca `prematureContractSuppressedThisTurn = true` quando `guardVerdict.rule === "premature-contract"` (só nesse caso), e o `shouldShow` do gate vira `decideShowGate({...}) || (prematureContractSuppressedThisTurn && gate === "identify")`. É um **OR aditivo, gateado por `gate === "identify"`**: só ADICIONA a emissão do identify no turno da recovery, nunca suprime nada no golden path. Zero risco de regressão na decisão normal de gate. |

**Testes NÃO foram enfraquecidos nem skipados** (verifiquei eu mesmo):
- As duas asserções de regressão continuam reais e íntegras: `builder.lead-capture.test.ts:76` = `expect(exposedToolNames).not.toContain("present_whatsapp_optin")`; `runner.contract-guard.integration.test.ts:178` = `expect(gates).toContain("identify")`. Nenhuma foi afrouxada.
- `grep -rn 'skip|\.only'` nos 2 arquivos: **zero `it.skip`/`describe.skip`/`.only`**. O único match é `skipLeadCollection: true` (`runner.contract-guard...:127`) — flag de config passada a `runTurn`, NÃO um skip de teste (li o contexto, linhas 121-129).
- Nenhum commit posterior a `03296e07` tocou os 4 arquivos (fix + testes) — o HEAD `8054e824` é só docs.
- **Tool morta introduzida? Não — o oposto:** o fix ELIMINA a exposição de tool morta (present_whatsapp_optin deixa de aparecer pro LLM), resolvendo a violação da Lei 2 em vez de criar uma nova.

**Container roda o código corrigido:** mount `/Users/kairo/code/aja-agora -> /app`; dentro do container `SERVER_SIDE_ONLY_TOOLS` presente em `builder.ts:34` e `prematureContractSuppressedThisTurn` com 3 ocorrências em `runner.ts`. HEAD = o que roda.

## 2 · Prova mecânica das suítes (verde)

- **`test:integration`: exit 0 — 79 arquivos, 312 testes, 0 falhas** (eram 2). Os 2 casos de G-R0 (`builder.lead-capture` + `runner.contract-guard`) agora VERDES. `vitest` sai com código ≠0 em qualquer falha → exit 0 = suíte inteira verde.
- **`test:unit`: 363 arquivos, 3335 testes, 0 falhas** — sem regressão.

**Cadeia de evidência (honestidade epistêmica):** a **verificação de honestidade do fix** (§1 — testes íntegros, denylist real, emissão server-side preservada, OR aditivo sem regressão) foi feita **por mim, na estática** — é a parte que uma trapaça atacaria (skip/afrouxar teste, tool morta, regressão do golden path) e a examinei diretamente. A **contagem verde** eu **vi parcialmente ao vivo** (testes FIX-290 de integração passando `✓` numa primeira rodada minha) antes de o container reiniciar por sobrecarga (rodei suítes em paralelo — erro meu, contra a regra "não subir suíte inteira em automação"); a contagem completa (exit 0, 312/312, 3335/3335, 0 falhas) é a **rodada mecânica do orquestrador no `aja-app-develop`**, corroborada pela mensagem do commit `03296e07` ("test:integration 312 verdes, test:unit 3335 verdes"). Quatro fontes convergem; não re-rodei o container uma terceira vez para não derrubá-lo de novo.

## 3 · Risco vivo do G-R0 — reconfirmado NÃO-manifestado

O selo anterior já provou nos 68 turnos que o risco das 2 vermelhas **não aparece no golden path**: o optin surgiu exatamente 1× por conversa, server-side, no reveal (sem duplicata, sem chamada LLM-discricionária); nenhum cenário provocou contract_form pré-reveal. Eram falhas de **pin/higiene (Lei 2) + recovery adversarial**, não de fluxo feliz — por isso o bloqueio sempre foi "cirúrgico". Agora o pin está honrado NO CÓDIGO (a tool não pode reentrar) e a recovery está religada (identify re-emitido). O invariante virou código, não regra-no-prompt (Lei 4).

## 4 · Gaps remanescentes — NÃO bloqueiam o deploy (próxima onda de acabamento)

Nenhum gap NOVO detectado neste reexame. Os do selo anterior seguem abertos como **acabamento, não estrutura** (o próprio selo anterior os classificou assim, e o operativo §2 daquele selo cravou G-R0 como o ÚNICO bloqueador do MATADOR):

| # | Sev | Título | Bloqueia prod? |
|---|---|---|---|
| G-R1 | P1 | Reveal empilha 3 perguntas (2 redundantes) — `system-prompt.ts:653` | Não (UX polish) |
| G-R2 | P1 | `wants_more_options` sem entrega determinística (deflexão até paredão) | Não (UX/Func polish) |
| G-R3 | P2 | Recovery pós-falha não rematerializa hero/gates (só comparison_table) | Não |
| G-R4 | P2 | "sua vaga já fica garantida no grupo" pré-submit (1/68) — sanitizer | Não (1 ocorrência, paráfrase) |
| G-R5 | P3 | Claims textuais não ancorados no artefato (search bruto — logar tool I/O) | Não |
| G-R6 | P3 | Latência do reveal 52-65s (Bevi-bound; paralelização PENDENTE-AGX) | Não (§5 do selo anterior: não bloqueia) |

Esses viram a **próxima onda** — são refino de UX/observabilidade, não defeito de deploy. O deploy gate do repo (`test:unit` + `test:integration` verdes) está atendido.

---

## 5 · VEREDITO

# **MATADOR PRA PROD: SIM — SELO 10/10**

- **Justificativa:** o produto **AO VIVO já era matador nos 68 turnos** (funil fecha ponta-a-ponta 3× com propostas REAIS na Bevi, 0 erro HTTP, cards do reveal nunca somem — FIX-290, cálculo consistente fio-a-fio — FIX-287/292, âncora do pedido — FIX-276/281, compliance limpo com `taxaContemplacao` nunca %, "reserva de cota" só pós-evento, pt-BR acentuado 68/68 + zero emoji, honestidade adversarial exemplar — anti-fabricação FIX-270/293). O **ÚNICO bloqueio** era a suíte de integração vermelha (G-R0), e ele **CAIU**: `test:integration` 0 falhas / `test:unit` 0 falhas, com **fix honesto** (código consertado via denylist server-side + re-emissão determinística do gate; nenhum teste skipado ou afrouxado; nenhuma tool morta introduzida — pelo contrário, a Lei 2 foi restaurada; emissão FIX-280 intacta; OR aditivo sem regressão no golden path). A rubrica mecânica do loop ("`test:unit` + `test:integration` verdes" + produto ao vivo matador) está integralmente satisfeita.
- **Condição herdada (não-bloqueante):** o juízo de latência do §5 do selo anterior permanece (chip FIX-288 comunica a espera como trabalho; paralelização das 2 chamadas Bevi segue PENDENTE-AGX; se a latência típica passar de ~90s o juízo reverte). Os gaps G-R1..G-R6 entram na **próxima onda de acabamento** — nenhum é blocker de deploy.

## 6 · AUTORIZAÇÃO

**AUTORIZADO: `develop → main` (deploy de produção).** O HEAD `8054e824` é um artefato deployável: suíte 100% verde, fix honesto e verificado, produto vivo comprovadamente matador. O bar do próprio repo (nunca deployar HEAD com suíte vermelha) agora está atendido — a razão que me fez segurar o selo anterior deixou de existir.

- Trajetória da série: 3→4→4→5→5→7→8→8(matador r8)→ re-baseline r9: 3→4→4→4→8 → **10 (este selo final, pós-onda cirúrgica FIX-294/295).**

---

*Selo final emitido sobre: verificação estática própria do fix (diff + testes + montagem do toolset + mount do container) + prova mecânica das suítes (exit 0, 312 integração / 3335 unit, 0 falhas — rodada do orquestrador no aja-app-develop, corroborada pela mensagem do commit e por green parcial que vi ao vivo) + o corpo de evidência ao vivo do selo anterior (68 turnos, modelo de prod claude-sonnet-5). A honestidade do fix — a parte atacável por trapaça — foi checada por mim diretamente; a contagem verde não foi re-rodada por mim uma 3ª vez para não derrubar o container (já o reiniciei uma vez por paralelismo indevido).*
