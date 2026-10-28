# Night-time "LearnMate is sleeping" page

The EC2 server is switched off at night to save money. While it's off, nothing
on it can answer, so visitors would see a browser error. `night-worker.js` is a
free Cloudflare Worker that sits in front of `srvlearnmate.in` and:

- **10 PM to 6 AM (India time):** shows a fun "LearnMate is sleeping" page with
  a countdown to 6 AM, without contacting the server.
- **During the day:** passes everything through to the server as normal. If the
  server isn't answering (still starting, or down), it shows a
  "LearnMate is taking a quick nap, be right back" page instead.
- **`/api/...` requests:** get a short JSON message instead of the page.

Preview the pages any time by adding `?sleep-preview=night` or
`?sleep-preview=down` to the address, e.g. `https://srvlearnmate.in/?sleep-preview=night`.

To change the hours, edit `OPEN_AT` and `CLOSE_AT` at the top of the file. Keep
them in step with the EC2 start/stop schedule (start EC2 a few minutes before `OPEN_AT`).

## One-time setup (about 20 minutes)

### 1. Add the domain to Cloudflare

1. Cloudflare dashboard → **Add a domain** → type `srvlearnmate.in` → choose the **Free** plan.
2. Cloudflare copies your existing DNS records. Check that there is an **A record**
   for `srvlearnmate.in` pointing at the EC2 server's IP, with the cloud **orange**
   ("Proxied"). Do the same for `www` if you use it. Leave any MX/TXT (email) records as they are.
3. Cloudflare shows **two nameservers** (like `xxx.ns.cloudflare.com`). Keep that page open.

### 2. Point GoDaddy at Cloudflare

1. GoDaddy → **Domain** → `srvlearnmate.in` → **DNS** → **Nameservers** → **Change nameservers**.
2. Choose **I'll use my own nameservers**, enter the two Cloudflare nameservers, save.
3. It usually takes minutes, sometimes up to a day. Cloudflare emails you when the domain is **Active**.

### 3. HTTPS setting

Cloudflare → `srvlearnmate.in` → **SSL/TLS** → **Overview** → choose **Full (strict)**.
(If the site shows a 526 error afterwards, choose **Full** instead.)

### 4. Create the Worker

1. Cloudflare → **Compute** → **Workers & Pages** → **Create** → **Start with Hello World** →
   name it `learnmate-night` → **Deploy**.
2. **Edit code** → delete everything → paste the whole of `night-worker.js` → **Deploy**.

### 5. Attach it to the website

1. Open the `learnmate-night` Worker → **Settings** → **Domains & Routes** → **Add** → **Route**.
2. Zone: `srvlearnmate.in`, Route: `srvlearnmate.in/*` → **Add route**.
   Add `www.srvlearnmate.in/*` too if the site is used with `www`.

### 6. Test

- `https://srvlearnmate.in/?sleep-preview=night` shows the sleeping page.
- During the day, the site works as normal.
- After 10 PM, the site shows the sleeping page even with EC2 off.

## Things to know

- **Upload limit:** Cloudflare's free plan accepts uploads up to **100 MB** per
  file. Larger textbooks will be refused (the upload screen says the file is too
  big). To allow bigger ones later, uploads can go to a separate address that
  bypasses Cloudflare.
- **Server IP:** if the EC2 server's public IP changes when it restarts (no
  Elastic IP), the A record in Cloudflare has to be updated each time. With an
  Elastic IP it never changes.
- **Cost:** free. The Workers free plan allows 100,000 requests a day.
