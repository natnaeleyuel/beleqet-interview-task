import Link from "next/link";
import { MapPin, Bookmark, Building2 } from "lucide-react";

const typeStyles: Record<string, string> = {
  "Full Time": "bg-brandGreen/10 text-brandGreen",
  "Part Time": "bg-purpleAccent/10 text-purpleAccent",
  Remote: "bg-cyanAccent/10 text-cyanAccent",
  Hybrid: "bg-orangeAccent/10 text-orangeAccent",
  "On-site": "bg-muted/10 text-muted",
  Contract: "bg-redAccent/10 text-redAccent",
};

type JobCardJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  postedAgo: string;
};

export default function JobCard({ job }: { job: JobCardJob }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex flex-col rounded-xl border border-border bg-white p-5 hover:border-brandGreen hover:shadow-card transition-all"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pageBg text-muted">
          <Building2 className="h-5 w-5" />
        </span>
        <Bookmark className="h-4 w-4 text-muted/50 group-hover:text-brandGreen transition-colors" />
      </div>

      <h3 className="text-cardH3 mt-3 text-ink leading-snug line-clamp-2">{job.title}</h3>
      <p className="text-sm text-muted mt-1">{job.company}</p>

      <div className="flex items-center gap-1 text-xs text-muted mt-2">
        <MapPin className="h-3.5 w-3.5" />
        {job.location}
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${typeStyles[job.type] ?? "bg-muted/10 text-muted"}`}>
          {job.type}
        </span>
        <span className="text-[11px] text-muted">{job.postedAgo}</span>
      </div>
    </Link>
  );
}
