import { LandingKv } from "@/components/kv/landing-kv";

// A home serve a variante CONSULTIVA, que é o controle do teste A/B de hero
// (`src/components/kv/heros.tsx`). A variante em teste vive em `/direto`.
//
// Casca de servidor de propósito: a landing inteira é cliente (teatro, mapa de
// calor, placeholder que se digita), e componente cliente não pode exportar
// `metadata`. Com a casca, cada rota declara a sua — é assim que `/direto`
// consegue ser `noindex` sem que a home seja.
export default function LandingPage() {
	return <LandingKv />;
}
