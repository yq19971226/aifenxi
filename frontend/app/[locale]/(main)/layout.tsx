"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PresenceHeartbeat } from "@/components/layout/PresenceHeartbeat";
import { AnnouncementRuntime } from "@/components/announcements/AnnouncementRuntime";
import { MarqueeBanner } from "@/components/announcements/MarqueeBanner";
import { NotificationDrawer } from "@/components/announcements/NotificationDrawer";
import { NotificationBell } from "@/components/announcements/NotificationBell";
import { DataSourceBanner } from "@/components/cards/DataSourceBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Disclaimer } from "@/components/layout/Disclaimer";

import type { ReactNode } from "react";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <AuthGuard>
      <PresenceHeartbeat />
      {/* 移动端 flex-col 纵向堆叠避免左侧留白；桌面端 flex-row 左侧 Sidebar */}
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-bg-primary text-foreground font-sans selection:bg-primary/20 md:flex-row">
        <ErrorBoundary name="OfflineBanner">
          <OfflineBanner />
        </ErrorBoundary>

        {/* Desktop Sidebar - 仅 md 以上显示 */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* Mobile: TopNav 的 header 与下方内容区纵向排列；Desktop: 与内容区同行 */}
        <ErrorBoundary name="TopNav">
          <TopNav />
        </ErrorBoundary>

        <div className="flex min-w-0 flex-1 flex-col md:pl-[64px] transition-[padding] duration-200">
          <ErrorBoundary name="AnnouncementRuntime">
            <AnnouncementRuntime />
            <NotificationDrawer />
          </ErrorBoundary>

          <div className="hidden md:flex fixed top-4 right-8 z-[60]">
            <NotificationBell />
          </div>

          <ErrorBoundary name="MarqueeBanner">
            <MarqueeBanner />
          </ErrorBoundary>

          <div className="flex min-w-0 flex-1 flex-col">
            <main className="min-w-0 flex-1 pb-20 md:pb-0">
              <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 md:px-8">
                <ErrorBoundary name="DataSourceBanner">
                  <div className="mb-6">
                    <DataSourceBanner />
                  </div>
                </ErrorBoundary>
                {children}
              </div>
            </main>

            <Disclaimer />

          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
