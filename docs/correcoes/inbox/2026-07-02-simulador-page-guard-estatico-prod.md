# Simulador em prod: guard `notFound()` da página é inefetivo (prerender estático) — expõe UI quebrada

**Achado:** QA jornada auto WhatsApp (branch `qa/auto-whatsapp`), 2026-07-02, dirigindo prod (`https://ajaagora.com.br`).
**Severidade:** baixa/média — não vaza dado (as APIs bloqueiam corretamente com 404), mas expõe a shell da ferramenta interna + um "HTTP 404" cru pro admin em produção, passando impressão de app quebrada.

## Cenário exato

1. Logar em `/admin/login` (prod).
2. Navegar pra `/admin/simulator/whatsapp`.
3. A página **renderiza** o simulador (heading "Simulador — Cliente no WhatsApp", botão "Nova conversa", inbox).
4. O inbox mostra **"HTTP 404"** e "Nenhuma simulação ainda"; clicar "Nova conversa" não faz nada.

## Esperado × Atual

- **Esperado:** em prod, `/admin/simulator/*` deve dar 404 (a página tem `notFound()` guardado por `isSimulatorEnabled()` — `page.tsx:6`). O simulador é dev-only por design (`TB_ENV=production` → bloqueado, `env.ts:12`).
- **Atual:** a **página** é servida (200) com a UI do simulador; só as **APIs** dão 404.

## Causa-raiz (verificada)

A página `/admin/simulator/whatsapp` é um Server Component **prerenderizado estaticamente no build**. Evidência dos headers em prod:

```
GET /admin/simulator/whatsapp
x-nextjs-cache: HIT
x-nextjs-prerender: 1, 1
cache-control: s-maxage=31536000
status: 200 (HTML contém "Simulador")
```

O guard `if (!isSimulatorEnabled()) notFound()` roda **em build-time**, onde `TB_ENV` normalmente **não** é `production` → o guard passa e o HTML (com a UI) é congelado no build e servido do cache em runtime. As **API routes** (`/api/admin/simulator/*`) são dinâmicas → avaliam `isSimulatorEnabled()` em runtime com `TB_ENV=production` → 404 correto. Daí o descasamento página-viva × API-morta.

Confirmação de que **não** é build velho: `/api/chat/reset` (criado 2026-06-11) responde 200 em prod → prod tem código recente; o guard da página simplesmente não protege por ser estático.

## Onde provavelmente mexe

- `src/app/admin/(dashboard)/simulator/whatsapp/page.tsx` (e as irmãs `web`, `attendant`, `simulator/page.tsx`) — forçar avaliação em runtime: `export const dynamic = "force-dynamic";` (ou `revalidate = 0`) para o `notFound()` valer no request, não no build.
- Alternativa: mover o guard pro middleware (`src/middleware.ts`) cobrindo `/admin/simulator/:path*`.

## Evidência

`_evidencia/2026-07-02-simulador-whatsapp-prod-guard-estatico.png`

## Nota de contexto

O 404 do simulador em prod é **por design** (memória `project_aja_simulador_404_prod`; QA de canal WhatsApp roda em DEV/local). Este card **não** é sobre reabilitar o simulador em prod — é sobre o guard da página não bloquear como as APIs bloqueiam.
