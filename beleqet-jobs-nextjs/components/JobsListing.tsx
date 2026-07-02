'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, MapPin, SlidersHorizontal } from 'lucide-react';
import { jobs as mockJobs, categories as mockCategories } from '@/lib/mockData';
import { fetchJobs, fetchCategories, type ApiJob, type ApiCategory } from '@/lib/api';
import JobCard from '@/components/JobCard';

const jobTypes = ['Full Time', 'Part Time', 'Remote', 'Hybrid', 'On-site', 'Contract'];
const fallbackJobs = mockJobs.map((j) => ({ ...j }));

function mapApiJob(j: ApiJob) {
  const typeMap: Record<string, string> = {
    FULL_TIME: 'Full Time',
    PART_TIME: 'Part Time',
    REMOTE: 'Remote',
    HYBRID: 'Hybrid',
    CONTRACT: 'Contract',
  };
  return {
    id: j.id,
    title: j.title,
    company: j.company?.name || j.companyName || '',
    location: j.location,
    type: typeMap[j.type] || 'Full Time',
    category: j.category?.slug || '',
    postedAgo: formatRelativeTime(j.createdAt),
    featured: j.featured ?? false,
    description: j.description ?? '',
    tags: j.tags ?? [],
  };
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type DisplayJob = ReturnType<typeof mapApiJob>;

export default function JobsListing() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apiJobs, setApiJobs] = useState<DisplayJob[] | null>(null);
  const [apiCategories, setApiCategories] = useState<{ id: string; slug: string; label: string; count?: string }[] | null>(null);

  const q = searchParams.get('q') ?? '';
  const loc = searchParams.get('loc') ?? '';
  const catSlug = searchParams.get('category') ?? '';

  useEffect(() => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (loc) params.location = loc;
    if (catSlug) params.category = catSlug;
    fetchJobs(params)
      .then((data) => setApiJobs(data.items.map(mapApiJob)))
      .catch(() => setApiJobs([]));
    fetchCategories()
      .then((cats: ApiCategory[]) => setApiCategories(cats.map((c: ApiCategory) => ({ id: c.id, slug: c.slug, label: c.label }))))
      .catch(() => setApiCategories([]));
  }, [q, loc, catSlug]);

  const [query, setQuery] = useState(q);
  const [location, setLocation] = useState(loc);
  const [type, setType] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = () => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (location) p.set('loc', location);
    router.push(`/jobs?${p.toString()}`);
  };

  const jobs = apiJobs ?? fallbackJobs;

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      const matchesQuery =
        !query ||
        job.title.toLowerCase().includes(query.toLowerCase()) ||
        job.company.toLowerCase().includes(query.toLowerCase());
      const matchesLocation = !location || job.location.toLowerCase().includes(location.toLowerCase());
      const matchesCategory = !catSlug || job.category === catSlug;
      const matchesType = !type || job.type === type;
      return matchesQuery && matchesLocation && matchesCategory && matchesType;
    });
  }, [query, location, catSlug, type, jobs]);

  return (
    <div className="container-page py-10">
      <div className="mb-6">
        <h1 className="text-pageH1">Search verified jobs from trusted employers.</h1>
        <p className="text-muted text-sm mt-2">{filtered.length} jobs found</p>
      </div>

      <div className="bg-white rounded-2xl border border-border p-2 flex flex-col sm:flex-row gap-2 mb-8">
        <div className="flex items-center flex-1 gap-2 px-3 py-2.5 rounded-xl">
          <Search className="h-4 w-4 text-muted shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Job title, keyword or company"
            className="w-full text-sm text-ink placeholder:text-muted outline-none"
          />
        </div>
        <div className="hidden sm:block w-px bg-border my-1" />
        <div className="flex items-center flex-1 gap-2 px-3 py-2.5 rounded-xl">
          <MapPin className="h-4 w-4 text-muted shrink-0" />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Location"
            className="w-full text-sm text-ink placeholder:text-muted outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          className="bg-brandGreen text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-darkGreen transition-colors"
        >
          Search
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink mb-4">
              <SlidersHorizontal className="h-4 w-4" /> Category
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  const p = new URLSearchParams(searchParams.toString());
                  p.delete('category');
                  router.push(`/jobs?${p.toString()}`);
                }}
                className={`block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                  !catSlug ? 'bg-brandGreen/10 text-brandGreen font-semibold' : 'text-muted hover:bg-pageBg'
                }`}
              >
                All Categories
              </button>
              {(apiCategories ?? mockCategories).map((cat) => {
                const slug = 'slug' in cat ? (cat as { slug: string }).slug : null;
                return (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (slug) {
                      const p = new URLSearchParams(searchParams.toString());
                      p.set('category', slug);
                      router.push(`/jobs?${p.toString()}`);
                    }
                  }}
                  className={`flex w-full items-center justify-between text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                    catSlug === slug ? 'bg-brandGreen/10 text-brandGreen font-semibold' : 'text-muted hover:bg-pageBg'
                  }`}
                >
                  <span>{cat.label}</span>
                  {'count' in cat && cat.count ? <span className="text-xs">{cat.count}</span> : null}
                </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-ink mb-4">Job Type</h3>
            <div className="space-y-2">
              <button
                onClick={() => setType('')}
                className={`block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                  type === '' ? 'bg-brandGreen/10 text-brandGreen font-semibold' : 'text-muted hover:bg-pageBg'
                }`}
              >
                All Types
              </button>
              {jobTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                    type === t ? 'bg-brandGreen/10 text-brandGreen font-semibold' : 'text-muted hover:bg-pageBg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {apiJobs === null ? (
            <div className="rounded-xl border border-border bg-white p-12 text-center">
              <p className="text-ink font-semibold">Loading jobs…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white p-12 text-center">
              <p className="text-ink font-semibold">No jobs match your filters</p>
              <p className="text-sm text-muted mt-1">Try adjusting your search or clearing filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
