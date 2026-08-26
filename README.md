# Homey Overview v1.0 — weekly system report by email

A HomeyScript that builds an HTML overview of your Homey Pro system —
apps, flows, logic variables, devices, Z-Wave, Zigbee — and emails it to
you. On every run it also compares against the previous run and puts a
"Summary & Actions" section at the top of the email, highlighting what
changed (new broken flows, apps that started crashing, WiFi/Ethernet
drops, new users added, etc.), so you don't have to read the whole
report every time.

The current version number is shown in the email itself, under the
title (e.g. "26 August 2026 at 09:00 — v1.0"), so you can tell at a
glance which version generated a given report.

## What you need

1. **Homey Pro**, with the **HomeyScript** app installed (App Store →
   search "HomeyScript").
2. An **email-sending app** installed on Homey that provides a flow
   action card called `sendmail` — for example the **"Email Sender" /
   "Email versturen"** app from the App Store. Any app that offers a
   generic "Send email" flow card with `mailto`, `subject`, and `body`
   fields will work; if you use a different one, see "Using a different
   email app" below.
3. An email client isn't required on your end — the script sends the
   email itself, using the email-sending app on Homey. You just need an
   inbox to receive it in (Gmail, Outlook, etc. — anything that can
   render HTML email).

## Installation

1. Open the **HomeyScript** app on Homey (in the Homey app: More →
   Apps → HomeyScript → Scripts), or use the HomeyScript web editor.
2. Create a new script, name it e.g. `homey-overview`.
3. Copy the entire contents of `homey-overview.js` into it.
4. Near the top of the script, find this line:

   ```js
   const DEFAULT_MAIL_TO = 'your.email@example.com';
   ```

   Replace `your.email@example.com` with your own email address. This
   is only the *fallback* address used if you run the script manually
   from the script editor without an argument — see the next section
   for the normal way to run it.
5. Just below that, find:

   ```js
   const TIMEZONE = 'Europe/Amsterdam';
   ```

   Change this to your own IANA timezone name (e.g. `America/New_York`,
   `Europe/London`, `Asia/Tokyo`) if you're not in the Netherlands. This
   controls the date/time shown in the email — the HomeyScript sandbox's
   default timezone can be UTC regardless of where your Homey actually
   is, so without this the displayed time can be off by a few hours.
6. Save the script. (There's also a `VERSION` constant a bit further
   down — no need to touch it unless you start modifying the script
   yourself, in which case bumping it helps you tell reports apart.)

## Running it manually (quick test)

Open the script in the HomeyScript editor and press **Run**. Since no
argument is passed, it will use `DEFAULT_MAIL_TO` from step 4 above.
Check your inbox for an email titled "Homey Overview — [date]".

## Running it automatically (recommended)

Rather than hardcoding your email address, the script reads it from a
**flow argument**, so you (or anyone else who reuses this script) never
have to edit the script itself to change the recipient.

1. Create a new **basic flow** in Homey.
2. **When:** add a time-based trigger card (e.g. "every day/week at a
   specific time" — the app you use for this depends on what you have
   installed; Homey's built-in Better Logic or a simple time card both
   work).
3. **Then:** add the HomeyScript action card **"Run script with
   argument"** (not the plain "Run script" card), choose the
   `homey-overview` script, and in the argument field enter your email
   address, e.g.:

   ```
   you@example.com
   ```

   You can pass multiple recipients separated by a comma or semicolon,
   e.g. `you@example.com, partner@example.com` — the script will send
   one email per recipient.
4. Save and enable the flow.

## What the "Summary & Actions" section does

The script stores a snapshot of your system's state (as JSON) in a
Logic variable called `Overview_previous_snapshot`. You don't need to
create this variable yourself — the script creates and updates it
automatically on every run. On the very first run there's nothing to
compare against yet, so the summary will just say so; from the second
run onward it will show what changed since the last run.

If you ever want to reset the comparison baseline (e.g. after a big
manual reorganization you don't want flagged as "changes"), just delete
the `Overview_previous_snapshot` logic variable — it will be recreated
on the next run.

Most changes are reported with the actual item name(s) in **bold**
(e.g. "2 Basic flows created since previous scan: **Flow A** and
**Flow B**") rather than just a bare count. A few categories (logic
variables, zones, total device count) are count-only, since a
meaningful name list either isn't available or isn't worth the noise.

## Toggles

At the very top of the script there's a block of `const showX = true;`
lines. Each one controls whether a particular list of names (e.g.
disabled apps, broken flows, Z-Wave battery devices) is included in
the email, or only counted. Set any of them to `false` if you want a
shorter email.

## Using a different email app

The script sends mail via this line near the bottom:

```js
await Homey.flow.runFlowCardAction({
  id: 'homey:app:email.sender:sendmail',
  args: { mailto: addr, subject: 'Homey Overview — ' + dateStr, body: html }
});
```

If you use a different email-sending app, you'll need to find its flow
action card ID and adjust the `id` and `args` here to match. You can
find installed apps' card IDs via the HomeyScript API (e.g.
`await Homey.flow.getFlowCardActions()`) or by checking the app's
documentation.

## Notes / known limitations

- Report language is English throughout.
- Requires Homey's newer `homey-api` v2 (should be the case for any
  reasonably up-to-date Homey Pro firmware). Some fields (WiFi/Ethernet
  status) may not populate on very old firmware.
- Gmail often doesn't support the in-email "back to top" anchor links;
  most other email clients do.
- Devices created by the UniFi app (network-presence "devices" for
  clients like laptops or phones) are automatically excluded from all
  counts, since they constantly appear/disappear and would flood the
  summary with noise. Harmless if you don't use the UniFi app.
- HomeyScript scripts named `__mcp_run_*` are excluded from the script
  count — these are internal leftovers from certain AI/MCP bridge
  integrations, not real user scripts. Harmless if you don't use one.

## License / sharing

Feel free to modify, extend, and re-share this script.
