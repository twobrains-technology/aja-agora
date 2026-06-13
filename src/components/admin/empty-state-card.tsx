import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyStateCardProps {
	icon: LucideIcon;
	iconBg: string;
	iconColor: string;
	title: string;
	description: string;
	action?: { label: string; onClick: () => void; disabled?: boolean };
}

export function EmptyStateCard({
	icon: Icon,
	iconBg,
	iconColor,
	title,
	description,
	action,
}: EmptyStateCardProps) {
	return (
		<div className="p-4">
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className={cn("p-2 rounded-full", iconBg)}>
						<Icon className={cn("size-5", iconColor)} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">{title}</p>
						<p className="text-sm text-muted-foreground mt-0.5">{description}</p>
						{action && (
							<Button
								onClick={action.onClick}
								disabled={action.disabled}
								variant="outline"
								size="sm"
								className="mt-3"
							>
								{action.label}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
