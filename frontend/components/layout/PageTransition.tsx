"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  stagger?: boolean; // Whether children should stagger in
}

const variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  enter: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1], // Custom cubic-bezier for a spring-like feel
      when: "beforeChildren",
      staggerChildren: 0.05,
    }
  },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  enter: {
    opacity: 1,
    transition: { duration: 0.2 }
  },
};

export function PageTransition({ children, stagger = true }: PageTransitionProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      variants={prefersReduced ? reducedVariants : variants}
      initial="hidden"
      animate="enter"
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}
