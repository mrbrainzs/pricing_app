import { Ionicons } from '@expo/vector-icons';
import { parseBarcode } from '@pricing/core';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, T } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { radius, space } from '@/theme';

/** The web build has no camera scanner (see BarcodeCamera.web.tsx). */
export const HAS_CAMERA_SCANNER = true;

export interface BarcodeCameraProps {
  /** Called once, with the digits of the first EAN-13, EAN-8 or UPC-A code with a valid check digit. */
  onCode: (digits: string) => void;
}

/**
 * Native camera scanner (expo-camera). Asks for the camera only after saying why; when
 * access is refused or the camera fails, it says so and the screen's manual entry stays.
 */
export function BarcodeCamera({ onCode }: BarcodeCameraProps) {
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = useRef(false);

  if (failed) return <Banner text={t('cameraUnavailable')} />;
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Card>
        <T>{t('cameraWhy')}</T>
        {permission.canAskAgain ? (
          <Button label={t('cameraAllow')} onPress={() => void requestPermission()} />
        ) : (
          <>
            <T variant="small">{t('cameraDenied')}</T>
            <Button variant="secondary" label={t('openSettings')} onPress={() => void Linking.openSettings()} />
          </>
        )}
      </Card>
    );
  }

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const parsed = parseBarcode(data);
    if (done.current || !parsed?.checkDigitOk) return;
    done.current = true;
    onCode(parsed.digits);
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
          onBarcodeScanned={onScanned}
          onMountError={() => setFailed(true)}
        />
        <View style={styles.target} />
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={torch ? t('torchOff') : t('torchOn')}
          accessibilityState={{ checked: torch }}
          onPress={() => setTorch((on) => !on)}
          hitSlop={8}
          style={({ pressed }) => [styles.torch, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color="#FFFFFF" />
        </Pressable>
      </View>
      <T variant="small" style={{ textAlign: 'center' }}>{t('scanHint')}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000000' },
  // A wide box: product barcodes are wider than tall.
  target: {
    position: 'absolute', left: '12%', right: '12%', top: '30%', bottom: '30%', pointerEvents: 'none',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: radius.md,
  },
  torch: {
    position: 'absolute', right: space.md, bottom: space.md, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
