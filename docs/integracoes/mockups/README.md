# Mockups — Jornada do cliente com a integração Bevi

Duas propostas de jornada **end-to-end** que combinam o produto atual do Aja Agora
(agente conversacional + artifacts) com as **ofertas reais** que a integração Bevi/AGX
destrava. São protótipos HTML standalone (abra no browser) — não código de produção.

| Arquivo | Canal | O que mostra |
|---|---|---|
| [**jornada-web.html**](./jornada-web.html) | Chat da plataforma (web) | Jornada completa com os artifacts reais (welcome, gates em chips, value picker, simulação, comparação, recomendação com score, opt-in). Design fiel: Geist, neutro preto/branco. |
| [**jornada-whatsapp.html**](./jornada-whatsapp.html) | WhatsApp (nativo Meta) | Mesma jornada em componentes nativos — reply buttons, list message e **WhatsApp Flows** — com a única saída externa (upload de doc → CONEXIA) explícita. |

## A tese de UX: *exploração anônima → oferta real on-demand*

O conflito central da integração: a Bevi é **proposta-first** (exige CPF antes de simular),
o Aja prega **"sem formulário"**. A jornada resolve isso transformando o atrito do CPF num
**momento de upgrade**:

1. **Exploração anônima** — o usuário passa pela descoberta, pelos 3 gates obrigatórios
   (experience → timeframe → lance) e vê uma **simulação indicativa** (médias de mercado),
   sem pedir nada. Preserva o "sem formulário".
2. **Oferta real on-demand** — só no pico de intenção ("quero ver as reais") o Aja pede o
   **CPF uma única vez**, enquadrado como destravar *as cartas reais das administradoras*.
   Aí entra a Bevi → ofertas reais (Âncora/BB/Itaú, IPCA/IGPM, lance embutido). Respeita o
   "proposta-first" da Bevi no fechamento.
3. **Fechamento** — recomendação real → interesse → KYC. No web, opt-in pra continuar no
   WhatsApp. No WhatsApp, KYC textual inline via Flow, com o **upload de documento** como
   único redirect honesto (`conexia.agxsoftware.com`).

## Decisões de fidelidade

- **Design real**, não genérico: tokens do `globals.css` (Geist + Geist Mono, paleta neutra
  oklch, raio 10px, accent azul discreto — **sem roxo**), bolhas reais (usuário preto à
  direita, consultora cinza à esquerda com avatar), e o catálogo real de artifacts.
- **Diálogo real**: frases canônicas do `system-prompt.ts` ("Aqui é a Helena…", "Prazer,
  Lucas.", "Bora montar seu plano!") e a sequência obrigatória nome → 3 gates → value picker
  → cards → recomendação → opt-in.
- **Dados reais da Bevi**: ofertas de Auto a ~R$ 50k capturadas na engenharia reversa
  (Âncora R$ 703,64 · BB R$ 728,41 · Itaú R$ 1.009,36), com índice e taxa por administradora.
  Ver [`../bevi-segmentos-comparativo.md`](../bevi-segmentos-comparativo.md).
- **WhatsApp realista**: respeita limites nativos (reply buttons ≤ 3; list message; Flows
  como bottom-sheet) e a paleta oficial. A melhoria proposta sobre o canal atual é usar
  **Flows** pra trazer simulação/CPF/KYC pra dentro do chat — eliminando o redirect que o
  trilho "API de Parceiro" da Bevi faz no `choose_offer`.

## Embasamento (pesquisa UX)

- WhatsApp Flows mantêm o usuário no chat, sem redirect — [Infobip](https://www.infobip.com/blog/whatsapp-flows), [Meta Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows).
- Generative UI / conversational como input primário em 2026 — [UXPin](https://www.uxpin.com/studio/blog/ui-ux-design-trends/).
- Tom = feature ("steady advisor"), cards escaneáveis em fintech — [UXDA](https://theuxda.com/blog/ux-case-study-applying-chatgpt-user-experience-banking).

---
*Protótipos gerados em 2026-05-27. Sem PII (CPF mascarado). Abra os `.html` direto no browser.*
