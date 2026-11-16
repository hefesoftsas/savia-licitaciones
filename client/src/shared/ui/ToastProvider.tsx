import { Button } from './primitives/button';
import * as Toast from '@/shared/ui/primitives/toast';
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { useLanguage } from '../i18n';
import { localizeRuntimeText } from '../i18n/localizeRuntimeText';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick?: () => void | Promise<void>;
  close?: boolean;
  variant?: 'primary' | 'secondary';
}

export interface ToastOptions {
  title?: string;
  duration?: number;
  persistent?: boolean;
  actions?: ToastAction[];
}

interface ToastItem {
  id: number;
  title?: string;
  message: string;
  type: ToastType;
  duration: number;
  actions?: ToastAction[];
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

interface ToastState {
  items: ToastItem[];
  sessionId: number;
}

type ToastStateAction =
  | { type: 'add'; item: ToastItem }
  | { type: 'dismiss'; id: number };

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

// Resolve default titles through the shared language dictionary.
function getDefaultToastTitle(type: ToastType, t: (key: 'common.done' | 'common.error' | 'common.info') => string): string {
  if (type === 'success') return t('common.done');
  if (type === 'error') return t('common.error');
  return t('common.info');
}

const getToastDuration = (type: ToastType) => (type === 'error' ? 5000 : 2000);
const persistentToastDuration = 2147483647;

const initialToastState: ToastState = {
  items: [],
  sessionId: 0,
};

// Remount the Radix provider for each new batch to clear stale pause state.
function toastReducer(state: ToastState, action: ToastStateAction): ToastState {
  if (action.type === 'add') {
    return {
      items: [...state.items.filter(item => item.message !== action.item.message || item.type !== action.item.type || item.actions?.length || action.item.actions?.length), action.item],
      sessionId: state.items.length === 0 ? state.sessionId + 1 : state.sessionId,
    };
  }

  const items = state.items.filter((item) => item.id !== action.id);
  return items.length === state.items.length ? state : { ...state, items };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [{ items: toasts, sessionId }, dispatch] = useReducer(toastReducer, initialToastState);
  const { t, language } = useLanguage();

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'dismiss', id });
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', options: ToastOptions = {}) => {
    const id = ++toastId;
    dispatch({
      type: 'add',
      item: {
        id,
        title: options.title,
        message,
        type,
        duration: options.persistent ? persistentToastDuration : options.duration || getToastDuration(type),
        actions: options.actions,
      },
    });
    return id;
  }, []);

  const handleActionClick = useCallback((item: ToastItem, action: ToastAction) => {
    const shouldClose = action.close !== false;
    try {
      const result = action.onClick?.();
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>)
          .catch((error) => console.warn('Toast action failed', error))
          .finally(() => {
            if (shouldClose) {
              dismissToast(item.id);
            }
          });
        return;
      }
    } catch (error) {
      console.warn('Toast action failed', error);
    }

    if (shouldClose) {
      dismissToast(item.id);
    }
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast.Provider key={sessionId} swipeDirection="right">
        {toasts.map((item) => (
          <Toast.Root
            className={`app-toast is-${item.type}${item.actions?.length ? ' has-actions' : ''}`}
            duration={item.duration}
            key={item.id}
            onOpenChange={(open) => {
              if (!open) {
                dismissToast(item.id);
              }
            }}
          >
            <Toast.Title className="app-toast-title">{localizeRuntimeText(item.title || getDefaultToastTitle(item.type, t), language)}</Toast.Title>
            <Toast.Description className="app-toast-description">{localizeRuntimeText(item.message, language)}</Toast.Description>
            {item.actions?.length ? (
              <div className="app-toast-actions">
                {item.actions.map((action) => (
                  <Button size="content" variant="ghost"
                    type="button"
                    className={`app-toast-action is-${action.variant || 'secondary'}`}
                    key={action.label}
                    onClick={() => handleActionClick(item, action)}
                  >
                    {localizeRuntimeText(action.label, language)}
                  </Button>
                ))}
              </div>
            ) : null}
            <Toast.Close className="app-toast-close" aria-label={t('toast.close')}>×</Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="app-toast-viewport" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
