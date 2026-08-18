export class ClosedWidgetHintStorage {
  private static readonly STORAGE_PREFIX = 'punku-chat-hint-shown';

  /**
   * Get storage key for the current domain and flow
   */
  private static getStorageKey(flowId: string, domain: string = window.location.hostname): string {
    return `${this.STORAGE_PREFIX}-${domain}-${flowId}`;
  }

  /**
   * Check if sessionStorage is available
   */
  private static isStorageAvailable(): boolean {
    try {
      const test = '__punku_hint_storage_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Whether the closed-widget hint was already shown during this browsing session.
   * Falls back to false (hint shows again) when sessionStorage is unavailable.
   */
  static hasBeenShown(flowId: string): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      return sessionStorage.getItem(this.getStorageKey(flowId)) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Remember that the closed-widget hint was shown during this browsing session.
   */
  static markShown(flowId: string): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      sessionStorage.setItem(this.getStorageKey(flowId), 'true');
    } catch {
      // Storage write failed; the hint will show again on the next page.
    }
  }
}
