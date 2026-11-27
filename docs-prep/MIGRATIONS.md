# Database migrations (manual, not part of the Netlify build)

Why: the old vercel.json build ran `prisma migrate deploy` on every deploy, so any merged
migration changed the production database automatically. On Netlify the build does not do that.

Before the first production deploy, and before each deploy that adds a file under prisma/migrations:

1. In Neon, create a branch or snapshot of the production database. Confirm it exists.
2. From a trusted machine, set DIRECT_DATABASE_URL (the Neon direct, non-pooler endpoint) in your shell only.
3. Run `npx prisma migrate status`. Read the output.
4. Run `npx prisma migrate deploy` only if the pending list is what you expect.
5. Deploy.

Never paste a database URL into chat, a commit or this file.
