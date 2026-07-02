"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Laptop,
  Megaphone,
  Landmark,
  HeartPulse,
  GraduationCap,
  Cog,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { categories as fallbackCategories } from "@/lib/mockData";
import { fetchCategories, type ApiCategory } from "@/lib/api";

const iconMap: Record<string, LucideIcon> = {
  laptop: Laptop,
  megaphone: Megaphone,
  landmark: Landmark,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  cog: Cog,
  "more-horizontal": MoreHorizontal,
};

function getIcon(icon: string | null | undefined): LucideIcon {
  return iconMap[icon ?? ""] ?? MoreHorizontal;
}

type CategoryDisplay = {
  id: string;
  label: string;
  count: string;
  icon: LucideIcon;
};

export default function CategoryGrid() {
  const [apiCategories, setApiCategories] = useState<CategoryDisplay[] | null>(null);

  useEffect(() => {
    fetchCategories()
      .then((cats: ApiCategory[]) =>
        setApiCategories(
          cats.map((c: ApiCategory) => ({ id: c.id, label: c.label, count: "0", icon: getIcon(c.icon) }))
        )
      )
      .catch(() => {});
  }, []);

  const displayCategories = apiCategories ?? fallbackCategories.map((c) => ({
    id: c.id,
    label: c.label,
    count: c.count,
    icon: getIcon(c.icon),
  }));

  return (
    <section className="container-page py-14">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-sectionH2">Browse Jobs by Category</h2>
          <p className="text-muted text-sm mt-1">Explore opportunities across growing industries and find jobs that match your skills.</p>
        </div>
        <Link href="/jobs" className="hidden sm:inline-block text-sm font-semibold text-brandGreen hover:underline shrink-0">
          View all categories →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {displayCategories.slice(0, 14).map((cat) => (
          <Link
            key={cat.id}
            href={`/jobs?category=${cat.id}`}
            className="flex flex-col items-center text-center gap-2 rounded-xl border border-border bg-white px-3 py-5 hover:border-brandGreen hover:shadow-card transition-all"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brandGreen/10 text-brandGreen">
              <cat.icon className="h-4.5 w-4.5" />
            </span>
            <span className="text-xs font-semibold text-ink">{cat.label}</span>
            <span className="text-[11px] text-muted">{cat.count} jobs</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
