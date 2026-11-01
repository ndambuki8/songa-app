import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type View } from 'react-native';

export type ViewHandle = ComponentRef<typeof View>;

/**
 * How many pixels of `container` the on-screen keyboard covers. Add it as bottom padding so a text field at the
 * bottom of the screen stays visible while typing.
 *
 * Measuring against the keyboard's top edge (instead of trusting its height) works the same with Android
 * edge-to-edge, where the window is no longer resized for the keyboard, and when the OS does resize the window
 * (the overlap then simply comes out as 0).
 */
export function useKeyboardOverlap(container: RefObject<ViewHandle | null>): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const keyboardTop = event.endCoordinates.screenY;
      // The padding is applied inside the container, so its frame (and this measurement) does not change.
      container.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        setOverlap(Math.max(0, Math.round(y + height - keyboardTop)));
      });
    };
    const onHide = () => setOverlap(0);

    const show = Keyboard.addListener(showEvent, onShow);
    const hide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [container]);

  return overlap;
}
