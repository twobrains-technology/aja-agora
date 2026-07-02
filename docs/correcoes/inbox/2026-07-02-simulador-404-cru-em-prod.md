---
slug: simulador-404-cru-em-prod
data: 2026-07-02
tipo: melhoria
severidade: baixa
canal: admin
origem: QA dono-produto (imóvel × WhatsApp, prod)
---

# Simulador em prod mostra "HTTP 404" cru em vez de estado "indisponível neste ambiente"

## Palavras do teste
Abri `/admin/simulator/whatsapp` em produção (`ajaagora.com.br`) pra rodar a jornada de
imóvel. O inbox lateral mostrou o texto cru **"HTTP 404"** e "Nenhuma simulação ainda.
Clique em Nova conversa pra começar." — clicar "Nova conversa" também falha com 404.
A tela parece quebrada, quando na verdade o simulador é intencionalmente desabilitado
em produção.

## Cenário exato
1. Logar em `/admin/login` (prod, admin@ajaagora.com.br).
2. Ir em `/admin/simulator/whatsapp`.
3. Observar o inbox: badge "HTTP 404".
4. Clicar "Nova conversa" → segundo 404, nenhum feedback claro.

## Esperado × Atual
- **Esperado:** como `isSimulatorEnabled()` é `false` em prod (por design), a UI deveria
  comunicar explicitamente "Simulador disponível apenas em ambientes de desenvolvimento"
  e desabilitar/ocultar o "Nova conversa" — sem parecer bug.
- **Atual:** despeja o status HTTP cru ("HTTP 404") e mantém o botão ativo, que erra de novo.

## Evidência
`docs/correcoes/inbox/_evidencia/qa-imovel-whatsapp/prod-simulator-http404.png`
Console prod: `404 @ /api/admin/simulator/sessions?channel=whatsapp`.

## Onde provavelmente mexe
- `src/components/admin/simulator/inbox.tsx:57-59` — o `catch` seta `error` com o
  `HTTP ${status}` cru. Poderia tratar 404 como "ambiente sem simulador" e renderizar
  estado dedicado (e a página `/admin/simulator/*` poderia gate no client via um
  `GET` de capability ou via `TB_ENV` exposto).
- `src/lib/utils/env.ts:12-16` — fonte do gate (não mexer; é o comportamento correto).

## Classificação
MELHORIA de UX (admin/dev tool), severidade baixa. O 404 em si é **não-bug** (decisão de
arquitetura: simulador não vai a prod). O que melhora é a comunicação do estado.
Não implementar sem aval — decisão de produto.
