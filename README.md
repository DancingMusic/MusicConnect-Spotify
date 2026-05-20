# @dancingmusic/music-connect-spotify

Spotify connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

Uses the official [Spotify Web API](https://developer.spotify.com/documentation/web-api) for search + track metadata. Returns the 30-second `preview_url` field every search result carries — **full-length playback requires Spotify Premium + the [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)** which has to be embedded by the host app with user OAuth scopes (this connector deliberately stops at the preview boundary).

## Setup

Spotify requires a Bearer token on every API request. You have two options:

### Option A — paste a short-lived access token

1. Register an app at https://developer.spotify.com/dashboard, grab the client ID + secret.
2. From a terminal (or your backend), exchange them for a token:
   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=...&client_secret=..."
   ```
3. Open the music store → connector switcher → **添加连接器** → **GitHub** → paste `https://github.com/DancingMusic/MusicConnect-Spotify`.
4. After load, click the gear icon and put the token into `accessToken` config (tokens last ~1 hour).

### Option B — point at your own token endpoint (recommended for long sessions)

Run a tiny backend that proxies `accounts.spotify.com/api/token` (the endpoint doesn't send CORS headers, so direct browser calls are blocked). Configure `tokenUrl` in the connector — the connector will lazy-refresh.

## Track ID format

`spotify:<base62-id>` (e.g. `spotify:11dFghVXANMlKmJXsNCbNl`). Also accepts the canonical Spotify URI form `spotify:track:<id>`.

## API endpoints used

- `GET /v1/search?type=track` — keyword search
- `GET /v1/tracks/{id}` — track detail + preview URL

## License

MIT
