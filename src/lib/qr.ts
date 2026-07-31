import QRCode from "qrcode";

/** PNG data URI for a QR code encoding `text` — generated server-side, no external API call. */
export async function qrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 });
}
