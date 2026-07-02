import { API_URL } from './config';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export type ApiJob = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  location: string;
  type: 'FULL_TIME' | 'PART_TIME' | 'REMOTE' | 'HYBRID' | 'CONTRACT';
  categoryId: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  deadline: string | null;
  status: string;
  featured: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  urgent: boolean;
  vacancies: number | null;
  yearsOfExperience: string | null;
  companyName: string | null;
  companyLogo: string | null;
  category: {
    id: string;
    slug: string;
    label: string;
    icon: string | null;
  };
  company: {
    id: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    location: string | null;
    industry: string | null;
    verified: boolean;
  };
  _count: {
    applications: number;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function fetchJobs(params?: {
  q?: string;
  category?: string;
  location?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<ApiJob>> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.location) searchParams.set('location', params.location);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiFetch<PaginatedResponse<ApiJob>>(`/jobs${qs ? `?${qs}` : ''}`);
}

export async function fetchJob(id: string): Promise<ApiJob> {
  return apiFetch<ApiJob>(`/jobs/${id}`);
}
