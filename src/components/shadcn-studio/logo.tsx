import { SunMark } from "@/components/brand/sun-mark";
import { cn } from "@/lib/utils";

const Logo = ({ className }: { className?: string }) => {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<span className="flex size-8.5 items-center justify-center rounded-lg bg-[var(--surface-ink)]">
				<SunMark variant="white" className="size-5.5" />
			</span>
			<span className="text-xl font-semibold">Aja Agora</span>
		</div>
	);
};

export default Logo;
