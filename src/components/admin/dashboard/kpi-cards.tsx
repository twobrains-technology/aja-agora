"use client";

import { ChevronDown, ChevronUp, Clock, TrendingUp, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import type { KpiData } from "@/lib/admin/dashboard-types";

interface KpiCardProps {
	title: string;
	value: number;
	suffix?: string;
	prefix?: string;
	decimalPlaces?: number;
	trend: number;
	icon: React.ComponentType<{ className?: string }>;
	invertTrend?: boolean;
}

function KpiCard({
	title,
	value,
	suffix,
	prefix,
	decimalPlaces = 0,
	trend,
	icon: Icon,
	invertTrend,
}: KpiCardProps) {
	const isPositive = invertTrend ? trend <= 0 : trend >= 0;
	const TrendIcon = trend >= 0 ? ChevronUp : ChevronDown;

	return (
		<Card className="shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
				<Avatar className="size-9">
					<AvatarFallback className="bg-primary/10">
						<Icon className="size-4 text-primary" />
					</AvatarFallback>
				</Avatar>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold tracking-tight">
					{prefix}
					<NumberTicker value={value} decimalPlaces={decimalPlaces} />
					{suffix}
				</div>
				<div
					className={`text-xs flex items-center gap-0.5 mt-1.5 ${
						isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
					}`}
				>
					<TrendIcon className="size-3.5" />
					<span>{Math.abs(trend)}% vs periodo anterior</span>
				</div>
			</CardContent>
		</Card>
	);
}

export function KpiCards({ kpis }: { kpis: KpiData }) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<KpiCard
				title="Total Leads"
				value={kpis.totalLeads}
				trend={kpis.trends.totalLeads}
				icon={Users}
			/>
			<KpiCard
				title="Leads Hoje"
				value={kpis.leadsToday}
				trend={kpis.trends.leadsToday}
				icon={UserPlus}
			/>
			<KpiCard
				title="Tempo Medio no Funil"
				value={kpis.avgFunnelDays}
				suffix=" dias"
				trend={kpis.trends.avgFunnelDays}
				icon={Clock}
				invertTrend
			/>
			<KpiCard
				title="Taxa de Conversao"
				value={kpis.conversionRate}
				suffix="%"
				decimalPlaces={1}
				trend={kpis.trends.conversionRate}
				icon={TrendingUp}
			/>
		</div>
	);
}
