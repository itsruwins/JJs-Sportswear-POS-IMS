import QRCode from "qrcode";

/**
 * A ticket's QR as an SVG data URL, drawn on the server so phones load no QR code.
 * It holds only the code (JJ-7K3QM), so any scanner reads it and typing it gives the
 * same result. Dark modules on a clear ground: the card tile behind it is the light.
 */
export async function ticketQr(code: string) {
  const svg = await QRCode.toString(code, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#1c1714", light: "#0000" },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
