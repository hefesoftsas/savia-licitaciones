// External networking disabled: no remote endpoints. Local logic only (localStorage).
const DISMISSED_NOTICE_ID_KEY = 'remote_notice_dismissed_id';
const SEEN_NOTICE_UPDATED_AT_KEY = 'remote_notice_seen_updated_at';
export const NOTICE_SEEN_EVENT = 'savia:remote-notice-seen';

export interface NoticeEntry {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface RemoteNotice {
  id: string;
  projectName: string;
  enabled: boolean;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function readDismissedNoticeId() {
  try {
    return localStorage.getItem(DISMISSED_NOTICE_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function hasDismissedRemoteNotice(noticeId: string) {
  return Boolean(noticeId) && readDismissedNoticeId() === noticeId;
}

export function dismissRemoteNotice(noticeId: string) {
  if (!noticeId) return;

  try {
    localStorage.setItem(DISMISSED_NOTICE_ID_KEY, noticeId);
  } catch {
    // Failure to record notice dismissal does not interrupt the main flow; the next poll may show the same notice again.
  }
}

// External networking disabled: no reporting or fetch requests. Signature preserved.
export async function reportRemoteNoticeDelivered(_notice: Pick<RemoteNotice, 'id' | 'projectName'>) {
  return;
}

// External networking disabled: always null, with no fetch requests. Signature preserved.
export async function fetchRemoteNotice(): Promise<RemoteNotice | null> {
  return null;
}

// External networking disabled: always an empty list, with no fetch requests. Signature preserved.
export async function fetchNoticeList(): Promise<NoticeEntry[]> {
  return [];
}

// External networking disabled: always null, with no fetch requests. Signature preserved.
export async function fetchLatestNoticeUpdatedAt(): Promise<string | null> {
  return null;
}

export function readSeenNoticeUpdatedAt() {
  try {
    return localStorage.getItem(SEEN_NOTICE_UPDATED_AT_KEY) || '';
  } catch {
    return '';
  }
}

// Record the latest read notice update time monotonically and notify the sidebar to reevaluate its unread dot.
export function markNoticeSeen(updatedAt: string) {
  if (!updatedAt || updatedAt <= readSeenNoticeUpdatedAt()) return;

  try {
    localStorage.setItem(SEEN_NOTICE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // Failure to save read status does not interrupt the main flow; the unread dot may reappear on the next check.
  }
  window.dispatchEvent(new Event(NOTICE_SEEN_EVENT));
}

// Server update times use YYYY-MM-DD HH:mm:ss and compare lexically; no read record means unread.
export function isNoticeUnread(latestUpdatedAt: string) {
  return Boolean(latestUpdatedAt) && latestUpdatedAt > readSeenNoticeUpdatedAt();
}
