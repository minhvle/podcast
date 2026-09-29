# Podcasts Progressive Web App

An installable podcast PWA inspired by the supplied reference UI.

## Deploy to GitHub Pages

1. Create a GitHub repository and copy the contents of this folder into its root.
2. Commit and push to the `main` branch.
3. Open **Repository Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Run the included **Deploy Podcasts PWA to Pages** workflow, or push another commit.

The published URL will normally be `https://YOUR-NAME.github.io/REPOSITORY/`. All manifest, service-worker, icon, and application paths are relative so project-site subdirectories work correctly.

## Run locally

Service workers require HTTP or HTTPS; do not open `index.html` using a `file://` URL.

1. Run `python3 -m http.server 8080` in this folder.
2. Open `http://localhost:8080` in Chrome or Edge.
3. Select **Install app** when offered, or use the browser's install control.

GitHub Pages cannot proxy RSS feeds. The app first requests each feed directly, then uses the CORS-enabled fallback services configured in `config.js`. For a heavily used public deployment, replace those services with a proxy you control.

If RSS access is blocked, the app also resolves the show through Apple Podcasts and loads its current episode catalogue. This fallback runs during refresh and when a Library card's **View** button is opened with no cached episodes.

## Included interactions

- Switch between Inbox, Queue, Library, Starred, Search, and Profile views.
- Search episode titles and shows.
- Click **Add podcast**, search the Apple Podcasts catalogue, or paste a direct RSS feed URL and add the show.
- **Inbox** displays only the newest available episode from each podcast show in Library.
- **Library** uses the show cards from v1.6.0: one card per podcast with creator, episode count, and a **View** button. Library itself contains no episode rows.
- Select **Unsubscribe** on a Library card to remove the podcast and all of its cached episodes from the app after confirmation.
- Selecting **View** opens all available episodes for that podcast in Inbox; the normal unfiltered Inbox still shows only the newest episode from each show.
- Import and export podcast subscriptions as an OPML file. OPML contains one show record per podcast (name and RSS feed) and does not contain episode links.
- Subscribed feeds refresh automatically at startup, with a manual **Refresh shows** action in Library. RSS, Atom, enclosure links, and common `media:content` audio feeds are supported.
- Filter to unplayed episodes.
- Click an episode to stream its real podcast audio in the playback bar.
- Starred, queue, subscriptions, and cached episode metadata persist in browser storage.
- Use an episode's three-dot menu to star/unstar it, open its audio download, or delete it from the app.

There are no bundled sample podcasts or audio files. Every show is added through Search, a direct RSS URL, or OPML import. Playback requires an internet connection because podcast publishers host their feeds and audio across many different domains.
