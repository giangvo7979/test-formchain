import { create } from 'zustand';
import { FormConfig, FormResponse } from '../types';

interface AppState {
  forms: FormConfig[];
  responses: FormResponse[];
  readResponseIds: Set<string>;

  addForm: (form: FormConfig) => void;
  updateForm: (id: string, updates: Partial<FormConfig>) => void;
  deleteForm: (id: string) => void;
  setForms: (forms: FormConfig[]) => void;

  addResponse: (response: FormResponse) => void;
  setResponses: (formId: string, responses: FormResponse[]) => void;
  updateResponse: (id: string, updates: Partial<FormResponse>) => void;

  markAsRead: (responseId: string) => void;
  markAllAsRead: (formId: string) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  forms: [],
  responses: [],
  readResponseIds: new Set<string>(),

  addForm: (form) =>
    set((state) => ({
      forms: [form, ...state.forms.filter((f) => f.id !== form.id)],
    })),

  updateForm: (id, updates) =>
    set((state) => ({
      forms: state.forms.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),

  deleteForm: (id) =>
    set((state) => ({
      forms: state.forms.filter((f) => f.id !== id),
      responses: state.responses.filter((r) => r.formId !== id),
    })),

  setForms: (forms) => set({ forms }),

  addResponse: (response) =>
    set((state) => ({
      responses: [response, ...state.responses.filter((r) => r.id !== response.id)],
    })),

  setResponses: (formId, responses) =>
    set((state) => ({
      responses: [
        ...state.responses.filter((r) => r.formId !== formId),
        ...responses,
      ],
    })),

  updateResponse: (id, updates) =>
    set((state) => ({
      responses: state.responses.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),

  markAsRead: (responseId) =>
    set((state) => ({
      readResponseIds: new Set([...state.readResponseIds, responseId]),
    })),

  markAllAsRead: (formId) =>
    set((state) => {
      const newIds = state.responses
        .filter((r) => r.formId === formId)
        .map((r) => r.id);
      return { readResponseIds: new Set([...state.readResponseIds, ...newIds]) };
    }),
}));