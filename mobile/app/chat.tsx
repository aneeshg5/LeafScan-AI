import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  ArrowDown,
  ExternalLink,
  ImageIcon,
  Leaf,
  Send,
  ShoppingCart,
  ScanLine,
  X,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';

const BG = '#0D1610';
const CARD = '#1A2420';
const CARD2 = '#1F2C28';
const ACCENT = '#2ED158';
const AMBER = '#F5A623';
const SUBTLE = 'rgba(225,227,225,0.55)';
const SUBTLE2 = 'rgba(225,227,225,0.80)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.10)';
const USER_BUBBLE = '#1C3326';
const RED = '#FF4D4D';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

type Source = { url: string; title: string };
type ShoppingLink = { title: string; url: string; price: string; store: string };
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  shopping: ShoppingLink[];
  image_url?: string;
  created_at: string;
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string, baseColor: string): React.ReactNode {
  const regex = /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Text key={key++} style={{ color: baseColor }}>{text.slice(last, m.index)}</Text>);
    if (m[1]) parts.push(<Text key={key++} style={{ color: '#E1E3E1', fontWeight: '700' }}>{m[2]}</Text>);
    else if (m[3]) parts.push(<Text key={key++} style={{ color: baseColor, fontStyle: 'italic' }}>{m[4]}</Text>);
    else if (m[5]) parts.push(<Text key={key++} style={styles.inlineCode}>{m[6]}</Text>);
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(<Text key={key++} style={{ color: baseColor }}>{text.slice(last)}</Text>);
  return parts;
}

function MarkdownBlock({ text }: { text: string }) {
  const baseColor = SUBTLE2;
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // h1
    if (line.startsWith('# ')) {
      blocks.push(<Text key={key++} style={styles.mdH1}>{renderInline(line.slice(2), '#E1E3E1')}</Text>);
      i++; continue;
    }
    // h2
    if (line.startsWith('## ')) {
      blocks.push(<Text key={key++} style={styles.mdH2}>{renderInline(line.slice(3), '#E1E3E1')}</Text>);
      i++; continue;
    }
    // h3
    if (line.startsWith('### ')) {
      blocks.push(<Text key={key++} style={styles.mdH3}>{renderInline(line.slice(4), '#E1E3E1')}</Text>);
      i++; continue;
    }
    // fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      blocks.push(
        <View key={key++} style={styles.codeBlock}>
          <Text style={styles.codeText}>{codeLines.join('\n')}</Text>
        </View>
      );
      i++; continue;
    }
    // horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      blocks.push(<View key={key++} style={styles.hr} />);
      i++; continue;
    }
    // bullet list
    if (line.match(/^[-•*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-•*]\s/)) { items.push(lines[i].slice(2)); i++; }
      blocks.push(
        <View key={key++} style={styles.mdList}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.mdListRow}>
              <Text style={[styles.mdBullet, { color: ACCENT }]}>•</Text>
              <Text style={styles.mdListText}>{renderInline(item, baseColor)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }
    // numbered list
    if (line.match(/^\d+\.\s/)) {
      const items: { n: string; t: string }[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        const match = lines[i].match(/^(\d+)\.\s(.*)$/);
        if (match) items.push({ n: match[1], t: match[2] });
        i++;
      }
      blocks.push(
        <View key={key++} style={styles.mdList}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.mdListRow}>
              <Text style={[styles.mdBullet, { color: ACCENT, minWidth: 20 }]}>{item.n}.</Text>
              <Text style={styles.mdListText}>{renderInline(item.t, baseColor)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }
    // paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].match(/^[-•*]\s/) &&
      !lines[i].match(/^\d+\.\s/) &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^[-*_]{3,}$/)
    ) { paraLines.push(lines[i]); i++; }
    if (paraLines.length > 0) {
      blocks.push(
        <Text key={key++} style={styles.mdPara}>
          {renderInline(paraLines.join(' '), baseColor)}
        </Text>
      );
    }
  }

  return <View style={styles.mdWrap}>{blocks}</View>;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TYPING_STEPS = [
  'Searching the web…',
  'Reading sources…',
  'Composing response…',
  'Finding products…',
];

function TypingIndicator() {
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    TYPING_STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
        setStepIndex(i);
      }, i * 3500));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <View style={styles.typingRow}>
      <AIAvatar />
      <View style={styles.typingBubble}>
        <Animated.Text style={[styles.typingStep, { opacity: fadeAnim }]}>
          {TYPING_STEPS[stepIndex]}
        </Animated.Text>
        <Text style={styles.typingDots}>●●●</Text>
      </View>
    </View>
  );
}

// ─── AI avatar ────────────────────────────────────────────────────────────────

function AIAvatar({ size = 28 }: { size?: number }) {
  return (
    <View style={[styles.aiAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Leaf size={size * 0.45} color={ACCENT} strokeWidth={2} />
    </View>
  );
}

// ─── Shopping card ────────────────────────────────────────────────────────────

function ShoppingCard({ item }: { item: ShoppingLink }) {
  return (
    <TouchableOpacity style={styles.shopCard} onPress={() => Linking.openURL(item.url)} activeOpacity={0.75}>
      <View style={styles.shopCardBody}>
        <Text style={styles.shopTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.shopStore} numberOfLines={1}>{item.store}</Text>
      </View>
      <View style={styles.shopRight}>
        {item.price ? <Text style={styles.shopPrice}>{item.price}</Text> : null}
        <ExternalLink size={13} color={AMBER} strokeWidth={1.5} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 1 && d.getDate() === now.getDate()) return time;
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onLongPress,
}: {
  msg: Message;
  onLongPress: (msg: Message) => void;
}) {
  const isUser = msg.role === 'user';
  const hasSources = !isUser && msg.sources.length > 0;
  const hasShopping = !isUser && msg.shopping.length > 0;
  const timestamp = formatMsgTime(msg.created_at);

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <TouchableOpacity
          style={styles.userBubble}
          onLongPress={() => onLongPress(msg)}
          delayLongPress={400}
          activeOpacity={0.85}
        >
          {msg.image_url ? (
            <Image source={{ uri: msg.image_url }} style={styles.attachedImage} resizeMode="cover" />
          ) : null}
          {msg.content ? (
            <Text style={styles.userText}>{msg.content}</Text>
          ) : null}
        </TouchableOpacity>
        <Text style={styles.msgTimestamp}>{timestamp}</Text>
      </View>
    );
  }

  return (
    <View style={styles.aiRow}>
      <AIAvatar />
      <TouchableOpacity
        style={styles.aiBubble}
        onLongPress={() => onLongPress(msg)}
        delayLongPress={400}
        activeOpacity={1}
      >
        <MarkdownBlock text={msg.content} />

        {hasSources && (
          <View style={styles.sourcesWrap}>
            <Text style={styles.sourcesLabel}>Sources</Text>
            <View style={styles.sourcesList}>
              {msg.sources.map((s, i) => {
                let label = s.title;
                if (!label) {
                  try { label = new URL(s.url).hostname.replace('www.', ''); } catch { label = s.url; }
                }
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.sourceChip}
                    onPress={() => Linking.openURL(s.url)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sourceChipNum}>{i + 1}</Text>
                    <Text style={styles.sourceChipText} numberOfLines={1}>{label}</Text>
                    <ExternalLink size={9} color={ACCENT} strokeWidth={1.5} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {hasShopping && (
          <View style={styles.shopSection}>
            <View style={styles.shopHeader}>
              <ShoppingCart size={12} color={AMBER} strokeWidth={1.5} />
              <Text style={styles.shopHeaderText}>Where to buy</Text>
            </View>
            {msg.shopping.map((item, i) => <ShoppingCard key={i} item={item} />)}
          </View>
        )}

        <Text style={[styles.msgTimestamp, styles.aiTimestamp]}>{timestamp}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function isDbId(id: string) { return /^[0-9a-f-]{36}$/i.test(id); }

function formatStatusTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type LatestScan = {
  disease_name: string;
  is_healthy: boolean;
  confidence: number;
  severity: string | null;
  created_at: string;
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plantId, plantName, fieldName } = useLocalSearchParams<{
    plantId: string; plantName: string; fieldName: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [latestScan, setLatestScan] = useState<LatestScan | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const displayName = plantName ?? 'Plant Chat';
  const displayField = fieldName && fieldName.length > 0 ? fieldName : null;

  const loadLatestScan = useCallback(async () => {
    if (!plantId) return;
    const { data } = await supabase
      .from('scans')
      .select('disease_name, is_healthy, confidence, severity, created_at')
      .eq('plant_id', plantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) setLatestScan(data as LatestScan);
  }, [plantId]);

  const loadHistory = useCallback(async () => {
    if (!plantId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch(`${API_BASE}/chat/${plantId}/history`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      setMessages((json.messages ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ?? [],
        shopping: m.shopping ?? [],
        created_at: m.created_at,
      })));
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    loadHistory();
    loadLatestScan();
  }, [loadHistory, loadLatestScan]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  // ── Image picker ─────────────────────────────────────────────────────────────

  function showImagePicker() {
    Alert.alert('Attach Image', 'Choose a source', [
      { text: 'Camera', onPress: () => pickImage(true) },
      { text: 'Photo Library', onPress: () => pickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickImage(fromCamera: boolean) {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setPendingImage(result.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setPendingImage(result.assets[0].uri);
    }
  }

  async function uploadPendingImage(localUri: string): Promise<string | null> {
    try {
      setUploadingImage(true);
      const filename = localUri.split('/').pop() ?? 'photo.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const path = `chat/${plantId}/${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append('file', { uri: localUri, name: filename, type: mimeType } as unknown as Blob);
      const { error } = await supabase.storage.from('scan-images').upload(path, formData, { contentType: mimeType });
      if (error) return null;
      const { data } = await supabase.storage.from('scan-images').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    } catch { return null; } finally { setUploadingImage(false); }
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !pendingImage) || sending || !plantId) return;

    const localImageUri = pendingImage;
    setPendingImage(null);
    setInput('');
    setSending(true);

    const optimisticUser: Message = {
      id: `opt-${Date.now()}`,
      role: 'user',
      content: text,
      sources: [],
      shopping: [],
      image_url: localImageUri ?? undefined,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUser]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let imageUrl: string | null = null;
      if (localImageUri) imageUrl = await uploadPendingImage(localImageUri);

      const body: Record<string, unknown> = { plant_id: plantId, message: text };
      if (imageUrl) body.image_url = imageUrl;

      const resp = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: err.detail ?? 'Something went wrong. Please try again.',
          sources: [], shopping: [], created_at: new Date().toISOString(),
        }]);
        return;
      }

      const json = await resp.json();
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`, role: 'assistant',
        content: json.reply,
        sources: json.sources ?? [],
        shopping: json.shopping ?? [],
        created_at: new Date().toISOString(),
      }]);
      if (json.credits_remaining != null) setCredits(json.credits_remaining);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  // ── Message actions ───────────────────────────────────────────────────────────

  function handleLongPress(msg: Message) {
    const isUser = msg.role === 'user';

    const deleteMsg = () => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === msg.id);
        const toRemove = new Set([msg.id]);
        if (isUser && idx !== -1 && prev[idx + 1]?.role === 'assistant') {
          toRemove.add(prev[idx + 1].id);
        }
        toRemove.forEach(id => {
          if (isDbId(id)) supabase.from('chat_messages').delete().eq('id', id).then(() => {});
        });
        return prev.filter(m => !toRemove.has(m.id));
      });
    };

    const buttons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
      ...(isUser ? [{
        text: 'Edit',
        onPress: () => {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === msg.id);
            const toRemove = new Set([msg.id]);
            if (idx !== -1 && prev[idx + 1]?.role === 'assistant') toRemove.add(prev[idx + 1].id);
            toRemove.forEach(id => {
              if (isDbId(id)) supabase.from('chat_messages').delete().eq('id', id).then(() => {});
            });
            return prev.filter(m => !toRemove.has(m.id));
          });
          setInput(msg.content);
          setTimeout(() => inputRef.current?.focus(), 100);
        },
      }] : []),
      {
        text: 'Copy',
        onPress: () => Share.share({ message: msg.content }),
      },
      {
        text: 'Delete',
        style: 'destructive' as const,
        onPress: () => Alert.alert(
          'Delete message',
          isUser ? 'This will also remove the AI response.' : 'Remove this message?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: deleteMsg },
          ],
        ),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ];

    Alert.alert('Message options', undefined, buttons);
  }

  const canSend = (input.trim().length > 0 || pendingImage != null) && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color="#E1E3E1" strokeWidth={1.8} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
          {latestScan ? (
            <View style={styles.headerStatusRow}>
              <View style={[styles.headerStatusDot, {
                backgroundColor: latestScan.is_healthy ? ACCENT : RED,
              }]} />
              <Text style={styles.headerSub} numberOfLines={1}>
                {latestScan.is_healthy ? 'Healthy' : latestScan.disease_name}
                {displayField ? `  ·  ${displayField}` : ''}
                {'  ·  '}{formatStatusTime(latestScan.created_at)}
              </Text>
            </View>
          ) : (
            <Text style={styles.headerSub} numberOfLines={1}>
              {displayField ? `${displayField}  ·  Crop Advisor` : 'Crop Advisor'}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {credits != null && (
            <View style={styles.creditsBadge}>
              <Text style={styles.creditsText}>{credits} left</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => router.push('/(tabs)/scan')}
            activeOpacity={0.8}
          >
            <ScanLine size={13} color={BG} strokeWidth={2.2} />
            <Text style={styles.scanBtnText}>Scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={ACCENT} /></View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <MessageBubble msg={item} onLongPress={handleLongPress} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <AIAvatar size={52} />
                <Text style={styles.emptyTitle}>Ask about {displayName}</Text>
                <Text style={styles.emptyBody}>
                  I can see this plant's scan history and search the web for treatment options and product recommendations.
                </Text>
                <View style={styles.suggestionsWrap}>
                  {[
                    'What diseases should I watch for?',
                    'How do I treat the latest scan result?',
                    'What products do you recommend?',
                  ].map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.suggestionChip}
                      onPress={() => setInput(q)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.suggestionText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
            ListFooterComponent={sending ? <TypingIndicator /> : null}
            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
            onScroll={e => {
              const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
              setShowScrollBtn(contentSize.height - layoutMeasurement.height - contentOffset.y > 120);
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (!showScrollBtn) listRef.current?.scrollToEnd({ animated: false });
            }}
          />

          {showScrollBtn && (
            <TouchableOpacity
              style={styles.scrollDownBtn}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              activeOpacity={0.85}
            >
              <ArrowDown size={18} color={BG} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Image preview */}
      {pendingImage && (
        <View style={styles.imagePreviewRow}>
          <Image source={{ uri: pendingImage }} style={styles.imagePreview} resizeMode="cover" />
          <TouchableOpacity style={styles.removeImageBtn} onPress={() => setPendingImage(null)} hitSlop={6}>
            <X size={13} color="#E1E3E1" strokeWidth={2} />
          </TouchableOpacity>
          {uploadingImage && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
        </View>
      )}

      {/* Input row */}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.attachBtn} onPress={showImagePicker} disabled={sending} activeOpacity={0.75}>
          <ImageIcon size={19} color={pendingImage ? ACCENT : SUBTLE} strokeWidth={1.8} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={pendingImage ? 'Add a message…' : 'Message LeafScan AI…'}
          placeholderTextColor={SUBTLE}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color={BG} size="small" />
            : <Send size={16} color={BG} strokeWidth={2} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#E1E3E1', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  headerSub: { color: SUBTLE, fontSize: 11, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  creditsBadge: {
    backgroundColor: ACCENT + '18',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: ACCENT + '28',
  },
  creditsText: { color: ACCENT, fontSize: 11, fontWeight: '600' },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  headerStatusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scanBtnText: { color: BG, fontSize: 12, fontWeight: '700' },

  listContent: { flexGrow: 1, paddingVertical: 20, paddingHorizontal: 16 },

  // User message
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: USER_BUBBLE,
    borderRadius: 20,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ACCENT + '25',
  },
  userText: { color: '#E1E3E1', fontSize: 15, lineHeight: 22 },

  // AI message
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT + '22',
    borderWidth: 1,
    borderColor: ACCENT + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  aiBubble: { flex: 1 },

  // Markdown
  mdWrap: { gap: 8 },
  mdH1: { color: '#E1E3E1', fontSize: 18, fontWeight: '800', letterSpacing: -0.3, lineHeight: 26 },
  mdH2: { color: '#E1E3E1', fontSize: 16, fontWeight: '700', letterSpacing: -0.2, lineHeight: 24 },
  mdH3: { color: '#E1E3E1', fontSize: 14, fontWeight: '700', lineHeight: 22 },
  mdPara: { color: SUBTLE2, fontSize: 15, lineHeight: 24 },
  mdList: { gap: 4 },
  mdListRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  mdBullet: { fontSize: 15, lineHeight: 24, flexShrink: 0 },
  mdListText: { color: SUBTLE2, fontSize: 15, lineHeight: 24, flex: 1 },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: ACCENT,
    backgroundColor: ACCENT + '15',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  codeBlock: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: SUBTLE2,
    lineHeight: 18,
  },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: SUBTLE_BORDER, marginVertical: 4 },

  // Sources
  sourcesWrap: { marginTop: 14, gap: 6 },
  sourcesLabel: { color: SUBTLE, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  sourcesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ACCENT + '10',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: ACCENT + '20',
  },
  sourceChipNum: { color: ACCENT, fontSize: 10, fontWeight: '700' },
  sourceChipText: { color: ACCENT, fontSize: 11, fontWeight: '500', maxWidth: 140 },

  // Shopping
  shopSection: { marginTop: 14, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SUBTLE_BORDER, paddingTop: 12 },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  shopHeaderText: { color: AMBER, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AMBER + '25',
    padding: 10,
    gap: 10,
  },
  shopCardBody: { flex: 1 },
  shopTitle: { color: '#E1E3E1', fontSize: 13, fontWeight: '500', lineHeight: 17 },
  shopStore: { color: SUBTLE, fontSize: 11, marginTop: 2 },
  shopRight: { alignItems: 'flex-end', gap: 4 },
  shopPrice: { color: AMBER, fontSize: 13, fontWeight: '700' },

  // Typing indicator
  typingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  typingBubble: { gap: 4 },
  typingStep: { color: SUBTLE, fontSize: 13 },
  typingDots: { color: ACCENT, fontSize: 11, letterSpacing: 3 },

  // Scroll button
  scrollDownBtn: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
    paddingTop: 60,
  },
  emptyTitle: { color: '#E1E3E1', fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  emptyBody: { color: SUBTLE, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  suggestionsWrap: { marginTop: 8, gap: 8, width: '100%' },
  suggestionChip: {
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CARD,
  },
  suggestionText: { color: SUBTLE2, fontSize: 13, lineHeight: 19 },

  // Timestamps
  msgTimestamp: {
    color: 'rgba(225,227,225,0.30)',
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  aiTimestamp: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },

  // Image attachment
  attachedImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  imagePreviewRow: { marginHorizontal: 16, marginBottom: 8, alignSelf: 'flex-start', position: 'relative' },
  imagePreview: { width: 68, height: 68, borderRadius: 10, borderWidth: 1, borderColor: ACCENT + '40' },
  removeImageBtn: {
    position: 'absolute', top: -5, right: -5,
    backgroundColor: '#2a2a2a', borderRadius: 9,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SUBTLE_BORDER,
    gap: 8,
    backgroundColor: BG,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  input: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#E1E3E1',
    fontSize: 15,
    maxHeight: 130,
    lineHeight: 22,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
});
