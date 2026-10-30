import { Text, type TextProps } from 'react-native';

import { SONGA_THEME, TYPOGRAPHY, type SongaColorToken, type TypographyVariant } from '@/theme';

export interface SongaTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: SongaColorToken;
  align?: 'left' | 'center' | 'right';
}

export function SongaText({ variant = 'body', color, align, style, ...rest }: SongaTextProps) {
  return (
    <Text
      {...rest}
      style={[
        TYPOGRAPHY[variant],
        color ? { color: SONGA_THEME[color] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
