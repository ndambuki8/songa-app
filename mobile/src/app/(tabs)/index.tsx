import { DialogueBridgeView } from '@/features/dialogue/components/DialogueBridgeView';
import { useDialogueBridge } from '@/features/dialogue/hooks/useDialogueBridge';

export default function DialogueScreen() {
  const bridge = useDialogueBridge();
  return <DialogueBridgeView bridge={bridge} />;
}
