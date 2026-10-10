"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

// スクロールで画面に入ったら下からふわっと出す（UI UX Pro Max: Scroll Reveal / Standard = 400-600ms, stagger 0.08）
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

type Props = { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" };

export function Reveal({ children, className, as = "div" }: Props) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
    >
      {children}
    </Tag>
  );
}

export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "p" | "h2" | "h3";
}) {
  const Tag = motion[as];
  return (
    <Tag className={cn(className)} variants={item}>
      {children}
    </Tag>
  );
}
