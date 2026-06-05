---
id: FIX-10
titulo: "Upload de documento dispara 'Enviei meu documento' no 1º arquivo, sem esperar o verso"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 11bb56f
executado_em: 2026-06-05
---

# FIX-10 — Upload de documento dispara "Enviei meu documento" no 1º arquivo, sem esperar o verso

**Onde acontece:** Passo 5, artifact `document_upload` — card "Envie seu
documento (RG ou CNH)" / "Frente e verso. É opcional — você pode enviar
depois." com slots **RG/CNH — frente** e **RG/CNH — verso** + "Pular por
agora".

**O que acontece hoje (print):** Kairo subiu SÓ a frente da CNH → na hora,
o componente auto-enviou a mensagem **"Enviei meu documento"** e o bot já
começou a responder (typing) — sem dar chance de subir o verso. (No print:
slot frente com spinner, verso vazio, "Enviei meu documento" já postado.)

**Palavras do Kairo:** "aquele botão ali não pode responder exatamente
quando enviou o documento. Tem que ser uma dinâmica melhor, pra dar tempo
do cara, dar a oportunidade de preencher a frente e o verso."

**Direção do fix (decidir na execução):**
1. Upload de cada slot NÃO dispara mensagem ao agente — cada slot mostra
   estado próprio (✓ enviado).
2. "Enviei meu documento" só com ação EXPLÍCITA (botão "Pronto, enviei
   tudo") **ou** quando ambos os slots completarem.
3. Se o usuário concluir só com a frente, o agente pergunta gentilmente do
   verso (sem bloquear — docs são opcionais por contrato).
4. "Pular por agora" permanece como está.

**Regressão:** teste de componente (upload da frente → NENHUMA mensagem
auto-enviada; ambos os slots ou botão explícito → mensagem única) + E2E do
fluxo de upload.

---

*(próximas correções entram abaixo conforme o Kairo for apontando)*
