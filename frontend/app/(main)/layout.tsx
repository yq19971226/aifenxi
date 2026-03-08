"use client";

import { TopNav } from "@/components/layout/TopNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AnnouncementRuntime } from "@/components/announcements/AnnouncementRuntime";
import { DataSourceBanner } from "@/components/cards/DataSourceBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import type { ReactNode } from "react";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-bg-primary">
        <OfflineBanner />
        <TopNav />
        <AnnouncementRuntime />
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-6 pt-4 empty:hidden">
          <DataSourceBanner />
        </div>
        <main className="flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
