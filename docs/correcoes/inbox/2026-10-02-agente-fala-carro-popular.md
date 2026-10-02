---
slug: agente-fala-carro-popular
titulo: "O agente fala 'carro popular' — a taxonomia combinada é novo e seminovo"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-10-02 — call com a Bruna (01/10 11:38-12:01)
mexe_em:
  - prompt/diretriz do agente (texto entra por cadastro/prompt, nunca fixo no servidor)
---

## Palavras do operador
> "Como a gente não tem nenhuma correção da IA para alguns termos aí, ela usa o que ela... Tá na cabeça dela lá." (Kairo, 11:51:48)
> "É, um carro não. A gente tem que tirar isso aqui. O Cairo, deixar só põe um carro novo, põe novo e seminovo, né?" (Bruna, 11:52:15)
> "É, esse a gente tem que arrumar, esse rolê aqui." (Bruna, 11:52:03)

## Cenário
- **Rota/tela:** chat do site (qualquer categoria auto)
- **Passos:** 1) pedir carro; 2) ler a resposta de enquadramento da categoria
- **Dados usados:** -

## Esperado × Atual
- **Esperado:** o agente só usa **"carro novo"** e **"seminovo"**; "popular"/"carro popular novo" nunca aparece.
- **Atual:** apareceu "carro popular" (e "semi-novo" grafado errado).

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Não existe glossário/correção de termos no caminho do agente. O dono quer que a correção entre por **cadastro/prompt**
(nunca texto fixo no servidor). Falta decidir onde esse vocabulário vive e como é lido.
