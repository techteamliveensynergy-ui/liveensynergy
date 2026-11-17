/** What an artist's file is (0121). Lives outside the server-action file, which may only export functions. */
export const ARTIST_FILE_KINDS = ["bank_details", "invoice", "agreement", "other"] as const;
export type ArtistFileKind = (typeof ARTIST_FILE_KINDS)[number];
export const ARTIST_FILE_KIND_LABEL: Record<ArtistFileKind, string> = {
  bank_details: "Bank details",
  invoice: "Invoice",
  agreement: "Agreement or contract",
  other: "Other document",
};
