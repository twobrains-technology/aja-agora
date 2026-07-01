---
id: FIX-114
titulo: "PROD: search_groups dispara antes da identidade (IdentityNotCollectedError) + meta-narrativa"
status: done
commit: 97771ffc
executado_em: 2026-06-30
bloco: bloco-funil-turno-orquestracao
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/navigation.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-06-30 — teste do Kairo em PROD (AWS prod)
evidencia:
  - _evidencia/agente-meta-narrativa-search-groups-falha-print.png
---

## Palavras do operador
> "bug em prod la na aws prod, precisamos avaliar agora o bug"

## Cenário (PROD, persona Maria)
Após "Não, prefiro sem lance embutido", o agente cuspiu meta-narrativa empilhada
("Deixa eu buscar / Preciso primeiro buscar os grupos / Deixa eu usar a ferramenta
certa pra isso") e terminou com **"tô com uma dificuldade técnica pontual pra acessar
os grupos nessa faixa agora"** — a busca de grupos FALHOU em prod.

## Root cause CONFIRMADO (log de prod `/ecs/tb/prod`, conv `bc5fa852`)
```json
{"level":"error","source":"discovery","tool":"search_groups",
 "error_name":"IdentityNotCollectedError",
 "error_message":"Descoberta real exige CPF+celular coletados (gate identify do passo 2)..."}
```
**`search_groups` disparou ANTES do CPF+celular serem coletados.** O
`IdentityNotCollectedError` é uma **tripwire PROPOSITAL** do adapter
(`bevi-self-contract-adapter.ts:121`) que impede cair em mock — o adapter está
CERTO. O bug é de **ORQUESTRAÇÃO**: o funil chegou na descoberta sem a identidade
(gate identify pulado, OU a identidade coletada não chega ao `session.getIdentity()`
do adapter). ❌ NÃO é Duplicated Hash (esse caminho já é tratado, adapter linha 243).
Validado ao vivo: Trilho B (host) está no ar (segment-resource 200); o problema é a
ORDEM.

## Correção proposta
| O quê | Onde |
|---|---|
| **Gatear `search_groups`**: a tool não pode ser oferecida/executada até `identity` (CPF+celular) estar coletada e persistida. O funil coleta identidade ANTES da descoberta (D1: CPF antecipado no fim do passo 2) | `tool-policy.ts` / `qualify-state.ts` (nextGate) / `navigation.ts` |
| Se ainda assim faltar identidade quando a busca for necessária → **disparar o gate de identidade** (coletar CPF) e retomar a busca — NUNCA cuspir "dificuldade técnica" | `directives.ts` / handler do erro |
| Matar a **meta-narrativa** ("deixa eu buscar / preciso buscar os grupos / usar a ferramenta") — 1 frase natural ou nenhuma; nunca narrar o mecanismo | `system-prompt.ts` / `directives.ts` |

## Regressão exigida (3 camadas)
- **Camada 1 (structural):** tool-policy NÃO inclui `search_groups` em `active_tools`
  enquanto `identity` não coletada; o prompt não tem as frases de meta-narrativa.
- **Camada 2 (cassette):** fluxo que chega no lance sem identidade → NÃO dispara
  `search_groups` cru; dispara o gate de identidade OU já tem identity antes.
- **Integration:** `getIdentity()` null → search_groups não é chamado (ou o funil
  coleta antes).
