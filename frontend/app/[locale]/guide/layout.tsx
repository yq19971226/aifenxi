import type { ReactNode } from "react";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#09090b]">{children}</div>;
}
