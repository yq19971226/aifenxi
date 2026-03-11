"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AnnouncementRuntime } from "@/components/announcements/AnnouncementRuntime";
import { DataSourceBanner } from "@/components/cards/DataSourceBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import type { ReactNode } from "react";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-bg-primary text-foreground font-sans selection:bg-primary/20">
        <ErrorBoundary name="OfflineBanner">
          <OfflineBanner />
        </ErrorBoundary>
        
        {/* Desktop Sidebar */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* Mobile Navigation */}
        <ErrorBoundary name="TopNav">
          <TopNav />
        </ErrorBoundary>
        
        <div className="flex-1 flex flex-col md:pl-[64px] transition-[padding] duration-200">
          <ErrorBoundary name="AnnouncementRuntime">
            <AnnouncementRuntime />
          </ErrorBoundary>
          
          <div className="flex flex-1">
            <main className="flex-1 min-w-0 pb-20 md:pb-0">
               <div className="mx-auto w-full max-w-[1600px] px-4 md:px-8 pt-6">
                 <ErrorBoundary name="DataSourceBanner">
                    <div className="mb-6">
                      <DataSourceBanner />
                    </div>
                  </ErrorBoundary>
                  {children}
               </div>
            </main>

            {/* Right Context Sidebar - Desktop Only */}
            <aside className="hidden xl:block w-[300px] border-l border-border bg-bg-primary/50 sticky top-0 h-screen overflow-y-auto p-4 shrink-0">
               <ContextSidebar />
            </aside>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
