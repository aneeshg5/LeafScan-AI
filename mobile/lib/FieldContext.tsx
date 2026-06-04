import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import type { Field } from '../types';

type FieldContextValue = {
  fields: Field[];
  selectedField: Field | null;
  setSelectedField: (field: Field | null) => void;
  refresh: () => Promise<void>;
};

const FieldContext = createContext<FieldContextValue>({
  fields: [],
  selectedField: null,
  setSelectedField: () => {},
  refresh: async () => {},
});

export function useField() {
  return useContext(FieldContext);
}

export function FieldProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedField, setSelectedField] = useState<Field | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('fields')
      .select('*')
      .order('created_at', { ascending: true });
    setFields((data ?? []) as Field[]);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (selectedField && !fields.find(f => f.id === selectedField.id)) {
      setSelectedField(null);
    }
  }, [fields, selectedField]);

  return (
    <FieldContext.Provider value={{ fields, selectedField, setSelectedField, refresh }}>
      {children}
    </FieldContext.Provider>
  );
}
