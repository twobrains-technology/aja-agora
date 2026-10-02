---
slug: b-demora-para-mostrar-as-ofertas-embacadas
titulo: "No braço B, as ofertas embaçadas demoram a aparecer — o cliente encara espera"
status: done
severidade: media
projeto: aja-agora
rodada: 2026-10-02 — call com a Bruna (01/10 11:38-12:01)
mexe_em:
  - src/lib/chat/ (fluxo do desbloqueio)
  - src/components/chat/artifacts/telefone-do-desbloqueio.tsx
---

## Palavras do operador
> "Esse é o B só tem que reduzir esse tempo." (Bruna, 11:44:38)
> "tem aquela lentidãozinha ali, dele comparar o grupo, não sei o que, sabe aquele cardzinho que fica pensando e trocando?
> Aquilo é batendo na DV. Então assim, nesse caso eu escolhi bater na DV primeiro para depois só desbloquear." (Kairo, 11:53:47)
> "Tá meio lento, né?" (Bruna, 11:49:25)

## Cenário
- **Rota/tela:** https://ajaagora.com.br/autos?variante=B → chat → valor do bem → busca
- **Passos:** 1) entrar com `?variante=B`; 2) pedir carro com parcela; 3) informar valor do bem; 4) clicar "Buscar opções"; 5) contar o tempo até aparecer o borrão
- **Dados usados:** valor de exemplo

## Esperado × Atual
- **Esperado:** no B, o borrão com "Suas opções já estão prontas" aparece logo — a busca roda antes/junto, não depois.
- **Atual:** o borrão espera a busca nas administradoras ("cardzinho que fica pensando e trocando").

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Ordem entre buscar e exibir o artefato no fluxo do chat no braço B. Não investigado a fundo.
