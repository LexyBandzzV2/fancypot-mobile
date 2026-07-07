import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StackHeader, Button, ThemedText, EmptyState } from '@/components';
import { colors, radius, spacing, fillObject } from '@/theme';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useOutfits, type OutfitDisplay } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { tryOn } from '@/lib/api';

export default function TryOnScreen() {
  const { fromCamera, fromLibrary } = useImagePicker();
  const { outfits } = useOutfits();
  const { run, running } = useAIAction();
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [personBase64, setPersonBase64] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<OutfitDisplay | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const pickPerson = async (source: 'camera' | 'library') => {
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    setPersonImage(picked.uri);
    setPersonBase64(picked.base64);
    setResult(null);
  };

  const onTryOn = async () => {
    if (!personBase64 || !outfit?.signedUrl) return;
    const res = await run(() =>
      tryOn({ personImage: personBase64, outfitImage: outfit.signedUrl! }),
    );
    if (res?.image_url) setResult(res.image_url);
  };

  const canRun = !!personBase64 && !!outfit;

  return (
    <View style={styles.root}>
      <StackHeader title="Virtual try-on" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultWrap}>
            <Image source={{ uri: result }} style={styles.result} contentFit="cover" transition={250} />
            <Button label="Try another" variant="outline" onPress={() => setResult(null)} />
          </View>
        ) : (
          <>
            <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionLabel}>
              YOUR PHOTO
            </ThemedText>
            <Pressable style={styles.personSlot} onPress={() => pickPerson('library')}>
              {personImage ? (
                <Image source={{ uri: personImage }} style={styles.personImg} contentFit="cover" />
              ) : (
                <View style={styles.personEmpty}>
                  <Ionicons name="person-add-outline" size={30} color={colors.blushDeep} />
                  <ThemedText variant="labelSmall" color={colors.inkMuted}>
                    Tap to add a full-body photo
                  </ThemedText>
                </View>
              )}
            </Pressable>
            <View style={styles.personActions}>
              <Button label="Camera" variant="outline" fullWidth={false} onPress={() => pickPerson('camera')} />
              <Button label="Library" variant="outline" fullWidth={false} onPress={() => pickPerson('library')} />
            </View>

            <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionLabel}>
              CHOOSE AN OUTFIT
            </ThemedText>
            {outfits.length === 0 ? (
              <View style={styles.noOutfits}>
                <EmptyState
                  icon="bookmark-outline"
                  title="No saved outfits"
                  body="Create an outfit in the stylist first, then try it on."
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outfitRow}>
                {outfits.map((o) => {
                  const on = outfit?.id === o.id;
                  return (
                    <Pressable key={o.id} onPress={() => setOutfit(o)} style={[styles.outfit, on && styles.outfitOn]}>
                      {o.signedUrl ? (
                        <Image source={{ uri: o.signedUrl }} style={styles.outfitImg} contentFit="cover" />
                      ) : (
                        <View style={[styles.outfitImg, styles.outfitPh]}>
                          <Ionicons name="image-outline" size={22} color={colors.blushDeep} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </ScrollView>

      {!result ? (
        <View style={styles.footer}>
          <Button
            label={running ? 'Dressing you up…' : 'Try it on'}
            onPress={onTryOn}
            loading={running}
            disabled={!canRun}
            icon={!running ? <Ionicons name="sparkles" size={18} color={colors.cream} /> : undefined}
          />
        </View>
      ) : null}

      {running ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.pinkWarm} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1 },
  personSlot: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  personImg: { width: '100%', height: '100%' },
  personEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  personActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  noOutfits: { height: 180 },
  outfitRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  outfit: {
    width: 92,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  outfitOn: { borderColor: colors.pinkWarm },
  outfitImg: { width: '100%', height: '100%' },
  outfitPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pearl },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cream,
  },
  resultWrap: { gap: spacing.lg },
  result: { width: '100%', aspectRatio: 0.7, borderRadius: radius.lg, backgroundColor: colors.pearl },
  overlay: {
    ...fillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,243,231,0.5)',
  },
});
