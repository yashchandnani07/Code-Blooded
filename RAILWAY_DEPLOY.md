# Deploy Lumina API Backend to Railway

## Prerequisites
1. Railway account (https://railway.app)
2. GitHub repo connected to Railway
3. Supabase project with database
4. Clerk account for authentication
5. Groq API key for LLM features

## Deployment Steps

### 1. Connect Repository to Railway
- Go to https://railway.app/dashboard
- Click "New Project" → "Deploy from GitHub repo"
- Select this repository
- Railway will detect the `railway.json` and use the Dockerfile

### 2. Set Environment Variables
In Railway Dashboard → Variables, add all variables from `railway.env.example`:

**Required:**
- `DATABASE_URL` - Supabase PostgreSQL direct connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase publishable key
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `CLERK_SECRET_KEY` - Clerk secret key
- `GROQ_API_KEY` - Groq API key for LLM features

**Optional:**
- `HF_TOKEN` - HuggingFace token (for model downloads if needed)
- `NEXT_PUBLIC_API_URL` - Will be auto-set to your Railway app URL

### 3. Configure Database
Run the database migrations in Supabase SQL Editor:
1. `database_schema_postgres.sql` - Main schema
2. `supabase_migration.sql` - Additional migrations

### 4. Build HPO Embeddings Index (Optional)
For semantic HPO matching, run locally and commit the cache:
```bash
cd apps/api
uv run python -m scripts.build_hpo_index
```
This creates `packages/scoring/hpo_embeddings.json` which will be included in the Docker image.

### 5. Deploy
Railway will automatically build and deploy. Check logs for any issues.

### 6. Verify Deployment
- Health check: `https://your-app.railway.app/health`
- API docs: `https://your-app.railway.app/docs`

## Troubleshooting

**Build fails:**
- Check Railway build logs
- Ensure all dependencies in `pyproject.toml` are compatible with Python 3.13

**App crashes on startup:**
- Check Railway deploy logs
- Verify `DATABASE_URL` is correct and accessible
- Ensure Supabase database has the required tables

**Health check fails:**
- The `/health` endpoint checks database connectivity
- Verify database is accessible from Railway's network

## Local Development
```bash
cd apps/api
cp .env.local.example .env.local  # Edit with your keys
uv sync
uv run uvicorn main:app --reload --port 8000
```