# Selah — A quiet place for Scripture

A calming and responsive Bible reader built with **HTML, CSS and JavaScript**. No npm, API key, account, build tools, or backend required.

## Features

- Browse all 66 books of the Protestant Bible (Old and New Testament).
- Select a book, chapter, or verse; navigate to preceding/following chapters.
- Search by **Bible reference**: `John 3:16`, `Psalm 23`, or `Romans 8:28-30`.
- Find a **word or phrase inside the currently open chapter**, with highlights and match counts.
- Choose World English Bible (WEB), King James Version (KJV), American Standard Version (ASV), Bible in Basic English (BBE), or Darby Bible.
- Daily verse (selected by date, text fetched from the API).
- Save favorite verses to local storage, copy and share verses.
- Choose text size, show/hide verse numbers, and switch to an evening reading theme.
- Responsive book navigation drawer on mobile, bookmark navigation, shareable URL hashes.

## Run locally

Open `index.html` in a browser with an internet connection. For the most consistent local experience, run a local static server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000/ in your browser. Scripture text loads from the public Bible API, so internet access is required for chapters you have not already opened in the current tab.

## Upload to GitHub

1. Go to https://github.com/ and select **New repository**.
2. Name it `selah-bible-app` and create it.
3. Select **Add file → Upload files**.
4. Upload the **contents** of this folder to the **repository root**, so `index.html`, `styles.css`, and `script.js` are all visible without clicking into an extra folder.
5. Click **Commit changes**.

## Deploy to Vercel

1. Go to https://vercel.com/ and sign in with GitHub.
2. Select **Add New → Project**. If requested, **install the Vercel GitHub App** and grant access to the `selah-bible-app` repository.
3. Import your repository.
4. Choose **Framework Preset: Other** and **Root Directory: `./`**. No build command or environment variables are needed for this static site (disable an auto-populated build command if necessary).
5. Click **Deploy**. Your app will receive a `.vercel.app` address. GitHub commits will trigger new deployments.

## API details and limitations

Uses https://bible-api.com/ (created by Tim Morgan) with CORS enabled:

- `GET /data/web` — list available books
- `GET /data/web/JHN` — list chapters for John
- `GET /data/web/JHN/3` — get John chapter 3 verses
- `GET /john+3:16?translation=web` — lookup a verse by typed reference

No API key is needed. The Bible API's free endpoint is **rate-limited to 15 requests every 30 seconds per IP** (as documented at https://bible-api.com/), so rapidly opening many uncached chapters may temporarily return an error; pause and retry. Results are cached in memory for the current browser tab to reduce calls.

**Search distinction:** bible-api.com supports **reference lookups**, not whole-Bible keyword search. The "Find in this chapter" box searches only the loaded chapter text. This app never claims to offer global phrase search. The app does not include a downloadable Bible; passages are fetched on demand. Translations are limited to editions supported by the API and must respect source licensing. This app stores bookmarks and preferences **only in the local browser**. It doesn't sync across devices.

## Project files

```
selah-bible-app/
├── index.html      Main interface
├── styles.css      Calm responsive design + evening theme
├── script.js       Bible API, navigation, search, bookmarks, settings
├── favicon.svg     Leaf-shaped app icon
└── README.md       This file
```

Made for personal Bible study and quiet reading.
