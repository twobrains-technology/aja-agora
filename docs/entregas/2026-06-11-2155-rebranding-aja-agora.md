# Aja Agora ganhou identidade própria — do tema genérico à marca "sol nascente"

**Data:** 2026-06-11 · **Branch:** `feat/brading` · **Tipo:** Rebranding completo (design system + landing)

---

## O que mudou, em uma frase

A plataforma deixou de usar o tema cinza padrão do shadcn e o logo placeholder ("A"
geométrico) e passou a vestir a **identidade real da Aja Agora**: paleta azul/navy/cyan,
tipografia Poppins, o **símbolo do sol nascente** como avatar do agente, e uma **landing
page redesenhada** ponta a ponta — sóbria, moderna, "consultoria do seu lado".

## Por que isso importa pro negócio

- **Primeira impressão é a marca, não um template.** Quem chega na landing agora vê uma
  consultoria de consórcio independente e confiável (estética Stripe/Linear), não um app
  genérico. O posicionamento — *independente, transparente, estratégica, do seu lado* —
  está escrito em cada seção.
- **O agente tem rosto.** O símbolo do sol vira o avatar do consultor na conversa. A marca
  acompanha o usuário do "oi" da landing até a recomendação no chat.
- **Consistência total, baixo custo de manutenção.** Como os tokens de cor seguem a
  nomenclatura semântica do shadcn, **trocar o tema propagou a marca pra todo o produto de
  uma vez** — chat, painel admin e os cartões de recomendação herdaram a paleta sem
  retrabalho componente a componente.

## A jornada que o cliente vê

1. **Landing nova (8 seções):** navegação · hero com a **caixa de conversa** (o usuário já
   começa a falar ali, com frases que se digitam sozinhas) · três pilares de confiança ·
   "Como trabalhamos" em 3 passos · "Na prática" com uma conversa de exemplo + cartão de
   recomendação · bloco institucional com os 4 valores da marca · chamada final · rodapé.
2. **Hero → conversa sem corte:** o usuário escreve o que quer e a tela floresce num
   **"nascer do dia"** (o sol da marca abrindo) que o leva direto pra conversa — sem recarregar
   página, sem formulário.
3. **No chat:** o consultor aparece com o **sol** como avatar; quando o assunto vira um carro,
   um imóvel ou uma moto, o especialista da categoria assume — tudo na identidade nova,
   inclusive no modo escuro.

## Qualidade entregue (como sabemos que está sólido)

- **1.400 testes automatizados passando**, zero falhas. As regras de conteúdo da marca viraram
  teste: a landing **não pode** soar como "robô/IA" (overclaim vetado por lei de publicidade) e
  **precisa** educar sobre consórcio (sem juros, parcela, lance, contemplação, assembleia).
- **Símbolo do sol testado**: 10 raios, variações de cor, e o cuidado de aparecer **completo
  mesmo sem animação** (impressão, leitor de tela, quem desativa animações).
- **QA visual real** (navegador): landing, fluxo hero→conversa, chat (claro e escuro) e login
  do admin — todos renderizando a marca, **zero erros de console**.
- **Acessibilidade preservada:** animações respeitam "reduzir movimento"; nada de conteúdo que
  só aparece com animação.

## Decisões que blindaram o lançamento

- **"Sol" no lugar de "galáxia":** a transição pro chat antes era um efeito de partículas
  espaciais; trocamos pelo **nascer do sol** da marca, coerente com a identidade.
- **Texto sem "cara de IA":** o handoff sugeria um selo "com IA" no topo; trocamos por
  *"Consultoria de consórcio independente"* — alinhado à regra de não prometer autonomia que
  não temos (e ao tom institucional da própria marca). Limpamos também o título/SEO do site.
- **3 passos em vez de 5:** a marca pede um "como funciona" enxuto; mantivemos os termos
  educativos de consórcio re-ancorados nas descrições, sem perder SEO.

## Gaps honestos (follow-ups)

- **Cartões de produto (recomendação/dial de contemplação):** já herdaram a paleta e os números
  de estado (verde/amarelo) agora seguem os tokens da marca. Um refino "pixel a pixel" contra o
  showcase (variante navy do cartão, sol que se preenche) é evolução opcional.
- **Login do admin (tela interna):** ganhou o logo do sol e a paleta, mas o bloco herdado ainda
  traz uma frase "IA ativa" e um watermark antigo em "A". É interno (não cliente) — vale um
  ajuste de copy depois.
- **Foto do hero** é um placeholder dirigido; a versão final licenciada entra depois, mantendo a
  mesma composição.

## Onde está

Tokens em `globals.css`; marca em `src/components/brand/` (`SunMark`, `Wordmark`); landing em
`src/components/landing/`; avatar do agente em `chat-message.tsx`. Ambiente local validado em
`aja-brading.orb.local`.
