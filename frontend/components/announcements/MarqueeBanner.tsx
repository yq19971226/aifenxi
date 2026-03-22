"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Megaphone, ChevronRight } from "lucide-react";
import { fetchActiveAnnouncements } from "@/lib/api/announcements";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

export function MarqueeBanner() {
  const t = useTranslations("announcements");
  const pathname = usePathname() || "/";
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data } = useQuery({
    queryKey: ["announcements", "active", pathname],
    queryFn: () => fetchActiveAnnouncements(pathname),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data || data.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % data.length);
    }, 5000); // 5 seconds per announcement
    return () => clearInterval(timer);
  }, [data]);

  if (!data || data.length === 0) return null;

  const item = data[currentIndex];

  return (
    <div className="flex justify-center border-b border-white/[0.04] bg-indigo-500/[0.02]">
      <div className="flex h-10 w-full max-w-[1600px] items-center px-4 md:px-8">
        <div className="flex items-center gap-2 shrink-0 mr-4">
          <Megaphone size={14} className="text-indigo-400" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
            {t("broadcastLabel")}
          </span>
        </div>
        
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="absolute inset-0 flex items-center"
            >
              <div className="text-xs flex flex-row items-center gap-3 truncate w-full">
                {item.action_href ? (
                  item.action_href.startsWith("http") ? (
                    <a href={item.action_href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-indigo-400 text-zinc-300 transition-colors font-medium group truncate">
                      <span className="truncate">{item.title}</span>
                      <ChevronRight size={12} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </a>
                  ) : (
                    <Link href={item.action_href} className="flex items-center gap-1.5 hover:text-indigo-400 text-zinc-300 transition-colors font-medium group truncate">
                      <span className="truncate">{item.title}</span>
                      <ChevronRight size={12} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  )
                ) : (
                  <span className="cursor-default font-medium text-zinc-300 truncate">{item.title}</span>
                )}
                {item.summary && (
                  <span className="text-zinc-500 text-[11px] truncate hidden sm:inline-block">— {item.summary}</span>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
