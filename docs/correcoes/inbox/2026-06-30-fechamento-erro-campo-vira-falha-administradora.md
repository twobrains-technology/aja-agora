---
slug: fechamento-erro-campo-vira-falha-administradora
titulo: "Erro de validação de campo (CPF/CELULAR inválido) no fechamento vira 'problema com a administradora' + loop de retry"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-30 — avaliação de bug em prod (fechamento passo 5, Trilho A)
evidencia:
  - _evidencia/fechamento-erro-validacao-campo-log-prod.txt
mexe_em:
  - src/app/api/chat/route.ts                       # catch genérico do contract-submit (~642-659)
  - src/lib/adapters/bevi/bevi-errors.ts            # toBeviError não tipa erro de campo CPF/CELULAR
  - src/components/chat/artifacts/contract-form.tsx # validação só length>=10 (linha ~50)
  - src/components/chat/artifacts/gate-identity-form.tsx # mesmo furo de validação (linha ~45)
  - src/lib/whatsapp/contract-capture.ts            # mesma copy genérica no canal WhatsApp (~208)
---

## Palavras do operador
> "avalie o problema agora em prod prod por favor" — (com print do chat: após "Enviei
> meus dados pra contratar", o agente responde "Tive um problema ao falar com a
> administradora agora. Pode tentar de novo em instantes?")

## Cenário
- **Rota/tela:** chat web, passo 5 (fechamento) — card "Vamos fechar sua proposta" (Administradora: ÂNCORA)
- **Passos:** 1) usuário chega no fechamento 2) preenche/confirma CPF + celular no `contract_form`
  3) marca LGPD e clica "Continuar com segurança" 4) agente responde "Tive um problema ao falar
  com a administradora agora. Pode tentar de novo em instantes?"
- **Dados usados:** CPF `092.•••.•••-60`, celular `(62) 89898-9898` (11 díg, mas nono dígito ≠ 9 →
  não é celular BR válido; parece número de teste). Conversa prod `24be5b9d-8541-4363-a173-f3670bde35a1`.

## Esperado × Atual
- **Esperado:** dado de campo inválido → mensagem HONESTA e acionável ("seu celular parece
  inválido, confere?") + reabrir o campo pro usuário corrigir. Idealmente o formulário nem deixa
  enviar um celular inválido (bloqueia no client antes de chamar a Bevi).
- **Atual:** a Bevi (insert_proposal) rejeita com 400 `errors:[{field:'CELULAR', message:'CELULAR
  inválido.'}]`; o `route.ts` cai no catch GENÉRICO → "Tive um problema ao falar com a
  administradora agora. Pode tentar de novo em instantes?" + seta `contractRetryPending:true`.
  Mentira dupla: (a) não é a administradora, é o dado do usuário; (b) "tentar de novo" com o mesmo
  celular falha SEMPRE (400 determinístico, não transitório) → loop.

## Pista de causa (A CONFIRMAR — não investigado a fundo, mas evidência de prod é forte)
Dois defeitos NOSSOS (não é Bevi caída nem Trilho A quebrado — ele funcionou e rejeitou):
1. **Validação client fraca:** `contract-form.tsx:~50` usa `phoneDigits.length >= 10` (só
   comprimento), deixa passar `89898-9898`. Mesmo furo em `gate-identity-form.tsx:~45`. Já existe
   `isValidPhone()` em `whatsapp-optin.tsx:32` e `normalizePhoneBR()` — não são reusados aqui.
2. **Tradução de erro:** `toBeviError()` (bevi-errors.ts) tipa MinCreditError/ProposalOwnership/
   Ongoing, mas NÃO tipa erro de campo `CPF`/`CELULAR inválido` → escapa pro `BeviApiError`
   genérico → `route.ts:~642-659` mostra "problema com a administradora" + marca retry.
   Corrigir: tipar o field error e, no route, mensagem honesta + reabrir campo em vez de retry.
   Verificar também o espelho no WhatsApp (`contract-capture.ts:~208`).
Regra de regressão de agent (3 camadas) se aplica: o texto do agente muda no fix.
