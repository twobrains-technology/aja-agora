"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { SocialProof } from "@/components/landing/social-proof";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { GalaxyTransition } from "@/components/landing/galaxy-transition";
import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChat } from "@/lib/chat/use-chat";

export default function LandingPage() {
  const [mode, setMode] = useState<"landing" | "transitioning" | "chat">("landing");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const { messages, isStreaming, sendMessage, retry, reset, error } = useChat();

  const handleGoalSelected = useCallback((message: string) => {
    setPendingMessage(message);
    setMode("transitioning");
  }, []);

  const handleTransitionComplete = useCallback(() => {
    setMode("chat");
  }, []);

  // Send the pending message once chat mode is active
  useEffect(() => {
    if (mode === "chat" && pendingMessage) {
      const timer = setTimeout(() => {
        sendMessage(pendingMessage);
        setPendingMessage(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mode, pendingMessage, sendMessage]);

  const handleBackToLanding = useCallback(() => {
    reset();
    setMode("landing");
  }, [reset]);

  return (
    <>
      <GalaxyTransition
        active={mode === "transitioning"}
        onComplete={handleTransitionComplete}
      />

      <AnimatePresence mode="wait">
        {mode === "landing" && (
          <motion.main
            key="landing"
            className="flex min-h-screen flex-col"
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3 } }}
          >
            <Navbar />
            <HeroSection onGoalSelected={handleGoalSelected} />
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
            <ChatLayout onReset={handleBackToLanding} error={error}>
              <MessageList messages={messages} isStreaming={isStreaming} onRetry={retry} />
              <ChatInput onSend={sendMessage} isStreaming={isStreaming} />
            </ChatLayout>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
