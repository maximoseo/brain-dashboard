begin;

alter table public.brain_dashboards
  add column if not exists slug text,
  add column if not exists source_repository text,
  add column if not exists deployment_platform text,
  add column if not exists deployment_project text,
  add column if not exists data_project text,
  add column if not exists runbook_url text,
  add column if not exists environment text not null default 'production';

update public.brain_dashboards set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) where slug is null;
create unique index if not exists brain_dashboards_slug_unique on public.brain_dashboards (slug);

insert into public.brain_dashboards
  (slug, name, url, category, status, owner, source_repository, deployment_platform, deployment_project, data_project, runbook_url, environment)
values
  ('rep-center', 'Rep Center', 'https://rep.maximo-seo.ai', 'Reputation', 'degraded', 'Unassigned', 'maximoseo/rep-center', 'Vercel', 'maximo-seo/rep-center', 'wtpczvyupmavzrxisvcm', null, 'production'),
  ('agentic-os', 'Agentic OS', 'https://agentic-os-dashboard.maximo-seo.ai', 'Agent operations', 'degraded', 'Unassigned', 'maximoseo/agentic-os-dashboard-render', 'Vercel', 'maximo-seo/agentic-os-dashboard', 'sunrupuwvpalipiuebcv', null, 'production'),
  ('to-do-tasks', 'To-Do Tasks', 'https://to-do-tasks.maximo-seo.ai', 'Work orchestration', 'degraded', 'Unassigned', 'maximoseo/to-do-tasks', 'Vercel', 'maximo-seo/to-do-tasks', 'wtpczvyupmavzrxisvcm', null, 'production'),
  ('github-repos-radar', 'GitHub Repos Radar', 'https://github-repos-radar.maximo-seo.ai', 'Discovery', 'degraded', 'Unassigned', 'maximoseo/github-repos-radar', 'Vercel', 'maximo-seo/github-repos-radar', 'sunrupuwvpalipiuebcv', null, 'production'),
  ('n8n-monitoring', 'n8n Monitoring', 'https://n8n-dashboard-v3.vercel.app', 'Automation reliability', 'degraded', 'Unassigned', 'maximoseo/n8n-dashboard', 'Vercel', 'maximo-seo/n8n-dashboard-v3', 'wtpczvyupmavzrxisvcm', null, 'production'),
  ('clients-automation', 'Clients & Automation', 'https://clients-automation-dashboard.vercel.app', 'Client operations', 'degraded', 'Unassigned', 'maximoseo/clients-automation-dashboard', 'Vercel', 'maximo-seo/clients-automation-dashboard', 'khfoqffoueazrmmqkxlr', null, 'production'),
  ('loop-engineering', 'Loop Engineering', 'https://loop-engineering-dashboard.vercel.app', 'Agent governance', 'degraded', 'Unassigned', 'maximoseo/loop-engineering-dashboard', 'Vercel', 'maximo-seo/loop-engineering-dashboard', 'wtpczvyupmavzrxisvcm', null, 'production'),
  ('seo-dashboard', 'SEO Dashboard', 'https://seo-dashboard.maximo-seo.ai', 'SEO portfolio', 'degraded', 'Unassigned', 'maximoseo/seo-dashboard', 'Vercel', 'maximo-seo/seo-dashboard', 'sunrupuwvpalipiuebcv', null, 'production'),
  ('central-brain', 'Central Brain', 'https://central-brain.maximo-seo.ai', 'Agent control plane', 'degraded', 'Unassigned', 'maximoseo/central-brain-dashboard', 'Vercel', 'maximoseo/central-brain-dashboard', 'sunrupuwvpalipiuebcv', null, 'production'),
  ('promptforge', 'PromptForge', 'https://prompt-forge-iota-black.vercel.app', 'Prompt operations', 'degraded', 'Unassigned', 'maximoseo/prompt-forge', 'Vercel', 'maximoseo/prompt-forge', null, null, 'production'),
  ('brain-registry', 'Brain Registry', 'https://brain-dashboard-maximo-seo.vercel.app', 'Estate registry', 'degraded', 'Unassigned', 'maximoseo/brain-dashboard', 'Vercel', null, null, null, 'production'),
  ('ai-visibility', 'AI Visibility', 'https://ai-visibility-dashboard-dun.vercel.app', 'AI visibility', 'degraded', 'Unassigned', 'maximoseo/ai-visibility-dashboard', 'Vercel', null, null, null, 'production'),
  ('site-intel', 'Site Intel', 'https://site-intel-dashboard.vercel.app', 'Site intelligence', 'degraded', 'Unassigned', 'maximoseo/site-intel-dashboard', 'Vercel', null, null, null, 'production'),
  ('wp-command-center', 'WP Command Center', 'https://wp-command-center-rosy.vercel.app', 'WordPress operations', 'degraded', 'Unassigned', 'maximoseo/wp-command-center', 'Vercel', null, null, null, 'production'),
  ('serp-rank-tracker', 'SERP Rank Tracker', 'https://serp-rank-tracker-web-production.up.railway.app', 'Rank tracking', 'degraded', 'Unassigned', 'maximoseo/serp-rank-tracker', 'Railway', 'serp-rank-tracker-web-production', 'sunrupuwvpalipiuebcv', null, 'production'),
  ('content-decay', 'Content Decay', 'https://content-decay-dashboard.vercel.app', 'Content performance', 'degraded', 'Unassigned', 'maximoseo/content-decay-dashboard', 'Vercel', null, 'sunrupuwvpalipiuebcv', null, 'production')
on conflict (slug) do update set
  name = excluded.name, url = excluded.url, category = excluded.category,
  source_repository = excluded.source_repository, deployment_platform = excluded.deployment_platform,
  deployment_project = excluded.deployment_project, data_project = excluded.data_project, environment = excluded.environment;

commit;
