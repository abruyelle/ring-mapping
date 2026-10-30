# Ring Mapping

Installable web app for tracking tunnel rings: developed map of the rings, defect mark-up, PDF report and Excel sheet.
It works on PC, phone and tablet, and offline once installed. It is a static site with no build step and no server.

Nothing about a given project is stored in this repository. Each project is described by a project file
(tunnels, ring counts, segments, key positions, ring types), created in the app or imported from a
`.ringproject.json` file. Several projects can live on one device.

## Data
- Project data stays on each device (IndexedDB) and on the project server. It never goes to the site hosting the app.
- Guidance data comes from a ring file (`.csv`) imported in the app. Column names are set in the project file.
- **Export data** creates a file to upload to the project server. **Import / merge** adds someone else's file: the most recent version of each record is kept, and deleted defects stay deleted.
- iOS may clear the data of an app that is not installed on the Home Screen: install it and export regularly.

## Hosting (HTTPS is required for install and offline use)
Copy these files to any static HTTPS host, for example GitHub Pages or a company web server:
`index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icon-*.png`, `js/`, `lib/`.
Serve `.webmanifest` as `application/manifest+json`.

## Installing
- **iPhone / iPad (Safari):** open the URL, Share button, "Add to Home Screen".
- **Android (Chrome):** open the URL, menu, "Install app".
- **PC (Edge / Chrome):** open the URL, install icon in the address bar.
Open it once while online; after that it works offline.

## Updating
Change `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js`. Devices update the next time the app is opened online.

## Development
- Run locally: `npm start` (http://localhost:5180)
- Tests: `npm test`, then `node tests/e2e.mjs <output folder> <project file> <ring file>` with `PLAYWRIGHT_CORE` set
- `tools/build-demo.mjs` builds a one-file demo that opens with a double click and saves nothing

## Security notes
- Whoever can push to the hosting repository can change the app on every device: use a dedicated account with two-factor authentication.
- Never commit project files, ring files or exported data. `private/` and `dist/` are ignored by git.
