import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type View } from 'react-native';

export type ViewHandle = ComponentRef<typeof View>;

/**
 * How many pixels of `container` the on-screen keyboard covers. Apply it as bottom padding on the container so
 * a text field at the bottom of the screen stays above the keyboard while typing.
 *
 * It compares the keyboard's top edge with the container's bottom edge instead of trusting the keyboard height,
 * which behaves the same with Android edge-to-edge (no window resize) and with a resizing window (overlap 0).
 * The container is re-measured whenever its layout changes, because hiding the tab bar for the keyboard makes
 * the screen taller *after* the keyboard event: measuring only once leaves the field a tab bar too low.
 * Pass the returned `onLayout` to the container.
 */
export function useKeyboardOverlap(container: RefObject<ViewHandle | null>): { overlap: number; onLayout: () => void } {
  const [overlap, setOverlap] = useState(0);
  const keyboardTop = useRef<number | null>(null);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) {
      setOverlap(0);
      return;
    }
    // The padding sits inside the container, so the container's own frame is unaffected by it.
    container.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      setOverlap(Math.max(0, Math.round(y + height - top)));
    });
  }, [container]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      measure();
    };
    const onHide = () => {
      keyboardTop.current = null;
      setOverlap(0);
    };

    const subscriptions = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
      // Keyboards change height (emoji panel, suggestion bar); follow them.
      Keyboard.addListener('keyboardDidChangeFrame', (event) => {
        if (keyboardTop.current !== null) onShow(event);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [measure]);

  return { overlap, onLayout: measure };
}
