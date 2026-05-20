import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifyConnector } from "../index";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(new Response(JSON.stringify(handler(url, init)), {
      status: 200, headers: { "content-type": "application/json" },
    }));
  });
}

describe("SpotifyConnector (contract)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares meta + accessToken / tokenUrl schema fields", () => {
    const c = new SpotifyConnector();
    expect(c.meta.id).toBe("spotify");
    const keys = (c.meta.configSchema ?? []).map(f => f.key).sort();
    expect(keys).toEqual(["accessToken", "tokenUrl"]);
  });

  it("search returns track-shaped results with bearer auth", async () => {
    let sawAuth = false;
    mockFetch((url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === "Bearer test-token") sawAuth = true;
      expect(url).toContain("api.spotify.com/v1/search");
      expect(url).toContain("type=track");
      return {
        tracks: {
          total: 1,
          items: [{
            id: "11dFghVXANMlKmJXsNCbNl",
            name: "Cut to the Feeling",
            artists: [{ name: "Carly Rae Jepsen" }],
            album: { name: "Cut to the Feeling", images: [{ url: "https://i.scdn.co/image/cover.jpg" }] },
            duration_ms: 207959,
            preview_url: "https://p.scdn.co/mp3-preview/abc.mp3",
          }],
        },
      };
    });
    const c = new SpotifyConnector();
    await c.init({ accessToken: "test-token" });
    const r = await c.search({ keyword: "carly", pageSize: 10 });
    expect(sawAuth).toBe(true);
    expect(r.tracks).toHaveLength(1);
    const t = r.tracks[0];
    expect(t.id).toBe("spotify:11dFghVXANMlKmJXsNCbNl");
    expect(t.title).toBe("Cut to the Feeling");
    expect(t.artist).toBe("Carly Rae Jepsen");
    expect(t.coverUrl).toContain("i.scdn.co");
    expect(t.durationSec).toBe(208);
  });

  it("listPlaylists returns featured playlists", async () => {
    mockFetch((url) => {
      expect(url).toContain("/browse/featured-playlists");
      return {
        playlists: {
          total: 1,
          items: [{
            id: "37i9dQZF1DXcBWIGoYBM5M",
            name: "Today's Top Hits",
            description: "The hottest tracks right now.",
            images: [{ url: "https://i.scdn.co/image/cover.jpg" }],
            tracks: { total: 50 },
            owner: { display_name: "Spotify" },
            external_urls: { spotify: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
          }],
        },
      };
    });
    const c = new SpotifyConnector();
    await c.init({ accessToken: "test-token" });
    const r = await c.listPlaylists!();
    expect(r.playlists).toHaveLength(1);
    const p = r.playlists[0];
    expect(p.id).toBe("spotify-playlist:37i9dQZF1DXcBWIGoYBM5M");
    expect(p.name).toBe("Today's Top Hits");
    expect(p.trackCount).toBe(50);
    expect(p.curator).toBe("Spotify");
    expect(p.externalUrl).toContain("open.spotify.com");
  });

  it("getPlaylistTracks returns the playlist's tracks", async () => {
    mockFetch((url) => {
      expect(url).toContain("/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks");
      return {
        total: 1,
        items: [{
          track: {
            id: "11dFghVXANMlKmJXsNCbNl",
            name: "Cut to the Feeling",
            artists: [{ name: "Carly Rae Jepsen" }],
            album: { name: "Cut to the Feeling", images: [{ url: "https://i.scdn.co/cover.jpg" }] },
            duration_ms: 207959,
            preview_url: null,
          },
        }],
      };
    });
    const c = new SpotifyConnector();
    await c.init({ accessToken: "test-token" });
    const r = await c.getPlaylistTracks!("spotify-playlist:37i9dQZF1DXcBWIGoYBM5M");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0].id).toBe("spotify:11dFghVXANMlKmJXsNCbNl");
  });

  it("getStreamUrl returns a 30s preview", async () => {
    mockFetch(() => ({
      id: "11dFghVXANMlKmJXsNCbNl",
      name: "Cut to the Feeling",
      artists: [{ name: "X" }],
      preview_url: "https://p.scdn.co/mp3-preview/abc.mp3",
    }));
    const c = new SpotifyConnector();
    await c.init({ accessToken: "test-token" });
    const info = await c.getStreamUrl("spotify:11dFghVXANMlKmJXsNCbNl");
    expect(info).not.toBeNull();
    expect(info!.url).toContain("p.scdn.co");
    expect(info!.format).toBe("mp3");
  });

  it("getStreamUrl returns null when track has no preview", async () => {
    mockFetch(() => ({
      id: "x", name: "y", artists: [{ name: "z" }], preview_url: null,
    }));
    const c = new SpotifyConnector();
    await c.init({ accessToken: "test-token" });
    expect(await c.getStreamUrl("spotify:x")).toBeNull();
  });
});
