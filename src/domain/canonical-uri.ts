export function canonicalizeLetterboxdUri(
  uri: string,
  uriMap?: Record<string, string> | null,
): string {
  uri = (uri || "").trim();
  if (!uri) return uri;

  uri = uri.replace(/\/+$/, "");

  if (/^https?:\/\/boxd\.it\//i.test(uri)) {
    const mapped = uriMap ? uriMap[uri] : null;
    if (typeof mapped === "string" && mapped.trim()) {
      return mapped.trim();
    }
    return uri;
  }

  const match = uri.match(/https?:\/\/letterboxd\.com\/(?:[^/]+\/)?film\/([^/]+)/i);
  if (match) {
    return `https://letterboxd.com/film/${match[1]}/`;
  }

  return uri;
}
