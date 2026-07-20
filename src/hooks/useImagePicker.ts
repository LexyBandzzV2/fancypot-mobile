import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

export interface PickOptions {
  /** Opens the native crop/resize UI before returning the image. Default false
   * (wardrobe/outfit photos keep the original framing). Pass true for pickers
   * where the user should control cropping, e.g. a profile picture. */
  allowsEditing?: boolean;
  /** Locked crop aspect ratio [width, height] — only meaningful with
   * allowsEditing. e.g. [1, 1] for a square avatar. */
  aspect?: [number, number];
}

/**
 * Presents a native camera/library picker (from a bottom action sheet the
 * caller triggers) and returns a resized base64 payload ready for upload or
 * for sending to an edge function.
 */
export function useImagePicker() {
  const fromLibrary = useCallback(async (opts?: PickOptions): Promise<PickedImage | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Enable photo access in Settings to add pieces.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsEditing: opts?.allowsEditing ?? false,
      aspect: opts?.aspect,
    });
    return toPicked(res);
  }, []);

  const fromCamera = useCallback(async (opts?: PickOptions): Promise<PickedImage | null> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to snap pieces.');
      return null;
    }
    try {
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
        allowsEditing: opts?.allowsEditing ?? false,
        aspect: opts?.aspect,
      });
      return toPicked(res);
    } catch {
      // No usable camera (e.g. simulator, desktop web, or hardware missing) —
      // launchCameraAsync throws rather than resolving. Tell the user plainly
      // and let them fall back to the photo library instead of silently failing.
      Alert.alert(
        'No camera available',
        "We couldn't open a camera on this device. Choose a photo from your library instead.",
      );
      return null;
    }
  }, []);

  return { fromLibrary, fromCamera };
}

function toPicked(res: ImagePicker.ImagePickerResult): PickedImage | null {
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (!a.base64) return null;
  return { uri: a.uri, base64: a.base64, width: a.width, height: a.height };
}
