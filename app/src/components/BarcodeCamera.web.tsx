/**
 * Web build: no camera scanner (keeps expo-camera out of the web bundle). The scan screen
 * shows manual barcode entry instead.
 */
export const HAS_CAMERA_SCANNER = false;

export function BarcodeCamera(_props: { onCode: (digits: string) => void }) {
  return null;
}
