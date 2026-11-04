import type { ComponentRef } from 'react';
import type { View } from 'react-native';

// Web build. Native builds use shareImage.native.ts (same exports). Keeping
// react-native-view-shot out of the web bundle matters: on web it needs html2canvas-pro.

/** Whether this platform can share the card as an image. On web the link shows the same card. */
export const canShareImage = false;

export async function shareCardImage(_view: ComponentRef<typeof View> | null, _message: string, _title: string): Promise<void> {
  throw new Error('Sharing the card as an image is not available on web.');
}
