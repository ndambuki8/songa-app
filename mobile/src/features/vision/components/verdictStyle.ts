import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { Verdict } from '@/services/api/schemas';
import type { SongaColorToken } from '@/theme';

export const VERDICT_STYLE: Record<Verdict, { icon: ComponentProps<typeof Ionicons>['name']; color: SongaColorToken; label: string }> = {
  avoid: { icon: 'close-circle', color: 'textDark', label: 'Avoid' },
  ask: { icon: 'help-circle', color: 'secondaryAccent', label: 'Ask staff' },
  safe: { icon: 'checkmark-circle', color: 'primaryAccent', label: 'Looks fine' },
};
