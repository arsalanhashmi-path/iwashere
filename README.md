# I Was Here

A one-button global witness dashboard for a live football moment, with optional Supabase-backed live counts.

## Run locally

Because the map loads country geometry over `fetch`, serve the folder instead of opening `index.html` directly:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy fast

Deploy the whole folder as a static site on Netlify, Vercel, Cloudflare Pages, or any static host. No build step is required.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase.sql`.
3. Copy `config.example.js` to `config.js`.
4. Put your Project URL and anon public key in `config.js`.
5. Deploy the whole folder.

The anon key is safe to ship in frontend code. Witness presses happen through the `record_witness` RPC. Email signups insert into `email_signups`; public clients can insert but cannot read the email list.

If `config.js` is blank, the site falls back to realistic demo data.
