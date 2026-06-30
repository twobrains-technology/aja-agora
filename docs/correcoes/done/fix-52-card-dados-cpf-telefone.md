---
id: FIX-52
titulo: "Card de dados não dispara com CPF+telefone juntos; agente cai em fallback proibido (atualiza página + meta-narrativa do mecanismo)"
status: done
bloco: bloco-a-funil-coleta-ordem
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/leads/contact-capture.ts
  - src/lib/leads/phone.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
commit: 2138f1b1
executado_em: 2026-06-26
---

# FIX-52 — Card de coleta de dados não aparece + agente empurra "atualiza a página"

## Palavras do operador (docx)
> "Melhor perguntar separado o CPF e o telefone.. se coloca tudo na mesma linha não entende — **não aparece o card para completar os dados**."

## Cenário exato (image4 do docx — transcrição literal do chat)
1. Agente: "Paulo, por segurança o sistema coleta CPF e celular pelo formulário próprio — não consigo processar por aqui no chat. Preenche no campo que vai aparecer pra você, e a gente segue direto pras opções!"
2. Usuário (uma única mensagem): **"CPF 162.907.628-77 celular 011 99991-4131"**
3. Agente: "Paulo, entendo a insistência — mas por proteção dos seus dados (LGPD), não posso processar CPF pelo chat. O formulário seguro vai aparecer pra você preencher. **Se não estiver aparecendo, tenta atualizar a página** e me chama de volta que a gente continua de onde parou! Boa! E qual valor aproximado você pensa em dar de lance?"
4. Usuário: "me mande o formulário"
5. Agente: "**Infelizmente não consigo disparar o formulário manualmente por aqui** — ele aparece automaticamente no fluxo. **Tenta atualizar a página** e, quando voltar, é só continuar de onde a gente parou. Se o problema persistir, me fala que a gente acha outro caminho!"

Há **três defeitos** nesta tela:
- **(a) O card/artifact de coleta de dados NÃO dispara** quando o usuário manda CPF+celular na mesma mensagem (o agente promete o card mas ele nunca aparece).
- **(b) Fallback PROIBIDO:** o agente manda o cliente **"atualizar a página"** — viola a regra anti-solução-manual do Kairo (o produto está empurrando trabalho manual pro usuário). Nenhuma resposta do agente pode mandar dar refresh/reabrir/repetir passo manual.
- **(c) Meta-narrativa do mecanismo:** "não consigo disparar o formulário manualmente", "ele aparece automaticamente no fluxo" — o agente expõe a tubulação interna. Proibido (CLAUDE.md → "meta-narrativa do mecanismo", "alucinação de UI").

## Root cause investigado (provado nos Explores)
- `src/lib/agent/tools/ai-sdk.ts:541-553` — tool `present_contract_form` (apresenta o card CPF+celular+LGPD). `inputSchema` só tem `administradora?` — não há nada que oriente pedir um campo por vez nem parsear texto livre.
- `src/lib/leads/contact-capture.ts:125-160` — `saveContactWhatsapp` espera **só telefone** (`normalizePhoneBR`); não há parser que detecte CPF+telefone numa mesma string. Quando os dois vêm juntos, nenhuma validação casa e o fluxo não avança → o card não é re-disparado.
- `src/lib/agent/system-prompt.ts` — o prompt instrui o agente a verbalizar o mecanismo ("o sistema coleta pelo formulário próprio", "não consigo processar por aqui") e contém/admite o fallback "atualizar a página". Origem dos defeitos (b) e (c).

## Correção proposta
| O quê | Onde |
|---|---|
| Garantir que o card de dados (`present_contract_form`) seja efetivamente disparado quando o usuário sinaliza intenção de fornecer dados — inclusive quando manda CPF+telefone juntos. Não depender do parsing do texto livre pra "avançar"; o card é a UI canônica de coleta. | `ai-sdk.ts` (`present_contract_form`), `system-prompt.ts` (regra de disparo do card) |
| Pedir **CPF e telefone separados** (um por vez) na orientação ao usuário, OU parsear corretamente os dois quando vierem juntos e seguir. Decidir no brainstorming: o pedido do operador é "perguntar separado". | `system-prompt.ts` + `contact-capture.ts`/`phone.ts` (parser opcional) |
| **REMOVER** do prompt qualquer instrução de "atualizar a página", "reabrir", "me chama de volta", "continua de onde parou" como solução a um card que não aparece. Substituir por caminho que mantém o usuário no fluxo. | `system-prompt.ts` |
| **REMOVER** meta-narrativa: o agente nunca explica que "o sistema coleta pelo formulário", "não consigo disparar manualmente", "aparece automaticamente no fluxo". Pede os dados naturalmente; o card aparece como parte da conversa. | `system-prompt.ts` |

## Regressão exigida (3 camadas — CLAUDE.md)
- **Camada 1 (structural):** assert que o system-prompt NÃO contém "atualizar a página"/"atualize a página"/"reabra"/"aparece automaticamente"/"não consigo disparar"; assert que existe regra de disparo do card de dados; `present_contract_form` em `active_tools`. Arquivo: `src/lib/agent/system-prompt.<fix52>.test.ts`.
- **Camada 2 (cassette):** novo `describe` em `tests/regression/agent-trajectory.test.ts` — stream determinístico do turno em que o usuário manda "CPF ... celular ..." junto; detector falha se o texto do agente contém "atualizar a página"/meta-narrativa, e verifica que o card de dados é disparado (tool-call `present_contract_form`).
- **Camada 3 (nightly):** cenário Helena/Paulo fornecendo CPF+telefone — assert estrutural de ausência de frases proibidas. (opcional, append em `tests/eval/agent-flow.eval.test.ts`)
