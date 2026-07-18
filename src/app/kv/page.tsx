import { KvComparacao } from "@/components/kv/kv-comparacao";
import { KvConfianca } from "@/components/kv/kv-confianca";
import { KvContemplacao } from "@/components/kv/kv-contemplacao";
import { KvDepoimentos } from "@/components/kv/kv-depoimentos";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvHero } from "@/components/kv/kv-hero";
import { KvJourney } from "@/components/kv/kv-journey";
import { KvMenu } from "@/components/kv/kv-menu";
import { KvNumbers } from "@/components/kv/kv-numbers";
import { KvTipos } from "@/components/kv/kv-tipos";

// Réplica fiel do Figma "Key Visual" (página Site → seção Home) na stack do
// projeto. Ordem vertical conforme o Y de cada seção no comp.
export default function KvPage() {
	return (
		<main className="bg-[#FAFAF3]">
			<KvMenu />
			<div id="hero" className="scroll-mt-24">
				<KvHero />
			</div>
			<div id="como-funciona" className="scroll-mt-24">
				<KvJourney />
			</div>
			<KvTipos />
			<KvContemplacao />
			<div id="faq" className="scroll-mt-24">
				<KvFaq />
			</div>
			<KvNumbers />
			<KvDepoimentos />
			<div id="confianca" className="scroll-mt-24">
				<KvConfianca />
			</div>
			<KvComparacao />
			<KvFooter />
		</main>
	);
}
