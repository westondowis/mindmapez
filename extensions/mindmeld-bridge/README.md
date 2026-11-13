# MindMeld Bridge (Chrome, MV3)

Runs browser actions you approved in MindMeld on sites with no API (Facebook, etc.).

1. In MindMeld → Connectors, create a connector, give its scope **Act**, and list the
   websites it may use (e.g. `facebook.com`). Copy its `mm_` token.
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
3. Open the extension, enter your MindMeld URL and the token, Save, then **Allow site** for each website.
4. An agent proposes an action with `propose_action` (kind `browser`). Approve it under
   **Apps & actions**; the extension picks it up within a minute (or **Check now**).

Guards: server returns only approved actions for this connector's allowed domains; the
extension re-checks https + exact host, needs Chrome's per-site permission, and stops if the
page redirects off-host. It never reads cookies or storage.
