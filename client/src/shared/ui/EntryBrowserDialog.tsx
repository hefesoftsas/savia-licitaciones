import { Button } from './primitives/button';
import { NativeSelect } from './primitives/native-select';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '../i18n';
import AppDialog from './AppDialog';
import EmptyState from './EmptyState';
import InlineSpinner from './InlineSpinner';

export interface EntryBrowserDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kicker: string;
  /** Title shown while loading, after failure, or when no entries exist. */
  fallbackTitle: string;
  cardClassName?: string;
  loadingText: string;
  errorTitle: string;
  emptyTitle: string;
  selectLabel: string;
  /** Labels for navigation buttons, such as "Newer version" and "Older version". */
  newerLabel: string;
  olderLabel: string;
  /** Load entries from newest to oldest; throw on failure to show a retry action. */
  load: () => Promise<T[]>;
  /** Callback invoked whenever the dialog opens. */
  onOpen?: () => void;
  /** Callback after loading entries successfully, used to mark them as read. */
  onLoaded?: (entries: T[]) => void;
  getKey: (entry: T) => string;
  getOptionLabel: (entry: T) => string;
  getTitle: (entry: T) => string;
  renderContent: (entry: T) => ReactNode;
}

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Sidebar content browser that reloads on opening and selects the newest entry.
 * Navigate with the selector or arrows: newer on the left, older on the right.
 */
export default function EntryBrowserDialog<T>({
  open,
  onOpenChange,
  kicker,
  fallbackTitle,
  cardClassName,
  loadingText,
  errorTitle,
  emptyTitle,
  selectLabel,
  newerLabel,
  olderLabel,
  load,
  onOpen,
  onLoaded,
  getKey,
  getOptionLabel,
  getTitle,
  renderContent,
}: EntryBrowserDialogProps<T>) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [entries, setEntries] = useState<T[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const requestIdRef = useRef(0);
  const current = entries[selectedIndex];
  const { t } = useLanguage();

  const loadEntries = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('loading');
    try {
      const list = await load();
      if (requestId !== requestIdRef.current) return;
      setEntries(list);
      setSelectedIndex(0);
      setStatus('ready');
      onLoaded?.(list);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.info(`[${kicker}] load failed`, error);
      setStatus('error');
    }
  }, [kicker, load, onLoaded]);

  useEffect(() => {
    if (!open) return;
    onOpen?.();
    void loadEntries();
    // Run once per opening; changing callback references must not trigger another load.
  }, [open]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      kicker={kicker}
      title={status === 'ready' && current ? getTitle(current) : fallbackTitle}
      cardClassName={cardClassName}
      actions={<Button variant="outline" type="button" className="secondary-action" onClick={() => onOpenChange(false)}>{t('common.close')}</Button>}
    >
      {status === 'loading' ? (
        <div className="entry-browser-loading">
          <InlineSpinner />
          <span>{loadingText}</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <EmptyState className="entry-browser-empty" title={errorTitle} hint={t('common.networkError')}>
          <Button variant="outline" type="button" className="secondary-action" onClick={() => void loadEntries()}>{t('common.retry')}</Button>
        </EmptyState>
      ) : null}

      {status === 'ready' && !current ? <EmptyState className="entry-browser-empty" title={emptyTitle} /> : null}

      {status === 'ready' && current ? (
        <>
          <div className="entry-browser-nav">
            <Button size="content" variant="ghost"
              type="button"
              className="entry-browser-nav-button"
              aria-label={newerLabel}
              title={newerLabel}
              disabled={selectedIndex <= 0}
              onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
            >
              ‹
            </Button>
            <NativeSelect
              className="entry-browser-select"
              aria-label={selectLabel}
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
            >
              {entries.map((entry, index) => (
                <option key={getKey(entry)} value={index}>{getOptionLabel(entry)}</option>
              ))}
            </NativeSelect>
            <Button size="content" variant="ghost"
              type="button"
              className="entry-browser-nav-button"
              aria-label={olderLabel}
              title={olderLabel}
              disabled={selectedIndex >= entries.length - 1}
              onClick={() => setSelectedIndex((index) => Math.min(entries.length - 1, index + 1))}
            >
              ›
            </Button>
          </div>
          {renderContent(current)}
        </>
      ) : null}
    </AppDialog>
  );
}
