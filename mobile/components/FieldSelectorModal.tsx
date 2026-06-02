import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useField } from '../lib/FieldContext';
import type { Field } from '../types';

const BG = '#101A14';
const ACCENT = '#2ED158';
const SUBTLE = 'rgba(225,227,225,0.70)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.14)';

export default function FieldSelectorModal({
  visible,
  onClose,
  startAdding,
}: {
  visible: boolean;
  onClose: () => void;
  startAdding?: boolean;
}) {
  const { fields, selectedField, setSelectedField, refresh } = useField();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && startAdding) {
      setAdding(true);
    }
    if (!visible) {
      setAdding(false);
      setNewName('');
    }
  }, [visible, startAdding]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('fields')
        .insert({ user_id: session.user.id, name })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      setSelectedField(data as Field);
      setNewName('');
      setAdding(false);
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create field');
    } finally {
      setSaving(false);
    }
  }

  function select(field: Field | null) {
    setSelectedField(field);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select Field</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={20} color={SUBTLE} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => select(null)}
              activeOpacity={0.7}
            >
              <View style={styles.fieldDot} />
              <Text style={styles.fieldName}>All Fields</Text>
              {!selectedField && <Check size={16} color={ACCENT} strokeWidth={2.5} />}
            </TouchableOpacity>

            {fields.map(field => (
              <TouchableOpacity
                key={field.id}
                style={styles.fieldRow}
                onPress={() => select(field)}
                activeOpacity={0.7}
              >
                <View style={[styles.fieldDot, { backgroundColor: ACCENT + '55' }]} />
                <Text style={styles.fieldName} numberOfLines={1}>{field.name}</Text>
                {selectedField?.id === field.id && (
                  <Check size={16} color={ACCENT} strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {adding ? (
            <View style={styles.addRow}>
              <TextInput
                ref={inputRef}
                style={styles.addInput}
                placeholder="Field name"
                placeholderTextColor={SUBTLE}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[styles.addConfirm, (!newName.trim() || saving) && styles.addConfirmDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim() || saving}
              >
                {saving
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={styles.addConfirmText}>Add</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setAdding(false); setNewName(''); }}
                hitSlop={10}
              >
                <X size={18} color={SUBTLE} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addFieldBtn}
              onPress={() => setAdding(true)}
              activeOpacity={0.7}
            >
              <Plus size={16} color={ACCENT} strokeWidth={2} />
              <Text style={styles.addFieldText}>New Field</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#182220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingBottom: 36,
    maxHeight: '72%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: SUBTLE_BORDER,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: SUBTLE_BORDER,
  },
  sheetTitle: { color: '#E1E3E1', fontSize: 16, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingTop: 6 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: SUBTLE_BORDER,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(225,227,225,0.20)',
  },
  fieldName: { color: '#E1E3E1', fontSize: 15, fontWeight: '500', flex: 1 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  addInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#E1E3E1',
    fontSize: 14,
  },
  addConfirm: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 52,
    alignItems: 'center',
  },
  addConfirmDisabled: { opacity: 0.4 },
  addConfirmText: { color: BG, fontSize: 14, fontWeight: '700' },
  addFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  addFieldText: { color: ACCENT, fontSize: 14, fontWeight: '600' },
});
