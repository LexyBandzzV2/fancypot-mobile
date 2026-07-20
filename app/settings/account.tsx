import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  StackHeader,
  Button,
  TextField,
  ThemedText,
  SectionLabel,
  SettingsGroup,
  SettingsRow,
  BottomSheet,
  SheetAction,
} from '@/components';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useSignedAvatar } from '@/hooks/useSignedAvatar';
import { supabase } from '@/lib/supabase';
import { uploadWardrobeImage } from '@/lib/storage';
import { zodiacFor, parseBirthDate, toBirthDate } from '@/lib/zodiac';

/**
 * Account editor — the profile fields Apple/Google expect to be user-editable.
 * Display name + avatar are real `profiles` columns; bio + birth_date live in
 * the `preferences` jsonb (no schema change, same as the web app). Email, phone
 * and password each open their own dedicated flow.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, profile, refreshProfile } = useAuth();
  const { fromCamera, fromLibrary } = useImagePicker();

  const prefs = (profile?.preferences ?? {}) as { bio?: string; birth_date?: string };
  const initialDate = parseBirthDate(prefs.birth_date);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(prefs.bio ?? '');
  const [mm, setMm] = useState(initialDate ? String(initialDate.month) : '');
  const [dd, setDd] = useState(initialDate ? String(initialDate.day) : '');
  const [yyyy, setYyyy] = useState(initialDate ? String(initialDate.year) : '');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const signedExisting = useSignedAvatar(removeAvatar ? null : profile?.avatar_url);
  const avatarDisplay = pickedUri ?? signedExisting;
  const initials = (name || user?.email || 'F').slice(0, 1).toUpperCase();

  // Birthday validation: all-empty is fine (no birthday); otherwise all three
  // fields must be present and form a real date.
  const birthday = useMemo(() => {
    const anyFilled = mm || dd || yyyy;
    const allFilled = mm && dd && yyyy;
    if (!anyFilled) return { iso: null as string | null, error: null as string | null, zodiac: null };
    if (!allFilled) return { iso: null, error: 'Enter month, day and year.', zodiac: null };
    const iso = toBirthDate(Number(yyyy), Number(mm), Number(dd));
    if (!iso) return { iso: null, error: 'That date isn’t valid.', zodiac: null };
    return { iso, error: null, zodiac: zodiacFor(Number(mm), Number(dd)) };
  }, [mm, dd, yyyy]);

  const pick = async (source: 'camera' | 'library') => {
    setAvatarSheet(false);
    // Square crop UI so the user controls exactly how their avatar is framed.
    const cropOpts = { allowsEditing: true, aspect: [1, 1] as [number, number] };
    const picked = source === 'camera' ? await fromCamera(cropOpts) : await fromLibrary(cropOpts);
    if (!picked) return;
    setPickedUri(picked.uri);
    setPickedBase64(picked.base64);
    setRemoveAvatar(false);
  };

  const clearAvatar = () => {
    setAvatarSheet(false);
    setPickedUri(null);
    setPickedBase64(null);
    setRemoveAvatar(true);
  };

  const save = async () => {
    if (!user) return;
    if (birthday.error) {
      Alert.alert('Check your birthday', birthday.error);
      return;
    }
    setSaving(true);
    try {
      // Upload a freshly picked avatar first so a failure here never leaves the
      // row pointing at a missing object.
      let avatarUrl = profile?.avatar_url ?? null;
      if (pickedBase64) {
        avatarUrl = await uploadWardrobeImage(user.id, pickedBase64);
      } else if (removeAvatar) {
        avatarUrl = null;
      }

      // Preserve every other preference key (styles/stores/budgets) — the whole
      // jsonb is replaced on write, so we merge onto the existing object.
      const nextPrefs: Record<string, unknown> = { ...(profile?.preferences ?? {}) };
      const trimmedBio = bio.trim();
      if (trimmedBio) nextPrefs.bio = trimmedBio;
      else delete nextPrefs.bio;
      if (birthday.iso) nextPrefs.birth_date = birthday.iso;
      else delete nextPrefs.birth_date;

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: name.trim() || null,
          avatar_url: avatarUrl,
          preferences: nextPrefs,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Account" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar. The circle clips the photo; the camera badge sits on a
            non-clipping outer wrapper so it floats just outside the circle's
            edge instead of overlapping the face. */}
        <View style={styles.avatarWrap}>
          <Pressable
            onPress={() => setAvatarSheet(true)}
            style={({ pressed }) => [styles.avatarOuter, pressed && styles.pressedDim]}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            <View style={styles.avatar}>
              {avatarDisplay ? (
                <Image source={{ uri: avatarDisplay }} style={styles.avatarImg} contentFit="cover" transition={150} />
              ) : (
                <ThemedText variant="h1" color={colors.blushDeep}>
                  {initials}
                </ThemedText>
              )}
            </View>
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={15} color={colors.white} />
            </View>
          </Pressable>
          <Pressable onPress={() => setAvatarSheet(true)} hitSlop={8} accessibilityRole="button">
            <ThemedText variant="label" color={colors.pinkWarm} style={styles.avatarHint}>
              Change photo
            </ThemedText>
          </Pressable>
        </View>

        {/* Profile fields */}
        <TextField
          label="DISPLAY NAME"
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          autoCapitalize="words"
          returnKeyType="done"
        />
        <TextField
          label="BIO"
          value={bio}
          onChangeText={setBio}
          placeholder="A little about your style…"
          multiline
          maxLength={160}
          style={styles.bioInput}
        />

        {/* Birthday + live zodiac */}
        <SectionLabel hint="We'll show your zodiac sign. Optional.">BIRTHDAY</SectionLabel>
        <View style={styles.dateRow}>
          <DateBox label="MM" value={mm} onChangeText={setMm} max={2} placeholder="MM" />
          <DateBox label="DD" value={dd} onChangeText={setDd} max={2} placeholder="DD" />
          <DateBox label="YYYY" value={yyyy} onChangeText={setYyyy} max={4} placeholder="YYYY" wide />
        </View>
        {birthday.error ? (
          <ThemedText variant="labelSmall" color={colors.danger} style={styles.dateError}>
            {birthday.error}
          </ThemedText>
        ) : birthday.zodiac ? (
          <View style={styles.zodiac}>
            <ThemedText variant="label" color={colors.pinkWarm}>
              {birthday.zodiac.symbol} {birthday.zodiac.name}
            </ThemedText>
          </View>
        ) : null}

        {/* Contact & security — each opens its own flow */}
        <SectionLabel>CONTACT &amp; SECURITY</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon="mail-outline"
            label="Email"
            value={user?.email ?? undefined}
            onPress={() => router.push('/settings/change-email')}
          />
          <SettingsRow
            icon={profile?.phone_verified ? 'shield-checkmark-outline' : 'call-outline'}
            label={profile?.phone ? 'Phone number' : 'Add phone number'}
            value={profile?.phone ?? undefined}
            onPress={() => router.push('/verify-phone')}
          />
          <SettingsRow
            icon="key-outline"
            label="Password"
            onPress={() => router.push('/settings/change-password')}
          />
        </SettingsGroup>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Save changes" onPress={save} loading={saving} />
      </View>

      <BottomSheet visible={avatarSheet} onClose={() => setAvatarSheet(false)} title="Profile picture">
        <SheetAction
          label="Take a photo"
          icon={<Ionicons name="camera-outline" size={22} color={colors.ink} />}
          onPress={() => pick('camera')}
        />
        <SheetAction
          label="Choose from library"
          icon={<Ionicons name="images-outline" size={22} color={colors.ink} />}
          onPress={() => pick('library')}
        />
        {avatarDisplay ? (
          <SheetAction
            label="Remove photo"
            destructive
            icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
            onPress={clearAvatar}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

/** One bordered numeric box in the birthday row. */
function DateBox({
  label,
  value,
  onChangeText,
  max,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  max: number;
  placeholder: string;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.dateBox, wide && styles.dateBoxWide]}>
      <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.dateLabel}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, '').slice(0, max))}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        maxLength={max}
        style={styles.dateInput}
        accessibilityLabel={label}
      />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    pressedDim: { opacity: 0.8 },
    avatarWrap: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
    // Unclipped positioning context — lets the badge float outside the
    // circle's edge instead of being clipped by (or drawn over) the photo.
    avatarOuter: {
      width: 96,
      height: 96,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: c.tissue,
      borderWidth: 2,
      borderColor: c.blush,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    // Sits just outside the circle's bottom-right edge, not over the photo.
    avatarBadge: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.pinkWarm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.cream,
    },
    avatarHint: {},
    bioInput: { minHeight: 72, textAlignVertical: 'top' },
    dateRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    dateBox: {
      flex: 1,
      gap: spacing.xs,
    },
    dateBoxWide: { flex: 1.4 },
    dateLabel: { letterSpacing: 1 },
    dateInput: {
      backgroundColor: c.white,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      color: c.ink,
      fontSize: 16,
      textAlign: 'center',
    },
    dateError: { marginBottom: spacing.sm },
    zodiac: {
      alignSelf: 'flex-start',
      backgroundColor: c.pinkWarmGlow,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginBottom: spacing.sm,
    },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.border },
  });
