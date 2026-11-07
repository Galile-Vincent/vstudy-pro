# Legal pages: owner checklist

The Terms of Service and Privacy Policy live in `apps/website/src/data/legal-{en,zh-Hant,ja}.ts` and render at `/<lang>/terms/` and `/<lang>/privacy/`. English is the source of truth. A build check fails if the three languages differ in sections, block types, list lengths, table sizes, owner-confirm markers, or link targets.

Anything in this list that is not yet decided renders on the page as highlighted text. Search the data files for `[[` to find every marker, and `apps/website/src/config.ts` for every `TODO:` value. This is a drafting aid and not legal advice. A lawyer should review both pages before the app ships with analytics.

## Placeholders that render on the page

| Item | Where | What to do |
|---|---|---|
| Contact email | `CONTACT_EMAIL` in `apps/website/src/config.ts` and `PRIVACY_EMAIL` in `apps/desktop/src/shared/website.ts` | Done: vincent@vcstudio.app, forwarded by Cloudflare Email Routing. Keep the two constants equal. |
| Governing law and venue | `GOVERNING_LAW` in `config.ts`, used by Terms, "Governing law and general terms" | Replace with a sentence fragment such as "the laws of Taiwan, and the courts of ... have jurisdiction". The sentence is "These terms are governed by {{law}}." in all three languages, so check the grammar of the fragment per language. |
| Who "we" are | Privacy, "Who we are" | Replace the marker with the legal name or entity that decides what is collected. The page cannot name a controller until you do. |
| Retention periods (proposal) | Privacy, "How long we keep data" | Proposed: analytics events 12 months, then deleted. Confirmed newsletter subscription until unsubscribe, then address removed within 30 days apart from a minimal opt-out record. Unconfirmed sign-ups 7 days. Confirm or change each, then remove the proposal marker. Also configure PostHog and Resend to match. |
| Response time | Privacy, "Your rights and choices" | Proposed 30 days. Confirm you can meet it. |
| Installation ID visible in the app | Privacy, "Your rights and choices" | A deletion request needs the installation ID because analytics holds no name or email. The spec does not say where the user can read it. Add it to Settings > Privacy or change the page. |
| Re-consent on change | Privacy, "Changes to this policy" | The page promises to ask again when a new kind of data is collected. The app needs a consent version number to do that. |
| Permission to use the app | Terms, "License and source code" | The repository has no `LICENSE` file (see README). The Terms grant a personal, revocable permission to use official builds, and say the source is not under an open-source license. Pick a license, or confirm this wording. If you add a license, update that section. |

## Spec versus brief: the spec won

The analytics spec (`§3`, `§12`) lists these device properties: OS family, OS version, app version, language, and in performance samples startup time and coarse memory. The brief for these pages also listed CPU architecture, CPU-core and display buckets, and the Electron version. Those three are not in the spec, so the Privacy Policy does not mention them. If you do collect them, add this to the "Installation and device" row in all three languages: "CPU architecture, coarse CPU-core and screen-size buckets, and the Electron version." If you do not, nothing changes. The policy and the implementation must match either way.

## Claims the implementation must make true

The Privacy Policy states these as fact. Each comes from the spec, and each needs a check or test before release.

- Analytics is off until the user opts in. No event is sent before the choice, and onboarding completes without opting in.
- PostHog autocapture, session replay, and prompt or completion body capture are disabled.
- GeoIP is disabled. The IP address is not stored as an event property. Consider enabling PostHog's "discard client IP data" setting, then the policy can say the IP address is not stored at all.
- Events pass an allow-listed schema. Unexpected fields, such as text, are rejected before sending.
- Turning analytics off stops sending immediately. Events created while off are not sent after re-enabling. No "disabled" event is sent after opt-out.
- The installation ID is random, local, never derived from hardware, and not recreated from a fingerprint if deleted.
- Analytics receives only `email_provided` and `updates_opted_in` as booleans. The address never reaches PostHog.
- The newsletter checkbox is unchecked by default. Sign-up uses double opt-in, every email has one-click unsubscribe, and withdrawal is independent of analytics. The address and consent record live in a separate service that forwards to Resend. Say which service hosts it when you name your processors.
- Reports by school leave out very small groups, and access to single-installation history is restricted.
- The school, when known, is a canonical institution key. No Moodle hostname, user ID, name, or student number is sent.

## Decisions I made that you may want to change

- The Privacy Policy treats Taiwan's Personal Data Protection Act as the baseline and lists the notice items from it by section link. It claims no certification and no GDPR compliance. It says consent is the basis for analytics and the newsletter.
- It names PostHog (US cloud, `us.i.posthog.com`) and Resend, states that data goes to the United States, and does not claim any transfer mechanism. Verify PostHog's and Resend's data processing terms and add the mechanism if you want to state one.
- Minors: the policy asks anyone below the age of consent where they live to involve a parent or guardian and gives no fixed age. A lawyer may want a number.
- The website section states that the site has no analytics or cookies and stores two items in the browser (`vstudy-scheme`, and a session flag for the intro animation). It states that the site is hosted on GitHub Pages. If the hosting changes, update it.
- Terms limit total liability to what the user paid, which is nothing, and keep a carve-out for liability the law does not allow to be limited. A Taiwan lawyer should check this against consumer-protection and standard-contract rules.

## Housekeeping

- Native-speaker review of the Japanese and Traditional Chinese text is still required, as `docs/i18n-glossary.md` says for all translations.
- The README, the home page, and the docs "Privacy and network" guide now describe optional analytics in the present tense. Release them together with the analytics implementation, not before.
- The docs guide "Privacy and network" is English only, like most guides. It falls back with the existing notice.
- READMEs say the website publishes the policies, but do not link them because the Pages URL depends on deployment. Add the link after the site is live.
- Update `LEGAL_UPDATED` in `config.ts` whenever either page changes in substance.
