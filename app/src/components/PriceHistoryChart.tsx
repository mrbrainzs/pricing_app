import type { PricePoint } from '@pricing/core';
import { View } from 'react-native';

import { useColors } from '@/theme';

/** 90-day price history as simple bars (F6). The last bar is today. */
export function PriceHistoryChart({ history, height = 64 }: { history: PricePoint[]; height?: number }) {
  const c = useColors();
  const points = history.slice(-90);
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Bars start below the lowest price so small changes stay readable without looking dramatic.
  const floor = min * 0.8;
  const span = max - floor || 1;
  return (
    <View
      accessibilityLabel={`price history, ${points.length} days, low ${min.toFixed(2)}, high ${max.toFixed(2)}`}
      style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      {points.map((p, i) => (
        <View
          key={p.observedAt}
          style={{
            flex: 1,
            height: 4 + ((p.price - floor) / span) * (height - 4),
            backgroundColor: i === points.length - 1 ? c.primary : c.border,
            borderTopLeftRadius: 1,
            borderTopRightRadius: 1,
          }}
        />
      ))}
    </View>
  );
}
