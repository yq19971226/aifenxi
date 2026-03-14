"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function AuthVisualizer() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black selection:bg-indigo-500/30">
      {/* 极简深渊噪点与网格基调 */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />

      {/* 巨大的缓慢旋转的模糊光晕 */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
        className="absolute w-[120vw] h-[120vw] -left-[10vw] -top-[10vw] opacity-40 pointer-events-none"
      >
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-indigo-500/20 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-1/2 h-1/2 bg-emerald-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </motion.div>

      {/* 虚拟多维地球 / 算力网络抽象 */}
      <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
        {/* 中心发光核心 */}
        <div className="absolute w-96 h-96 rounded-full border border-white/[0.03] flex items-center justify-center">
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
            className="w-full h-full border border-white/[0.05] border-dashed rounded-full"
          />
          <div className="absolute w-64 h-64 rounded-full border border-indigo-500/20 shadow-[0_0_80px_rgba(99,102,241,0.1)_inset]" />
          
          <div className="absolute z-20 text-center">
             <h2 className="text-[120px] font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/10 opacity-5">
              AXIOM
             </h2>
          </div>
        </div>

        {/* 动态脉冲扫描仪 */}
        <motion.div
           animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
           transition={{ duration: 4, repeat: Infinity, ease: "circOut" }}
           className="absolute w-64 h-64 border border-indigo-500/40 rounded-full mix-blend-screen"
        />
        <motion.div
           animate={{ scale: [1, 3], opacity: [0.3, 0] }}
           transition={{ duration: 4, repeat: Infinity, ease: "circOut", delay: 1 }}
           className="absolute w-64 h-64 border border-emerald-500/30 rounded-full mix-blend-screen"
        />
      </div>

      {/* 十字准星与坐标轴装饰 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/[0.05] to-transparent" />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        {/* 中心准星 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8">
           <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-indigo-500/50" />
           <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-indigo-500/50" />
           <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-indigo-500/50" />
           <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-indigo-500/50" />
        </div>
      </div>

      {/* 角落 HUD 数据流 (军工级排版) */}
      <div className="absolute top-8 left-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          <span className="text-[9px] font-mono text-white tracking-[0.2em] uppercase">Auth Node</span>
        </div>
        <div className="space-y-1 text-[9px] font-mono text-zinc-600 tracking-[0.1em] uppercase">
          <p>SYS.SECURE.LINK // ACTIVE</p>
          <p>QUANT.ENGINE // WARMING_UP</p>
          <p>LATENCY // 14MS</p>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 text-right">
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-[9px] font-mono text-white tracking-[0.2em] uppercase">Global Swarm</span>
          <div className="w-1.5 h-1.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
        </div>
        <div className="space-y-1 text-[9px] font-mono text-zinc-600 tracking-[0.1em] uppercase">
          <div className="flex items-center justify-end gap-3">
             <span>NODES</span>
             <span className="text-zinc-400">8,492</span>
          </div>
          <div className="flex items-center justify-end gap-3">
             <span>OPS/SEC</span>
             <span className="text-zinc-400">1.2M</span>
          </div>
          <div className="flex items-center justify-end gap-3">
             <span>AI_MODELS</span>
             <span className="text-zinc-400">V5-OMEGA</span>
          </div>
        </div>
      </div>

      {/* 实时闪烁日志条 */}
      <div className="absolute bottom-8 left-8 p-3 bg-white/[0.02] border border-white/[0.05] rounded-lg backdrop-blur-md">
         <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-indigo-400/80 mb-2 border-b border-indigo-500/20 pb-1 inline-block">
           Authentication Stream
         </div>
         <div className="space-y-1 font-mono text-[9px] text-zinc-500 tracking-[0.05em] h-[40px] overflow-hidden">
           <motion.div animate={{ y: [0, -18, -18, -36, -36] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.1, 0.5, 0.6, 1] }}>
             <p className="h-[18px]">Analyzing request headers...</p>
             <p className="h-[18px]">Checking local node latency...</p>
             <p className="h-[18px] text-emerald-500/70">Awaiting user credentials input ⚡</p>
           </motion.div>
         </div>
      </div>
    </div>
  );
}
