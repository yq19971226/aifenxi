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
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#0A0A0B]">
      {/* 极客背景网格 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1A1A1B_1px,transparent_1px),linear-gradient(to_bottom,#1A1A1B_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40" />
      
      {/* 扫描线效果 */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[size:100%_2px,3px_100%]" />

      {/* 中心发光核心 */}
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="relative"
        >
          {/* 背景扩散圆圈 */}
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/[0.05] rounded-full"
              initial={{ width: 100, height: 100, opacity: 0.5 }}
              animate={{ width: 100 + i * 200, height: 100 + i * 200, opacity: 0 }}
              transition={{
                duration: 4,
                repeat: Infinity,
                delay: i * 1.2,
                ease: "linear",
              }}
            />
          ))}

          {/* 核心 Logo 容器 */}
          <div className="relative bg-black border border-white/10 p-12 rounded-2xl backdrop-blur-xl shadow-2xl">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-blue-500/10 rounded-2xl"
            />
            <h2 className="text-7xl font-black tracking-[0.2em] text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              AXIOM
            </h2>
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="h-[2px] w-24 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
              <p className="text-[10px] uppercase font-mono tracking-[0.5em] text-zinc-500">
                Consensus Protocol v5.0.2
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 四角 HUD 装甲板文案 */}
      <div className="absolute top-12 left-12 font-mono text-[9px] text-zinc-600 uppercase tracking-widest space-y-1">
        <p>System: Online</p>
        <p>Latency: 12ms</p>
        <p>Epoch: V5-Omega</p>
      </div>

      <div className="absolute top-12 right-12 font-mono text-[9px] text-zinc-600 text-right uppercase tracking-widest space-y-1">
        <p>Nodes: Active [842]</p>
        <p>Memory: 16.4 EB</p>
        <p>Bandwidth: 400 Gbps</p>
      </div>

      <div className="absolute bottom-12 left-12 font-mono text-[9px] text-zinc-600 uppercase tracking-widest max-w-[150px] leading-relaxed">
        <p className="border-l border-zinc-500/30 pl-3">
          Verification loop established. 
          Agents warming up for deep analysis.
        </p>
      </div>

      {/* 右下角浮动数据 stream */}
      <div className="absolute bottom-12 right-12 bg-white/[0.02] border border-white/[0.05] p-3 rounded-lg font-mono text-[8px] text-zinc-700 space-y-1.5 min-w-[140px]">
         <div className="flex justify-between"><span>SWARM_LOAD</span><span className="text-emerald-500/50">4.2%</span></div>
         <div className="flex justify-between"><span>ORACLE_STAKE</span><span className="text-zinc-500">12.5M</span></div>
         <div className="w-full h-0.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
               animate={{ x: [-140, 140] }} 
               transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
               className="w-1/3 h-full bg-indigo-500/30" 
            />
         </div>
         <p className="opacity-40">Axiom Truth Chain Syncing...</p>
      </div>

      {/* 随机浮动的小节点 */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 bg-white/20 rounded-full"
          animate={{
            x: [Math.random() * 800, Math.random() * 800],
            y: [Math.random() * 600, Math.random() * 600],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: 10 + Math.random() * 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
