import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Clock, Building2, ArrowLeft } from 'lucide-react';
import { jobs as mockJobs } from '@/lib/mockData';
import { fetchJob } from '@/lib/api';

export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const { fetchJobs } = await import('@/lib/api');
    const data = await fetchJobs({ limit: 50 });
    return data.items.map((job) => ({ id: job.id }));
  } catch {
    return mockJobs.map((job) => ({ id: job.id }));
  }
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  let job: {
    id: string;
    title: string;
    company: string;
    location: string;
    type: string;
    category: string;
    postedAgo: string;
    description?: string;
    tags?: string[];
  } | null = null;
  let related: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    type: string;
    category: string;
    postedAgo: string;
  }> = [];

  try {
    const apiJob = await fetchJob(params.id);
    const typeMap: Record<string, string> = {
      FULL_TIME: 'Full Time', PART_TIME: 'Part Time', REMOTE: 'Remote', HYBRID: 'Hybrid', CONTRACT: 'Contract',
    };
    job = {
      id: apiJob.id,
      title: apiJob.title,
      company: apiJob.company?.name || apiJob.companyName || '',
      location: apiJob.location,
      type: typeMap[apiJob.type] || 'Full Time',
      category: apiJob.category?.slug || '',
      postedAgo: formatRelativeTime(apiJob.createdAt),
      description: apiJob.description,
      tags: apiJob.tags,
    };
    const { fetchJobs } = await import('@/lib/api');
    const relatedData = await fetchJobs({ category: apiJob.category?.slug, limit: 4 });
    related = relatedData.items
      .filter((r) => r.id !== params.id)
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        title: r.title,
        company: r.company?.name || r.companyName || '',
        location: r.location,
        type: typeMap[r.type] || 'Full Time',
        category: r.category?.slug || '',
        postedAgo: formatRelativeTime(r.createdAt),
      }));
  } catch {
    const mockJob = mockJobs.find((j) => j.id === params.id);
    if (!mockJob) notFound();
    job = { ...mockJob };
    related = mockJobs.filter((j) => j.category === mockJob.category && j.id !== mockJob.id).slice(0, 3);
  }

  if (!job) notFound();

  const typeStyles: Record<string, string> = {
    'Full Time': 'bg-brandGreen/10 text-brandGreen',
    'Part Time': 'bg-purpleAccent/10 text-purpleAccent',
    Remote: 'bg-cyanAccent/10 text-cyanAccent',
    Hybrid: 'bg-orangeAccent/10 text-orangeAccent',
    'On-site': 'bg-muted/10 text-muted',
    Contract: 'bg-redAccent/10 text-redAccent',
  };

  return (
    <div className="container-page py-10">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brandGreen mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to all jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div>
          <div className="rounded-2xl border border-border bg-white p-7">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-pageBg text-muted shrink-0">
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-ink leading-snug">{job.title}</h1>
                <p className="text-muted mt-1">{job.company}</p>
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {job.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {job.postedAgo}
                  </span>
                  <span className={`rounded-full font-semibold px-2.5 py-1 text-xs ${typeStyles[job.type] || 'bg-muted/10 text-muted'}`}>
                    {job.type}
                  </span>
                </div>
              </div>
            </div>

            {job.description && (
              <div className="mt-7 pt-7 border-t border-border">
                <h2 className="text-sm font-semibold text-ink mb-3">Job Description</h2>
                <p className="text-sm text-muted leading-relaxed">{job.description}</p>
              </div>
            )}

            {job.tags && job.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {job.tags.map((tag) => (
                  <span key={tag} className="text-xs font-medium text-muted bg-pageBg border border-border rounded-full px-3 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-white p-6">
            <button className="w-full rounded-full bg-brandGreen text-white text-sm font-semibold py-3 hover:bg-darkGreen transition-colors">
              Apply Now
            </button>
            <button className="w-full rounded-full border border-border text-ink text-sm font-semibold py-3 mt-2 hover:bg-pageBg transition-colors">
              Save Job
            </button>
          </div>

          {related.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-6">
              <h3 className="text-sm font-semibold text-ink mb-4">Similar Jobs</h3>
              <div className="space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/jobs/${r.id}`}
                    className="block rounded-lg hover:bg-pageBg p-2 -mx-2 transition-colors"
                  >
                    <p className="text-sm font-semibold text-ink line-clamp-1">{r.title}</p>
                    <p className="text-xs text-muted mt-0.5">{r.company} · {r.location}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
