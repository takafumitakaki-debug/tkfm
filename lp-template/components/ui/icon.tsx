import { Check, Clock, Gift, Heart, MessageCircle, Shield, Smartphone, Sparkles, Star, TrendingUp, Users, Zap } from "lucide-react";
import type { IconName } from "@/content/types";

const icons = {
  sparkles: Sparkles,
  zap: Zap,
  shield: Shield,
  heart: Heart,
  clock: Clock,
  smartphone: Smartphone,
  trending: TrendingUp,
  users: Users,
  message: MessageCircle,
  star: Star,
  check: Check,
  gift: Gift,
};

export function Icon({ name = "sparkles", className }: { name?: IconName; className?: string }) {
  const C = icons[name];
  return <C className={className} aria-hidden />;
}
