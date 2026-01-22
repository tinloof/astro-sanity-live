# Sanity + Astro Starter for Cloudflare

A modern, production-ready starter template for building fast, content-managed websites with [Astro](https://astro.build), [Sanity CMS](https://www.sanity.io), and deployed on [Cloudflare Workers](https://workers.cloudflare.com).

## Features

- **Astro 5** with SSR support for Cloudflare Workers
- **Sanity CMS** for content management
  - Headless CMS with real-time preview
  - GROQ queries for efficient data fetching
- **Cloudflare Workers** deployment for edge performance
- **React** integration for interactive components
- **Turborepo** monorepo structure for optimal DX
- **TypeScript** with auto-generated Sanity types
- **PNPM** as the package manager

## Project Structure

```
├── apps/
│   └── web/                 # Astro frontend application
│       ├── src/
│       │   ├── pages/       # Astro pages
│       │   ├── layouts/     # Layout components
│       │   └── lib/         # Utilities and Sanity client
│       ├── public/          # Static assets (including built Sanity Studio)
│       ├── dist/            # Build output for Cloudflare Workers
│       ├── astro.config.mjs # Astro configuration
│       └── wrangler.jsonc   # Cloudflare Workers configuration
│
├── packages/
│   └── sanity/              # Sanity Studio and schema definitions
│       ├── src/
│       │   ├── schema/      # Content schemas (home, documents, objects)
│       │   └── queries/     # GROQ queries
│       └── sanity.config.ts # Sanity configuration
│
├── turbo.json               # Turborepo task configuration
└── package.json             # Root workspace configuration
```

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [PNPM](https://pnpm.io/) >= 10
- A [Sanity](https://www.sanity.io) account and project
- A [Cloudflare](https://www.cloudflare.com) account (for deployment)

## Getting Started

### 1. Create Your Project

```bash
# Clone this repository
git clone <your-repo-url> my-project
cd my-project

# Install dependencies
pnpm install
```

### 2. Configure Environment Variables

The easiest way to set up your environment variables is to use the Sanity CLI. This will automatically create the necessary `.env` files with your project credentials:

```bash
# Navigate to the sanity package and run sanity init
cd packages/sanity
npx sanity@latest init --env

# Then copy the environment variables to the web app
cd ../../apps/web
cp ../../packages/sanity/.env .env.local
```

The `sanity init --env` command will:
- Prompt you to log in to your Sanity account (if not already logged in)
- Let you select an existing project or create a new one
- Write the project ID and dataset to a `.env` file

After running the command, you may need to add additional variables to `apps/web/.env.local`:

```env
NEXT_PUBLIC_SANITY_STUDIO_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_STUDIO_DATASET=production
NEXT_PUBLIC_URL=http://localhost:3000
SANITY_API_TOKEN=your_api_token
```

#### Manual Configuration (Alternative)

If you prefer to configure manually, create environment files for both the Sanity package and the web app:

**`packages/sanity/.env`**

```env
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
```

**`apps/web/.env`**

```env
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_API_VERSION=2026-01-16

# Optional: For server-side authenticated requests
SANITY_TOKEN=your_api_token
```

You can find your Project ID in the [Sanity dashboard](https://www.sanity.io/manage).

### 3. Start Development

```bash
pnpm dev
```

This will start:
- **Astro** at [http://localhost:3000](http://localhost:3000)
- **Sanity Studio** at [http://localhost:3333](http://localhost:3333)

For Cloudflare Workers local development:
```bash
pnpm wrangler:dev
```

## Available Scripts


| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps for production |
| `pnpm wrangler:dev` | Run Astro with Cloudflare Workers locally |
| `pnpm preview` | Preview production build |
| `pnpm typegen` | Generate TypeScript types from Sanity schemas |

---

## Data Fetching & Caching

This starter includes `@tinloof/sanity-astro`, a package that provides optimized data fetching with a two-level caching architecture for maximum performance on Cloudflare Workers.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser Request                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CDN Edge (Page Cache)                             │
│         CDN-Cache-Control: max-age=3600, stale-while-revalidate     │
│                                                                      │
│  • Caches full HTML responses at Cloudflare edge                    │
│  • Sub-50ms response times on cache HIT                             │
│  • Requires custom domain (not workers.dev)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │ MISS
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (Query Cache)                     │
│              Cache API with manual SWR implementation                │
│                                                                      │
│  • Caches individual Sanity query results                           │
│  • Serves stale data while revalidating in background               │
│  • Works on workers.dev domains                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │ MISS
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Sanity API                                   │
│                                                                      │
│  • Fresh data fetched via GROQ                                      │
│  • Returns syncTags for cache invalidation                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Quick Start

```typescript
// src/sanity/index.ts
import { initSanity } from '@tinloof/sanity-astro'

export const { client, loadQuery } = await initSanity({
  // Query cache: individual GROQ results (works on workers.dev)
  cache: {
    maxAge: 60 * 60 * 24,           // 1 day
    staleWhileRevalidate: 60 * 60 * 24 * 7,  // 1 week
  },
  // Page cache: full HTML responses (requires custom domain)
  pageCache: {
    maxAge: 60 * 60,                // 1 hour at CDN edge
    staleWhileRevalidate: 60 * 60 * 24,  // 1 day SWR window
    browserMaxAge: 60,              // 1 minute in browser
  },
})
```

```astro
---
// src/pages/index.astro
import { loadQuery } from '@/sanity'

const { data, cacheStatus, ms } = await loadQuery(Astro, {
  query: `*[_type == "page" && slug.current == $slug][0]`,
  params: { slug: 'home' },
})
---

<h1>{data.title}</h1>
<!-- cacheStatus: HIT | MISS | STALE | BYPASS -->
<!-- ms: time taken in milliseconds -->
```

### `loadQuery()` API

The `loadQuery()` function is the primary way to fetch data from Sanity. It handles caching, visual editing, and cache invalidation automatically.

```typescript
const result = await loadQuery<MyType>(Astro, {
  query: string,           // GROQ query
  params?: QueryParams,    // Query parameters
  cache?: CacheOptions | false,      // Query cache options
  pageCache?: PageCacheOptions | false,  // Page cache options
})
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T` | The query result |
| `perspective` | `'published' \| 'drafts'` | Current perspective |
| `cacheStatus` | `'HIT' \| 'MISS' \| 'STALE' \| 'BYPASS'` | Query cache status |
| `cacheAge` | `number \| undefined` | Age of cached data in seconds |
| `tags` | `string[] \| undefined` | Sanity syncTags for invalidation |
| `ms` | `number` | Time taken in milliseconds |

### Cache Options

#### Query Cache (CacheOptions)

Controls the Cloudflare Cache API for individual query results.

```typescript
{
  maxAge?: number,              // Fresh duration (default: 1 day)
  staleWhileRevalidate?: number, // SWR window (default: 1 week)
  keyPrefix?: string,           // Cache key prefix (default: 'sanity')
}
```

#### Page Cache (PageCacheOptions)

Controls CDN edge caching via response headers. **Requires a custom domain with Cloudflare proxy enabled.**

```typescript
{
  maxAge?: number,              // CDN cache duration (default: 1 hour)
  staleWhileRevalidate?: number, // CDN SWR window (default: 1 day)
  browserMaxAge?: number,       // Browser cache (default: 60 seconds)
  disabled?: boolean,           // Disable page caching
}
```

### Disabling Cache Per-Request

```typescript
// Disable query cache only
const result = await loadQuery(Astro, {
  query: MY_QUERY,
  cache: false,
})

// Disable page cache only
const result = await loadQuery(Astro, {
  query: MY_QUERY,
  pageCache: false,
})

// Custom cache settings for this query
const result = await loadQuery(Astro, {
  query: MY_QUERY,
  cache: { maxAge: 60, staleWhileRevalidate: 300 },
  pageCache: { maxAge: 300, browserMaxAge: 30 },
})
```

### Cache Invalidation with SanityLive

The `<SanityLive />` component provides real-time cache invalidation when content changes in Sanity.

```astro
---
// src/layouts/Layout.astro
import { SanityLive } from '@tinloof/sanity-astro/live'
---

<html>
  <body>
    <slot />
    <SanityLive client:only="react" />
  </body>
</html>
```

**How it works:**

1. SanityLive connects to Sanity's live events API
2. When content changes, Sanity sends the affected `syncTags`
3. SanityLive calls the purge endpoint (`/api/sanity/purge`)
4. The purge endpoint clears both query cache and page cache entries
5. The page refreshes with fresh data

**Response headers set by loadQuery():**

| Header | Value | Purpose |
|--------|-------|---------|
| `CDN-Cache-Control` | `public, max-age=3600, stale-while-revalidate=86400` | Cloudflare edge caching |
| `Cache-Control` | `public, max-age=60, must-revalidate` | Browser caching |
| `X-Sanity-Tags` | `s1:abc123,s1:def456` | Debug: Sanity syncTags |

### Visual Editing

Visual editing is automatically supported. When the `sanity-visual-editing` cookie is set:

- Query cache is bypassed
- Page cache headers are not set
- Draft content is fetched with stega encoding
- Content can be clicked to open in Sanity Studio

### Custom Domain Requirement

**Important:** Page-level CDN caching via `CDN-Cache-Control` headers only works with a custom domain proxied through Cloudflare.

| Domain Type | Query Cache | Page Cache |
|-------------|-------------|------------|
| `*.workers.dev` | ✅ Works | ❌ Not supported |
| Custom domain (Cloudflare proxy) | ✅ Works | ✅ Works |

To enable page caching:

1. Go to Cloudflare Dashboard → Workers & Pages → Your Worker → Settings → Domains & Routes
2. Add a custom domain (e.g., `demo.yourdomain.com`)
3. Verify `cf-cache-status: HIT` appears in response headers

---

## Working with Sanity

### Schema Structure

Schemas are organized in `packages/sanity/src/schema/`:

```
schema/
├── home.ts        # Homepage document schema
└── index.ts       # Exports all schema types
```

### Adding New Content Types

1. Create a new schema file in `packages/sanity/src/schema/`:

```typescript
// src/schema/page.ts
import { defineField, defineType } from "sanity";

export default defineType({
  name: "page",
  title: "Page",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      title: "Title",
    }),
    defineField({
      name: "content",
      type: "text",
      title: "Content",
    }),
  ],
});
```

2. Export it from `packages/sanity/src/schema/index.ts`:

```typescript
import home from "./home";
import page from "./page";

export default [home, page];
```

3. Run `pnpm typegen` to update TypeScript types

### Writing GROQ Queries

Define queries in `packages/sanity/src/queries/index.ts`:

```typescript
export const HOME_QUERY = `*[_type == "home"][0] {
  title,
  description
}`;
```

---

## Deployment

### Cloudflare Workers

1. Build the project:
```bash
pnpm build
```

2. Deploy to Cloudflare:
```bash
cd apps/web
npx wrangler deploy
```

The Sanity Studio is built and deployed as part of the Astro app at `/cms`.

### Environment Variables for Production

Set these in your Cloudflare Workers dashboard:

```env
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_API_VERSION=2026-01-16
SANITY_TOKEN=your_api_token
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
```

---

## Resources

- [Astro Documentation](https://docs.astro.build)
- [Sanity Documentation](https://www.sanity.io/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers)
- [Turborepo Documentation](https://turbo.build/repo/docs)

## License

MIT
