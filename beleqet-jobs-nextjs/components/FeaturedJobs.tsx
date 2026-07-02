import Link from 'next/link';
import { jobs as fallbackJobs } from '@/lib/mockData';
import { fetchJobs } from '@/lib/api';
import JobCard from './JobCard';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function FeaturedJobs() {
  let jobs: {
    id: string;
    title: string;
    company: string;
    location: string;
    type: string;
    category: string;
    postedAgo: string;
    featured?: boolean;
    description?: string;
    tags?: string[];
  }[] = [];

  try {
    const data = await fetchJobs({ limit: 10 });
    jobs = data.items.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company?.name || j.companyName || '',
      location: j.location,
      type: j.type === 'FULL_TIME' ? 'Full Time' : j.type === 'PART_TIME' ? 'Part Time' : j.type === 'REMOTE' ? 'Remote' : j.type === 'HYBRID' ? 'Hybrid' : 'On-site',
      category: j.category?.slug || '',
      postedAgo: formatRelativeTime(j.createdAt),
      featured: j.featured ?? undefined,
      description: j.description ?? undefined,
      tags: j.tags ?? undefined,
    }));
  } catch {
    jobs = fallbackJobs.filter((j) => j.featured).map((j) => ({ ...j }));
  }

  return (
    <section className="bg-white border-y border-border">
      <div className="container-page py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-sectionH2">Featured Jobs</h2>
            <p className="text-muted text-sm mt-1">Fresh opportunities from companies hiring right now.</p>
          </div>
          <Link href="/jobs" className="hidden sm:inline-block text-sm font-semibold text-brandGreen hover:underline shrink-0">
            View all jobs →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </div>
    </section>
  );
}
