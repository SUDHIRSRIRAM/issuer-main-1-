import React, { useEffect } from "react";
import "./App.css";
import "./index.css";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { SEO } from "./components/SEO";
import { PerformanceMonitor } from "./components/PerformanceMonitor";
import Index from "./pages/Index";
import Features from "./pages/Features";
import HowItWorks from "./pages/HowItWorks";
import TryNow from "./pages/TryNow";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import { initGA, trackPageView } from "./utils/analytics";
import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      networkMode: 'online',
    },
  },
});

// Analytics wrapper component
const AnalyticsWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  useEffect(() => {
    initGA();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return <>{children}</>;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" attribute="class">
        <TooltipProvider>
          <BrowserRouter>
            <AnalyticsWrapper>
              <SEO />
              <div className="min-h-screen bg-background">
                <Header />
                <main className="container mx-auto px-4 py-8">
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/features" element={<Features />} />
                    <Route path="/how-it-works" element={<HowItWorks />} />
                    <Route path="/try-now" element={<TryNow />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                  </Routes>
                </main>
                <Footer />
              </div>
              <Toaster />
              <Sonner />
            </AnalyticsWrapper>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;