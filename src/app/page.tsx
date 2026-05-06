"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import { Footer } from "@/components/landing/footer";
import { GalaxyTransition } from "@/components/landing/galaxy-transition";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SocialProof } from "@/components/landing/social-proof";
import Header from "@/components/shadcn-studio/blocks/hero-section-25/header";
import { HeroSection25 } from "@/components/shadcn-studio/blocks/hero-section-25/hero-section-25";
import { ChatProvider, useChatContext } from "@/lib/chat/provider";

export default function LandingPage() {
	const [mode, setMode] = useState<"landing" | "transitioning" | "chat">("landing");
	const [pendingMessage, setPendingMessage] = useState<string | null>(null);

	const handleGoalSelected = useCallback((message: string) => {
		setPendingMessage(message);
		setMode("transitioning");
	}, []);

	const handleTransitionComplete = useCallback(() => {
		setMode("chat");
	}, []);

	const handleBackToLanding = useCallback(() => {
		setMode("landing");
	}, []);

	return (
		<>
			<GalaxyTransition active={mode === "transitioning"} onComplete={handleTransitionComplete} />

			<AnimatePresence mode="wait">
				{mode === "landing" && (
					<motion.main
						key="landing"
						className="flex min-h-screen flex-col"
						exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3 } }}
					>
						<Header />
						<HeroSection25 onGoalSelected={handleGoalSelected} />
						<HowItWorks />
						<BenefitsSection />
						<SocialProof />
						<FaqSection />
						<CtaSection />
						<Footer />
					</motion.main>
				)}

				{mode === "chat" && (
					<motion.div
						key="chat"
						initial={{ opacity: 0, scale: 1.02 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
					>
						<ChatProvider>
							<ChatPanel
								onBackToLanding={handleBackToLanding}
								pendingMessage={pendingMessage}
								consumePending={() => setPendingMessage(null)}
							/>
						</ChatProvider>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

function ChatPanel({
	onBackToLanding,
	pendingMessage,
	consumePending,
}: {
	onBackToLanding: () => void;
	pendingMessage: string | null;
	consumePending: () => void;
}) {
	const { messages, status, regenerate, reset, error, sendUserMessage } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	useEffect(() => {
		if (!pendingMessage) return;
		const timer = setTimeout(() => {
			void sendUserMessage(pendingMessage);
			consumePending();
		}, 500);
		return () => clearTimeout(timer);
	}, [pendingMessage, sendUserMessage, consumePending]);

	const handleReset = useCallback(() => {
		reset();
		onBackToLanding();
	}, [reset, onBackToLanding]);

	return (
		<ChatLayout onReset={handleReset} error={error?.message ?? null}>
			<MessageList
				messages={messages}
				isStreaming={isStreaming}
				hasError={!!error}
				onRetry={regenerate}
			/>
			<ChatInput isStreaming={isStreaming} />
		</ChatLayout>
	);
}
