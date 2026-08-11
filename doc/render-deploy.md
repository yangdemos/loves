# Render deploy notes

## Files used for deploy

- Service config: `render.yaml`
- Server entry: `server/server.js`
- Mobile page: `home.html`

## What this setup does

- Deploys the existing Node/Express service instead of a static-only site.
- Keeps media delivery on the Express static path that already serves `206 Partial Content` for ranged video requests in local verification.
- Redirects the public root URL `/` to `/home.html` on Render via `LANDING_PAGE=/home.html`.
- Disables the local self-signed HTTPS listener on Render via `ENABLE_LOCAL_HTTPS=false`.

## Render setup

1. Push the repo to GitHub.
2. In Render, create a new Blueprint and connect the repo that contains `render.yaml`.
3. Let Render create the web service from the Blueprint.
4. Wait for the first deploy to finish.
5. Open the generated public URL and confirm it lands on `/home.html`.

## Post-deploy verification

Check these items on the deployed URL:

- The root URL opens the `home.html` page.
- The background video loads from `coverr_video.mp4`.
- The video response includes ranged media support.
- On a phone browser, the background video still loops after a full cycle.

## Notes

- The local verification that already exists for this project used the Express service and confirmed ranged video responses on `coverr_video.mp4`.
- Public-domain behavior still needs one live verification after Render deploy, because that depends on the deployed environment actually serving the same route and media headers.
