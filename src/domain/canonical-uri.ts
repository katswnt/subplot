/** Normalize a Letterboxd film URL to `https://letterboxd.com/film/<slug>/`.
 *  Short `boxd.it/…` links carry no slug, so they pass through unchanged (the
 *  film key then falls back to title|year). */
export function canonicalizeLetterboxdUri(uri: string): string {
  uri = (uri || "").trim().replace(/\/+$/, "");
  if (!uri) return uri;
  const match = uri.match(/https?:\/\/letterboxd\.com\/(?:[^/]+\/)?film\/([^/]+)/i);
  return match ? `https://letterboxd.com/film/${match[1]}/` : uri;
}
