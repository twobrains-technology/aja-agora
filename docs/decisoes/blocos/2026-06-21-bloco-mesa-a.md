---
data: 2026-06-21
bloco: bloco-mesa-a-cadastros
escopo: FIX-61 (Administradora) + FIX-62 (Docs PDF: storage + extração) + FIX-63 (Atendente de mesa)
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2 / modo autônomo)
---

# ADR — Decisões de design do Bloco Mesa-A (backoffice de cadastros)

Spec de negócio: `docs/visao/mesa-de-operacao.md`. O schema das 5 tabelas mesa já estava
na base (migration `0026_mesa_operacao.sql`). Este bloco constrói só os **cadastros admin**
das 3 entidades de operação + storage/extração de PDF. Decisões tomadas com o raciocínio da
skill `brainstorming` (explorar contexto, levantar opções, pesar trade-offs, YAGNI), mas o
executor é o decisor: sem perguntas, best practice + padrões do repo + regras de produto.

---

## Decisão 1 (FIX-62) — Lib de extração de texto de PDF: **`unpdf`**

**Escolhida: `unpdf`.** Alternativas: `pdf-parse`, `pdfjs-dist` direto.

- `unpdf` é um wrapper serverless-first sobre o build moderno do `pdfjs` — **zero
  dependências nativas** (não compila nada, não baixa binário), runtime-agnóstico
  (Node/edge/worker), mantido ativamente. API mínima: `extractText(await getDocumentProxy(uint8))`.
- `pdf-parse` é antigo e carrega uma armadilha conhecida: em algumas versões o `index.js`
  tenta abrir um PDF de teste no `require`, quebrando em ambiente sem esse arquivo. Custo de
  manutenção maior, sem ganho.
- `pdfjs-dist` direto resolveria, mas reimplementaria exatamente o que o `unpdf` encapsula
  (carregar o build legacy/serverless certo, montar o proxy do documento, concatenar páginas).
  YAGNI.

Encapsulado em `src/lib/pdf/extract.ts` (`extractPdfText(bytes): Promise<string>`), de modo que
trocar a lib no futuro não vaza pra rota nem pro copiloto (bloco C consome só `texto_extraido`
no DB). Extração que falha **não derruba o upload** — o doc grava com `textoExtraido` nulo e a
extração pode ser re-tentada (campo é nullable no schema, intencional).

## Decisão 2 (FIX-62) — Client de storage: **`@aws-sdk/client-s3` (S3-compatível)**

**Escolhida: `@aws-sdk/client-s3` com `forcePathStyle` + `endpoint` custom.** Alternativas:
SDK `minio`, client SigV4 manual.

- É o caminho canônico S3-compat: o **mesmo** código fala com MinIO local (via `S3_ENDPOINT`
  + `forcePathStyle: true`) e com S3/qualquer compatível em prod (sem endpoint → AWS default).
  Casa com o constraint do projeto "Adapter Pattern / trocar mock por real sem reescrever".
- SDK `minio` amarraria a API ao MinIO (lock-in conceitual), justo o oposto do objetivo de
  abstrair a fonte.
- SigV4 na mão é reinventar a roda com superfície de bug em assinatura — descartado.

Encapsulado em `src/lib/storage/` com uma interface fina (`putObject`/`getObject`/`deleteObject`
/`ensureBucket`) e config por env. Config:

| Env | Default | Uso |
|---|---|---|
| `S3_ENDPOINT` | — (vazio = AWS real) | endpoint do MinIO local (`http://minio.aja-<ws>.orb.local:9000`) |
| `S3_REGION` | `us-east-1` | região |
| `S3_BUCKET` | `aja-administradora-docs` | bucket dos PDFs |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `minioadmin`/`minioadmin` (local) | credenciais |
| `S3_FORCE_PATH_STYLE` | `true` quando há `S3_ENDPOINT` | MinIO exige path-style |

`ensureBucket` (HeadBucket → cria se 404) roda preguiçoso no primeiro upload — em local
dispensa passo extra de provisionamento; em prod o bucket já existe e o HeadBucket é barato.

## Decisão 3 (infra) — **Adicionar MinIO ao `docker-compose.yml`** (o stack NÃO tinha)

O `_prompt.md` afirmava que "o stack já tem MinIO". **Falso** — `docker-compose.yml` só tinha
`db`, `redis`, `app`; nenhum env de storage. Em vez de contornar, **consertei na fonte**
(regra: instrução que mente sobre o ambiente → conserta a fonte): adicionei o serviço `minio`
seguindo o mesmo padrão por-workspace dos demais (container `aja-minio-<ws>`, DNS-first via
`dev.orbstack.domains`, sem porta publicada, volume `miniodata` por workspace) e injetei as
envs `S3_*` no serviço `app`. Cada workspace tem seu MinIO isolado, igual ao Postgres/Redis —
sem colisão entre worktrees paralelos. Em prod as `S3_*` apontam pro S3 real (sem `S3_ENDPOINT`).

## Decisão 4 (FIX-63) — WhatsApp em **E.164 com DDI, reusando `normalizePhoneBR`**

A coluna `mesa_attendants.whatsapp` quer E.164 sem `+` com DDI (`5562999998888`). O
normalizador existente (`src/lib/leads/phone.ts:normalizePhoneBR`) retorna o número **sem** o
DDI (10–11 dígitos). Decisão: reusar `normalizePhoneBR` (não duplicar a regra de DDD/celular
brasileiro) e **prefixar `55`** no schema Zod (`toWhatsappE164`). Garante uma só fonte de
verdade da validação de telefone BR e o formato exato que o roteamento do copiloto (bloco C)
espera para casar com o `waId` do WhatsApp.

## Decisão 5 (segurança) — **Onde mascarar / o que não expor**

- **Credenciais de storage nunca em log.** O client de storage loga erro com a mensagem do SDK,
  nunca as chaves. Env `S3_SECRET_ACCESS_KEY` só lida via `process.env`.
- **`storage_key` é interno** — as rotas de docs retornam metadados (titulo, tipo, versao,
  `temTexto`), **não** a `storageKey` nem o `textoExtraido` cru na listagem (payload enxuto +
  não vazar layout do bucket). Download do binário, se vier, é via rota dedicada futura (bloco
  não pede). O `textoExtraido` é consumido server-side pelo copiloto (bloco C), não pela UI.
- **Sem PII sensível neste bloco** — administradora e atendente de mesa não carregam CPF/dado
  de cliente (isso vive no transbordo, bloco B). O whatsapp do atendente é dado operacional da
  empresa, exibido formatado na tabela admin (sob `requireRole("admin")`).
- **Invariante de produto (FIX-61):** a entidade Administradora é **dossiê de operação**, não
  fonte de oferta/grupo/número ao cliente (Bevi é fonte única). Nenhuma rota **pública** a
  consome — só rotas `/api/admin/*` sob `requireRole("admin")`. Coberto por assert estrutural.

## Decisão 6 (processo) — `drizzle-kit generate` está quebrado no repo → schema intocado

A `0026_mesa_operacao.sql` documenta que `drizzle-kit generate` está quebrado (snapshots meta
0014–0025 nunca commitados). Como o schema das 5 tabelas já atende os 3 cadastros sem
alteração, **não toquei no schema** nem rodei `db:generate` — zero migration nova neste bloco.

## Decisão 7 (teste) — guard via assert estrutural + integração com DB real e storage mockado

- **Camada 1 (structural):** Zod testado direto + um teste que lê o **source** de cada rota mesa
  e exige a substring `requireRole("admin")` (padrão "asserts contra source de produção" do
  CLAUDE.md). Pega rota nova que esqueça o guard.
- **Integração (DB real):** sobe os fluxos CRUD contra o Postgres do workspace (skip se
  `DATABASE_URL` ausente/sentinel, como os integration tests do repo). No teste de docs, a
  **fronteira de storage é mockada** (não depende do MinIO estar de pé no `pnpm test`) mas a
  **extração de PDF roda de verdade** sobre um fixture mínimo gerado em código
  (`tests/helpers/make-pdf.ts`) → assert de valor: `storageKey` setado + `textoExtraido`
  não-vazio contendo o texto do fixture. Bloco não-agêntico → sem cassette (Camada 2 dispensada
  pelo CLAUDE.md para código não-agêntico puro).
