# Update privacy

App update checks are on by default and can be disabled in Settings > General.
Each check sends a GET to the fixed GitHub release feed's latest-mac.yml (Mac) or
latest.yml (Windows). No identifiers, credentials, documents, account details or
request body are sent. GitHub sees standard connection metadata, including IP
address, and may redirect to its release CDN. No staging identifier is sent.

Only choosing Download fetches the update payload from the release/CDN. Opening
What's new uses the existing external-browser confirmation. These requests are
separate from optional analytics and AI tool updates. See [UPDATES.md](UPDATES.md)
for supported installs, scheduling, consent and verification limitations, and
[GUIDE.md](GUIDE.md#privacy-and-network) for the app's other network behavior.
