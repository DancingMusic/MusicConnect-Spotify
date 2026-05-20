// src/index.ts
var API = "https://api.spotify.com/v1";
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
      version: "0.1.0",
      capabilities: ["search", "stream"]
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
  parseId(trackId) {
    if (trackId.startsWith("spotify:track:")) return trackId.slice("spotify:track:".length);
    if (trackId.startsWith("spotify:")) return trackId.slice("spotify:".length);
    return trackId || null;
  }
};
var index_default = SpotifyConnector;
export {
  SpotifyConnector,
  index_default as default
};
