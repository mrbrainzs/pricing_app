import * as Sharing from 'expo-sharing';
import type { ComponentRef } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// iOS and Android. The web build uses shareImage.ts (same exports).

/** Whether this platform can share the card as an image. */
export const canShareImage = true;

/**
 * Shares a PNG of the card. iOS sends the image together with the message and link.
 * Android's share sheet takes the file only, so the card itself prints the site address.
 */
export async function shareCardImage(view: ComponentRef<typeof View> | null, message: string, title: string): Promise<void> {
  if (!view) throw new Error('The card is not on screen yet.');
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', fileName: 'quin-super-card' });
  if (Platform.OS === 'ios') {
    await Share.share({ url: uri, message });
  } else {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title });
  }
}
