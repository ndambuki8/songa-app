import { AnchorView } from '@/features/anchor/components/AnchorView';
import { useAnchorNavigator } from '@/features/anchor/hooks/useAnchorNavigator';

export default function AnchorScreen() {
  const anchor = useAnchorNavigator();
  return <AnchorView anchor={anchor} />;
}
