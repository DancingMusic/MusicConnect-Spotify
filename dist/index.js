// src/index.ts
var API = "https://api.spotify.com/v1";
function toPlaylist(p) {
  return {
    id: `spotify-playlist:${p.id}`,
    name: p.name,
    description: p.description,
    coverUrl: p.images?.[0]?.url,
    trackCount: p.tracks?.total,
    curator: p.owner?.display_name,
    externalUrl: p.external_urls?.spotify
  };
}
function toTrack(t) {
  return {
    id: `spotify:${t.id}`,
    title: t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(", ") || "Unknown",
    album: t.album?.name,
    coverUrl: t.album?.images?.[0]?.url,
    durationSec: t.duration_ms ? Math.round(t.duration_ms / 1e3) : 0,
    price: 0,
    currency: "USD",
    version: "1.0.0",
    createdAt: "",
    updatedAt: ""
  };
}
var SpotifyConnector = class {
  constructor() {
    this.meta = {
      id: "spotify",
      name: "Spotify",
      description: "Spotify Web API \u2014 search + 30s previews",
      version: "0.2.0",
      capabilities: ["search", "stream", "playlist"],
      configSchema: [
        {
          key: "accessToken",
          label: "Access Token",
          type: "password",
          required: false,
          placeholder: "BQA...",
          help: "Spotify Bearer token (~1h lifetime). \u7528 client_credentials \u6362\u53D6\uFF0C\u6216\u7559\u7A7A\u6539\u7528\u4E0B\u65B9 tokenUrl\u3002"
        },
        {
          key: "tokenUrl",
          label: "Token \u7AEF\u70B9 (\u63A8\u8350)",
          type: "url",
          required: false,
          placeholder: "https://your-backend.example.com/spotify-token",
          help: "\u8FD4\u56DE { access_token, expires_in } \u7684\u540E\u7AEF\u4EE3\u7406\u3002\u8FDE\u63A5\u5668\u4F1A\u6309\u9700\u81EA\u52A8\u5237\u65B0\u3002\u4EFB\u4E00\u5B57\u6BB5\u5FC5\u586B\u3002"
        }
      ]
    };
    this.config = {};
    this.cachedToken = null;
  }
  async init(config) {
    this.config = config || {};
    if (!this.config.accessToken && !this.config.tokenUrl) {
      console.warn(
        "[SpotifyConnector] Neither accessToken nor tokenUrl configured. Configure one in the connector switcher before searching."
      );
    }
  }
  async getToken() {
    if (this.config.accessToken) return this.config.accessToken;
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 3e4) {
      return this.cachedToken.value;
    }
    if (!this.config.tokenUrl) {
      throw new Error("Spotify connector requires accessToken or tokenUrl in config");
    }
    const res = await fetch(this.config.tokenUrl);
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const data = await res.json();
    const ttl = (data.expires_in ?? 3600) * 1e3;
    this.cachedToken = { value: data.access_token, expiresAt: now + ttl };
    return data.access_token;
  }
  async authFetch(url) {
    const token = await this.getToken();
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const pageSize = Math.min(query.pageSize ?? 30, 50);
    const page = query.page ?? 1;
    const offset = (page - 1) * pageSize;
    if (!keyword) return { tracks: [], total: 0, page, pageSize };
    const params = new URLSearchParams({
      q: keyword,
      type: "track",
      limit: String(pageSize),
      offset: String(offset)
    });
    const res = await this.authFetch(`${API}/search?${params}`);
    if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
    const data = await res.json();
    const items = data.tracks?.items ?? [];
    return {
      tracks: items.map(toTrack),
      total: data.tracks?.total ?? items.length,
      page,
      pageSize
    };
  }
  async getTrack(trackId) {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await this.authFetch(`${API}/tracks/${id}`);
    if (!res.ok) return null;
    return toTrack(await res.json());
  }
  async getStreamUrl(trackId) {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await this.authFetch(`${API}/tracks/${id}`);
    if (!res.ok) return null;
    const t = await res.json();
    if (!t.preview_url) return null;
    return { url: t.preview_url, format: "mp3" };
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 50);
    const offset = (page - 1) * pageSize;
    const url = query.category ? `${API}/browse/categories/${encodeURIComponent(query.category)}/playlists?limit=${pageSize}&offset=${offset}` : `${API}/browse/featured-playlists?limit=${pageSize}&offset=${offset}`;
    const res = await this.authFetch(url);
    if (!res.ok) throw new Error(`Spotify playlist fetch failed: ${res.status}`);
    const data = await res.json();
    const items = data.playlists?.items ?? [];
    return {
      playlists: items.map(toPlaylist),
      total: data.playlists?.total ?? items.length,
      page,
      pageSize
    };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const id = this.parsePlaylistId(playlistId);
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 30, 100);
    if (!id) return { tracks: [], total: 0, page, pageSize };
    const offset = (page - 1) * pageSize;
    const res = await this.authFetch(`${API}/playlists/${id}/tracks?limit=${pageSize}&offset=${offset}`);
    if (!res.ok) return { tracks: [], total: 0, page, pageSize };
    const data = await res.json();
    const items = (data.items ?? []).map((i) => i.track).filter((t) => !!t);
    return {
      tracks: items.map(toTrack),
      total: data.total ?? items.length,
      page,
      pageSize
    };
  }
  parseId(trackId) {
    if (trackId.startsWith("spotify:track:")) return trackId.slice("spotify:track:".length);
    if (trackId.startsWith("spotify:")) return trackId.slice("spotify:".length);
    return trackId || null;
  }
  parsePlaylistId(id) {
    if (id.startsWith("spotify-playlist:")) return id.slice("spotify-playlist:".length);
    return id || null;
  }
};
var index_default = SpotifyConnector;
export {
  SpotifyConnector,
  index_default as default
};
