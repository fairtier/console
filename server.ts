import {serve} from "bun";

const PORT = Bun.env.PORT || 3000;

// Runtime configuration. VITE_* is baked into the bundle at build time, so
// one image cannot carry a per-workspace API or Casdoor URL. Those come from
// FT_* env at deploy time instead, served to the SPA as /config.json.
//
// The FT_ prefix is deliberately not VITE_: reusing it would let a variable
// look set while never having been compiled in.
//
// All of them are required: the image ships neutral, so a missing FT_* does
// not mean "use a default" — it means the SPA would run with an empty API URL
// or start a login against no Casdoor at all. Refuse to serve rather than
// misbehave.
const required = [
    "FT_WORKSPACE_API_URL",
    "FT_AUTH_URL",
    "FT_AUTH_CLIENT_ID",
    "FT_AUTH_REDIRECT_URI",
    "FT_AUTH_ORGANIZATION",
];
const missing = required.filter((name) => !Bun.env[name]);
if (missing.length > 0) {
    console.error(
        `missing required configuration: ${missing.join(", ")} — refusing to start.`,
    );
    process.exit(1);
}

const AUTH_URL = Bun.env.FT_AUTH_URL!;
// The Casdoor application name used for the password-reset deep link.
const AUTH_CLIENT_APP = Bun.env.FT_AUTH_CLIENT_APP || "console";

const RUNTIME_CONFIG = {
    workspaceApiUrl: Bun.env.FT_WORKSPACE_API_URL,
    authUrl: AUTH_URL,
    authClientId: Bun.env.FT_AUTH_CLIENT_ID,
    authRedirectUri: Bun.env.FT_AUTH_REDIRECT_URI,
    authOrganization: Bun.env.FT_AUTH_ORGANIZATION,
    // Where "Account & Billing" lives when this workspace is managed by a
    // hosting provider. Self-hosters leave it unset and the link is hidden.
    accountUrl: Bun.env.FT_ACCOUNT_URL ?? null,
    // Error tracking. No DSN is baked into the bundle, so a deployment only
    // reports when it sets this — a self-hoster's browser errors are nobody
    // else's to collect. Empty string is the documented off switch.
    sentryDsn: Bun.env.FT_SENTRY_DSN ?? null,
};

serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        // 1. Try to serve static files from the /dist folder
        const file = Bun.file(`./dist${path}`);
        if (await file.exists()) {
            return new Response(file);
        }

        // 2. Runtime configuration for the SPA. Read once before mount; must
        // never be cached, or a redeployed workspace would serve a stale API
        // URL.
        if (path === "/config.json") {
            return Response.json(RUNTIME_CONFIG, {
                headers: { "Cache-Control": "no-store" },
            });
        }

        if (path === "/healthz") {
            return Response.json({status: "ok", time: new Date().toISOString()});
        }
        if (path === "/readyz") {
            return Response.json({status: "ok", time: new Date().toISOString()});
        }

        // /.well-known/change-password (W3C spec) — password managers
        // (Apple Keychain, 1Password, Chrome) deep-link to this URL from the
        // saved-password UI. Casdoor owns credentials, so redirect to its
        // password reset flow.
        if (path === "/.well-known/change-password") {
            return Response.redirect(`${AUTH_URL}/forget/${AUTH_CLIENT_APP}`, 302);
        }

        // 3. SPA Fallback: If no file is found, serve index.html
        // This allows Vue Router to handle paths like /pipelines or /catalog
        return new Response(Bun.file("./dist/index.html"));
    },
});

console.log(`🌐 Workspace Console ready at http://localhost:${PORT}`);
