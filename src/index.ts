/**
 * Spotify connector for DancingMusic.
 *
 * Uses the official Spotify Web API:
 *   - GET /v1/search       — track search
 *   - GET /v1/tracks/{id}  — track detail
 *
 * IMPORTANT: full-length playback requires a Spotify Premium subscription
 * AND the Spotify Web Playback SDK (which has to be embedded with user
 * OAuth scopes). This connector returns the 30-second `preview_url` field
 * that Spotify ships with every search result — same constraint that
 * applies to iTunes Search.
 *
 * Authentication: Spotify requires a Bearer token on every request. Two
 * supported config shapes:
 *   1. `accessToken: string` — opaque token your app already obtained
 *      (e.g. via your own auth-code or client-credentials backend).
 *   2. `tokenUrl: string` — URL your backend exposes that returns
 *      `{ access_token: "...", expires_in: 3600 }` (lazy-refresh).
 *
 * Direct client-credentials from the browser is NOT supported because
 * `accounts.spotify.com/api/token` doesn't send CORS headers — proxy it
 * through your own backend.
 *
 * Track ID format: `spotify:<base62-id>`
 */
import type {
  MusicConnector,
  MusicConnectorMeta,
  MusicListQuery,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
} from "@dancingmusic/music-store";

export interface SpotifyConfig {
  accessToken?: string;
  tokenUrl?: string;
}

interface SpotifyArtist { name: string; }
interface SpotifyAlbum { name?: string; images?: Array<{ url: string }>; }
interface SpotifyTrack {
  id: string;
  name: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms?: number;
  preview_url?: string | null;
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrack[];
    total?: number;
  };
}

const API = "https://api.spotify.com/v1";

function toTrack(t: SpotifyTrack): MusicTrack {
  return {
    id: `spotify:${t.id}`,
    title: t.name,
    artist: (t.artists ?? []).map(a => a.name).join(", ") || "Unknown",
    album: t.album?.name,
    coverUrl: t.album?.images?.[0]?.url,
    durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : 0,
    price: 0,
    currency: "USD",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
  };
}

export class SpotifyConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "spotify",
    name: "Spotify",
    description: "Spotify Web API — search + 30s previews",
    version: "0.1.0",
    capabilities: ["search", "stream"],
  };

  private config: SpotifyConfig = {};
  private cachedToken: { value: string; expiresAt: number } | null = null;

  async init(config?: Record<string, unknown>): Promise<void> {
    this.config = (config as SpotifyConfig) || {};
    if (!this.config.accessToken && !this.config.tokenUrl) {
      console.warn(
        "[SpotifyConnector] Neither accessToken nor tokenUrl configured. " +
        "Configure one in the connector switcher before searching.",
      );
    }
  }

  private async getToken(): Promise<string> {
    if (this.config.accessToken) return this.config.accessToken;
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }
    if (!this.config.tokenUrl) {
      throw new Error("Spotify connector requires accessToken or tokenUrl in config");
    }
    const res = await fetch(this.config.tokenUrl);
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    const ttl = (data.expires_in ?? 3600) * 1000;
    this.cachedToken = { value: data.access_token, expiresAt: now + ttl };
    return data.access_token;
  }

  private async authFetch(url: string): Promise<Response> {
    const token = await this.getToken();
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = (query.keyword || "").trim();
    const pageSize = Math.min(query.pageSize ?? 30, 50);
    const page = query.page ?? 1;
    const offset = (page - 1) * pageSize;
    if (!keyword) return { tracks: [], total: 0, page, pageSize };

    const params = new URLSearchParams({
      q: keyword,
      type: "track",
      limit: String(pageSize),
      offset: String(offset),
    });
    const res = await this.authFetch(`${API}/search?${params}`);
    if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
    const data = (await res.json()) as SpotifySearchResponse;
    const items = data.tracks?.items ?? [];
    return {
      tracks: items.map(toTrack),
      total: data.tracks?.total ?? items.length,
      page,
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await this.authFetch(`${API}/tracks/${id}`);
    if (!res.ok) return null;
    return toTrack((await res.json()) as SpotifyTrack);
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await this.authFetch(`${API}/tracks/${id}`);
    if (!res.ok) return null;
    const t = (await res.json()) as SpotifyTrack;
    if (!t.preview_url) return null;
    return { url: t.preview_url, format: "mp3" };
  }

  private parseId(trackId: string): string | null {
    if (trackId.startsWith("spotify:track:")) return trackId.slice("spotify:track:".length);
    if (trackId.startsWith("spotify:")) return trackId.slice("spotify:".length);
    return trackId || null;
  }
}

export default SpotifyConnector;
