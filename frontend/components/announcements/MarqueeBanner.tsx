"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import { fetchActiveAnnouncements } from "@/lib/api/announcements";
import Link from "next/link";

export function MarqueeBanner() {
  const pathname = usePathname() || "/";

  const { data } = useQuery({
    queryKey: ["announcements", "active", pathname],
    queryFn: () => fetchActiveAnnouncements(pathname),
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  const items = data.map(item => ({
    id: item.id,
    text: item.title,
    href: item.action_href
  }));

  // Render 10 times to ensure it overflows the screen for seamless looping
  const repeatedItems = Array(10).fill(items).flat();

  return (
    <div className="flex h-9 items-center overflow-hidden bg-indigo-500/[0.03] border-b border-white/[0.04]">
      {/* Left fixed indicator */}
      <div className="flex items-center gap-2 pl-4 pr-3 shrink-0 bg-bg-primary h-full z-10 shadow-[10px_0_15px_-5px_rgba(0,0,0,0.5)] border-r border-white/[0.02]">
        <Megaphone size={14} className="text-indigo-400 animate-pulse" />
        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
          广播
        </span>
      </div>
      
      {/* Scrolling container */}
      <div className="flex-1 overflow-hidden relative flex group">
        <div className="animate-marquee flex whitespace-nowrap group-hover:[animation-play-state:paused] items-center">
          {repeatedItems.map((item, i) => (
            <span key={`${item.id}-${i}`} className="mx-8 text-xs text-zinc-300 flex items-center">
              <span className="text-indigo-500/50 mr-3 text-[10px]">◆</span>
              {item.href ? (
                item.href.startsWith("http") ? (
                  <a href={item.href} target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors font-medium">
                    {item.text}
                  </a>
                ) : (
                  <Link href={item.href} className="hover:text-indigo-400 transition-colors font-medium">
                    {item.text}
                  </Link>
                )
              ) : (
                <span className="cursor-default font-medium">{item.text}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      
      {/* Inline styles for the seamless marquee animation (-10% because we duplicated the array 10 times) */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes notice-marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-10%); }
        }
        .animate-marquee {
          animation: notice-marquee 40s linear infinite;
        }
      `}} />
    </div>
  );
}
