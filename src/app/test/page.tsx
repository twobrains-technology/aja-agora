import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function TestPage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
			<h1 className="text-3xl font-bold">Design System Test</h1>

			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>shadcn/ui Card</CardTitle>
					<CardDescription>
						This card verifies the design system is working correctly.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex gap-4">
					<Button>Primary</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
				</CardContent>
			</Card>
		</main>
	);
}
