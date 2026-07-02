"use client";

import { useEffect, useState } from "react";
import { Briefcase, Building2, Users, Smile, type LucideIcon } from "lucide-react";
import { stats as fallbackStats } from "@/lib/mockData";
import { fetchJobs, fetchCategories } from "@/lib/api";

const iconMap: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "building-2": Building2,
  users: Users,
  smile: Smile,
};

export default function StatsBar() {
  const [liveStats, setLiveStats] = useState<{ label: string; value: string }[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJobs({ limit: 1 }),
      fetchCategories(),
    ])
      .then(([jobs, cats]) => {
        setLiveStats([
          { label: "Active Jobs", value: String(jobs.total) },
          { label: "Categories", value: String(cats.length) },
          { label: "Registered Job Seekers", value: "1,200+" },
          { label: "Satisfaction Rate", value: "98%" },
        ]);
      })
      .catch(() => {});
  }, []);

  const displayStats = liveStats ?? fallbackStats.map((s) => ({ label: s.label, value: s.value, icon: s.icon }));

  return (
    <div className="container-page -mt-7 relative z-10">
      <div className="rounded-2xl bg-brandGreen text-white grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/15 shadow-cardHover">
        {displayStats.map((stat, i) => {
          const iconKey = liveStats
            ? ["briefcase", "building-2", "users", "smile"][i] ?? "briefcase"
            : fallbackStats[i]?.icon ?? "briefcase";
          const Icon = iconMap[iconKey] ?? Briefcase;
          return (
            <div key={stat.label} className="flex items-center gap-3 px-5 py-5">
              <Icon className="h-5 w-5 text-white/80 shrink-0" />
              <div>
                <p className="text-lg font-extrabold leading-none">{stat.value}</p>
                <p className="text-[11px] text-white/70 mt-1">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
