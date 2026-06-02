import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Key, LogOut, Pencil, Plus, Trash2, UserCircle2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { createApiKey, listApiKeys, revokeApiKey } from '../../lib/api';
import type { ApiKey } from '../../types';

const BG = '#101A14';
const CARD = '#1C2921';
const ACCENT = '#2ED158';
const RED = '#FF4D4D';
const SUBTLE = 'rgba(225,227,225,0.70)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.14)';

const PREF_DISEASE_ALERTS = 'pref_notif_disease_alerts';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [nameModal, setNameModal] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [keyModal, setKeyModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const [diseaseAlerts, setDiseaseAlerts] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setEmail(session?.user?.email ?? null);
    setUserId(session?.user?.id ?? null);

    if (session?.user) {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      setDisplayName(data?.display_name ?? null);

      if (data?.avatar_url) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(data.avatar_url);
        const url = publicUrl + '?t=' + Date.now();
        console.log('[avatar] url:', url);
        setAvatarUrl(url);
      }
    }

    try {
      const keys = await listApiKeys();
      setApiKeys(keys);
    } catch {
      // silent
    } finally {
      setKeysLoading(false);
    }

    const saved = await SecureStore.getItemAsync(PREF_DISEASE_ALERTS);
    if (saved !== null) setDiseaseAlerts(saved === 'true');
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function handlePickAvatar() {
    if (!userId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (result.canceled || !result.assets[0]) return;

    setAvatarUploading(true);
    try {
      const asset = result.assets[0];
      const path = `${userId}.jpg`;
      const mime = 'image/jpeg';

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${path}`;
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': mime,
          'x-upsert': 'true',
        },
      });

      if (uploadResult.status !== 200) {
        throw new Error(`Upload failed (${uploadResult.status}): ${uploadResult.body}`);
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: path }, { onConflict: 'id' });
      if (profileError) throw profileError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);
      setAvatarUrl(publicUrl + '?t=' + Date.now());
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSaveName() {
    if (!userId) return;
    const name = draftName.trim();
    if (!name) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: name }, { onConflict: 'id' });
      if (error) throw error;
      setDisplayName(name);
      setNameModal(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save name');
    } finally {
      setSavingName(false);
    }
  }

  async function handleCreateKey() {
    const label = newKeyLabel.trim();
    if (!label) return;
    setCreating(true);
    try {
      const result = await createApiKey(label);
      setApiKeys(prev => [
        { id: result.id, user_id: '', label: result.label, created_at: result.created_at, last_used_at: null, revoked_at: null },
        ...prev,
      ]);
      setRevealedKey(result.key);
      setKeyModal(false);
      setNewKeyLabel('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  function handleRevoke(key: ApiKey) {
    Alert.alert('Revoke key', `Revoke "${key.label}"? Any drone using this key will lose access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeApiKey(key.id);
            setApiKeys(prev => prev.map(k => k.id === key.id ? { ...k, revoked_at: new Date().toISOString() } : k));
          } catch {
            Alert.alert('Error', 'Failed to revoke key');
          }
        },
      },
    ]);
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); },
      },
    ]);
  }

  async function toggleDiseaseAlerts(val: boolean) {
    setDiseaseAlerts(val);
    await SecureStore.setItemAsync(PREF_DISEASE_ALERTS, val ? 'true' : 'false');
  }

  const activeKeys = apiKeys.filter(k => !k.revoked_at);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Account ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            {/* Avatar row */}
            <View style={styles.avatarRow}>
              <TouchableOpacity
                style={styles.avatarWrap}
                onPress={handlePickAvatar}
                activeOpacity={0.8}
                disabled={avatarUploading}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatar}
                    onError={(e) => console.log('[avatar] load error:', e.nativeEvent.error, 'url:', avatarUrl)}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitials}>{initials(displayName, email)}</Text>
                  </View>
                )}
                <View style={styles.avatarBadge}>
                  {avatarUploading
                    ? <ActivityIndicator color={BG} size="small" />
                    : <UserCircle2 size={11} color={BG} strokeWidth={2} />
                  }
                </View>
              </TouchableOpacity>

              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {displayName ?? 'LeafScan User'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setDraftName(displayName ?? ''); setNameModal(true); }}
                    hitSlop={12}
                  >
                    <Pencil size={14} color={SUBTLE} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.profileEmail} numberOfLines={1}>{email ?? '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Notifications ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Disease alerts</Text>
                <Text style={styles.toggleSub}>Notify when a scan detects a diseased plant</Text>
              </View>
              <Switch
                value={diseaseAlerts}
                onValueChange={toggleDiseaseAlerts}
                trackColor={{ false: SUBTLE_BORDER, true: ACCENT + '88' }}
                thumbColor={diseaseAlerts ? ACCENT : '#888'}
                ios_backgroundColor={SUBTLE_BORDER}
              />
            </View>
          </View>
          <Text style={styles.sectionHint}>
            Push delivery requires device permission in system settings.
          </Text>
        </View>

        {/* ── API Keys ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>API Keys</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setKeyModal(true)}
              activeOpacity={0.7}
            >
              <Plus size={14} color={BG} strokeWidth={2} />
              <Text style={styles.addBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>Use these keys to authenticate drone scan requests.</Text>

          {keysLoading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 16 }} />
          ) : activeKeys.length === 0 ? (
            <View style={styles.emptyKeys}>
              <Key size={16} color={SUBTLE} strokeWidth={1.5} />
              <Text style={styles.emptyKeysText}>No active API keys</Text>
            </View>
          ) : (
            <View style={styles.keyList}>
              {activeKeys.map(key => (
                <View key={key.id} style={styles.keyRow}>
                  <View style={styles.keyInfo}>
                    <Text style={styles.keyLabel}>{key.label}</Text>
                    <Text style={styles.keyMeta}>
                      Created {formatDate(key.created_at)}
                      {key.last_used_at ? ` · Last used ${formatDate(key.last_used_at)}` : ' · Never used'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRevoke(key)} hitSlop={12}>
                    <Trash2 size={16} color={RED + 'CC'} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Sign out ─────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <LogOut size={16} color={RED} strokeWidth={1.5} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {/* ── About ────────────────────────────────────────── */}
        <View style={styles.aboutSection}>
          <Text style={styles.aboutApp}>LeafScan</Text>
          <Text style={styles.aboutVersion}>Version {appVersion}</Text>
          <Text style={styles.aboutCopy}>Plant disease detection for precision agriculture</Text>
        </View>

      </ScrollView>

      {/* ── Edit name modal ───────────────────────────────── */}
      <Modal
        visible={nameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModal(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Edit Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={SUBTLE}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={60}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setNameModal(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, (!draftName.trim() || savingName) && styles.dialogConfirmDisabled]}
                onPress={handleSaveName}
                disabled={!draftName.trim() || savingName}
              >
                {savingName
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={styles.dialogConfirmText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New API key modal ────────────────────────────── */}
      <Modal
        visible={keyModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setKeyModal(false); setNewKeyLabel(''); }}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>New API Key</Text>
            <Text style={styles.dialogHint}>Give this key a label so you know which device uses it.</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Field Drone 1"
              placeholderTextColor={SUBTLE}
              value={newKeyLabel}
              onChangeText={setNewKeyLabel}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateKey}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => { setKeyModal(false); setNewKeyLabel(''); }}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, (!newKeyLabel.trim() || creating) && styles.dialogConfirmDisabled]}
                onPress={handleCreateKey}
                disabled={!newKeyLabel.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={styles.dialogConfirmText}>Create</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Revealed key modal ───────────────────────────── */}
      <Modal
        visible={!!revealedKey}
        transparent
        animationType="fade"
        onRequestClose={() => setRevealedKey(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>API Key Created</Text>
            <Text style={styles.dialogHint}>Copy this key now — it won't be shown again.</Text>
            <TouchableOpacity
              style={styles.keyBox}
              onPress={() => { if (revealedKey) Share.share({ message: revealedKey }); }}
              activeOpacity={0.7}
            >
              <Text style={styles.keyBoxText} numberOfLines={3} selectable>{revealedKey}</Text>
              <Text style={styles.keyBoxHint}>Tap to share · Long-press to select &amp; copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setRevealedKey(null)}>
              <Text style={styles.dialogConfirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: SUBTLE_BORDER,
  },
  headerTitle: { color: '#E1E3E1', fontSize: 22, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 48, gap: 24, paddingTop: 20 },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: SUBTLE, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionHint: { color: SUBTLE, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    overflow: 'hidden',
  },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarPlaceholder: {
    backgroundColor: ACCENT + '22',
    borderWidth: 1.5,
    borderColor: ACCENT + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: ACCENT, fontSize: 22, fontWeight: '700' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CARD,
  },
  profileInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { color: '#E1E3E1', fontSize: 16, fontWeight: '600', flex: 1 },
  profileEmail: { color: SUBTLE, fontSize: 13 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  toggleInfo: { flex: 1, gap: 3 },
  toggleLabel: { color: '#E1E3E1', fontSize: 14, fontWeight: '500' },
  toggleSub: { color: SUBTLE, fontSize: 12, lineHeight: 17 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  addBtnText: { color: BG, fontSize: 13, fontWeight: '600' },
  emptyKeys: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  emptyKeysText: { color: SUBTLE, fontSize: 13 },
  keyList: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    overflow: 'hidden',
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: SUBTLE_BORDER,
    gap: 12,
  },
  keyInfo: { flex: 1, gap: 3 },
  keyLabel: { color: '#E1E3E1', fontSize: 14, fontWeight: '600' },
  keyMeta: { color: SUBTLE, fontSize: 11 },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RED + '40',
    backgroundColor: RED + '0D',
  },
  signOutText: { color: RED, fontSize: 15, fontWeight: '600' },

  aboutSection: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  aboutApp: { color: SUBTLE, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  aboutVersion: { color: SUBTLE + '99', fontSize: 12 },
  aboutCopy: { color: SUBTLE + '66', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#1C2921',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    padding: 24,
    width: '100%',
    gap: 16,
  },
  dialogTitle: { color: '#E1E3E1', fontSize: 17, fontWeight: '700' },
  dialogHint: { color: SUBTLE, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#E1E3E1',
    fontSize: 15,
  },
  dialogRow: { flexDirection: 'row', gap: 10 },
  dialogCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    alignItems: 'center',
  },
  dialogCancelText: { color: SUBTLE, fontSize: 15, fontWeight: '600' },
  dialogConfirmBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  dialogConfirmDisabled: { opacity: 0.4 },
  dialogConfirmText: { color: BG, fontSize: 15, fontWeight: '700' },
  doneBtn: {
    alignSelf: 'stretch',
    padding: 12,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  keyBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT + '40',
    padding: 14,
    gap: 8,
  },
  keyBoxText: { color: ACCENT, fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  keyBoxHint: { color: SUBTLE, fontSize: 11 },
});
