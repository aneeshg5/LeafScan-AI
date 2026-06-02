import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const BG = '#101A14';
const CARD = '#1C2921';
const ACCENT = '#2ED158';
const SUBTLE = 'rgba(225,227,225,0.70)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.14)';
const INPUT_BG = 'rgba(255,255,255,0.05)';

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() || null } },
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName.trim() || null,
      });
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logo}>LeafScan</Text>
          <Text style={styles.tagline}>Plant disease detection</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create account</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              autoCorrect={false}
              textContentType="name"
              placeholderTextColor={SUBTLE}
              placeholder="Your name"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholderTextColor={SUBTLE}
              placeholder="you@example.com"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              placeholderTextColor={SUBTLE}
              placeholder="At least 6 characters"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={BG} />
              : <Text style={styles.primaryBtnText}>Create account</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 28,
  },
  header: {
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    color: ACCENT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tagline: {
    color: SUBTLE,
    fontSize: 14,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    gap: 18,
  },
  cardTitle: {
    color: '#E1E3E1',
    fontSize: 20,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: SUBTLE,
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#E1E3E1',
    fontSize: 15,
  },
  errorText: {
    color: '#FF4D4D',
    fontSize: 13,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: BG,
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: {
    color: SUBTLE,
    fontSize: 14,
  },
  footerLink: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
  },
});
