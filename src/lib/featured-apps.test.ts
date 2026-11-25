import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppConnection, AppInfo } from "./connectors/outbound.ts";
import { appInitials, appState, connectionFor, FEATURED_APPS, FEATURED_SLUGS, mergeFeatured, otherApps } from "./featured-apps.ts";

const app = (slug: string, name = slug, logo: string | null = `https://logo/${slug}.png`): AppInfo => ({ slug, name, logo, description: null, categories: [] });
const conn = (app: string, active: boolean, status: string | null, accountId: string | null = active ? `ca_${app}` : null): AppConnection => ({ app, active, accountId, status });

describe("featured apps", () => {
  test("shortlist uses the Composio slugs, in order, without duplicates", () => {
    assert.deepEqual(FEATURED_SLUGS, ["googledrive", "one_drive", "gmail", "outlook", "googlecalendar", "notion", "slack"]);
    assert.equal(new Set(FEATURED_SLUGS).size, FEATURED_APPS.length);
    for (const s of FEATURED_SLUGS) assert.match(s, /^[a-z0-9_]{1,64}$/); // the connectApp validator's rule
  });

  test("merges catalog and connection state into card states", () => {
    const apps = [app("gmail"), app("googledrive"), app("one_drive", "OneDrive", null), app("outlook"), app("notion"), app("slack"), app("github")];
    const cards = mergeFeatured(apps, [
      conn("gmail", true, "ACTIVE"),
      conn("outlook", false, "INITIATED"),
      conn("notion", false, "EXPIRED"),
    ]);
    const by = Object.fromEntries(cards.map((c) => [c.slug, c]));
    assert.deepEqual(cards.map((c) => c.slug), [...FEATURED_SLUGS]);
    assert.equal(by.gmail!.state, "connected");
    assert.equal(by.gmail!.accountId, "ca_gmail");
    assert.equal(by.outlook!.state, "pending");
    assert.equal(by.notion!.state, "attention");
    assert.equal(by.googledrive!.state, "available");
    assert.equal(by.googledrive!.logo, "https://logo/googledrive.png");
    assert.equal(by.one_drive!.logo, null);
    assert.equal(by.googlecalendar!.state, "unavailable"); // not returned by listApps: rendered disabled, no crash
    assert.equal(by.googlecalendar!.accountId, null);
    assert.equal(by.slack!.accountId, null);
  });

  test("a just-opened Connect Link shows pending until the server says connected", () => {
    const apps = [app("slack")];
    assert.equal(mergeFeatured(apps, [], new Set(["slack"])).find((c) => c.slug === "slack")!.state, "pending");
    assert.equal(mergeFeatured(apps, [conn("slack", true, "ACTIVE")], new Set(["slack"])).find((c) => c.slug === "slack")!.state, "connected");
    assert.equal(appState(undefined, null, true), "unavailable");
  });

  test("an active account wins over stale ones, and active without an id isn't connected", () => {
    const c = connectionFor([conn("gmail", false, "EXPIRED"), conn("gmail", true, "ACTIVE")], "gmail");
    assert.equal(c?.accountId, "ca_gmail");
    assert.equal(appState(app("gmail"), conn("gmail", true, "ACTIVE", null)), "available");
    assert.equal(connectionFor([], "gmail"), null);
  });

  test("empty inputs are safe", () => {
    const cards = mergeFeatured([], []);
    assert.equal(cards.length, FEATURED_APPS.length);
    assert.ok(cards.every((c) => c.state === "unavailable"));
    assert.deepEqual(otherApps([]), []);
  });

  test("full list excludes featured apps and filters by name or slug", () => {
    const apps = [app("gmail", "Gmail"), app("github", "GitHub"), app("hubspot", "HubSpot"), app("slack", "Slack")];
    assert.deepEqual(otherApps(apps).map((a) => a.slug), ["github", "hubspot"]);
    assert.deepEqual(otherApps(apps, "  HUB ").map((a) => a.slug), ["github", "hubspot"]);
    assert.deepEqual(otherApps(apps, "spot").map((a) => a.slug), ["hubspot"]);
    assert.deepEqual(otherApps(apps, "slack"), []);
  });

  test("initials fallback", () => {
    assert.equal(appInitials("Google Drive"), "GD");
    assert.equal(appInitials("Slack"), "S");
    assert.equal(appInitials("microsoft  one-drive"), "MO");
    assert.equal(appInitials("  "), "?");
  });
});
