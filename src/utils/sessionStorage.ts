import { ChatMessageType } from "../types/chatWidget";

const { v4: uuidv4 } = require('uuid');

export interface StoredSession {
  sessionId: string;
  messages: ChatMessageType[];
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  domain: string;
  flowId: string;
}

export interface SessionConfig {
  expiryHours?: number;
  idleExpiryHours?: number;
}

export class SessionStorage {
  private static readonly STORAGE_PREFIX = 'punku-chat-session';
  private static readonly DEFAULT_EXPIRY_HOURS = 24; // 1 day
  private static readonly DEFAULT_IDLE_EXPIRY_HOURS = 0.5 // 30 minutes

  /**
   * Get storage key for the current domain and flow
   */
  private static getStorageKey(flowId: string, domain: string = window.location.hostname): string {
    return `${this.STORAGE_PREFIX}-${domain}-${flowId}`;
  }

  /**
   * Check if localStorage is available
   */
  private static isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get stored session data from localStorage
   */
  static getStoredSession(flowId: string): StoredSession | null {
    if (!this.isStorageAvailable()) {
      console.warn('Local storage is not available');
      return null;
    }

    try {
      const storageKey = this.getStorageKey(flowId);
      const storedData = localStorage.getItem(storageKey);

      if (!storedData) {
        return null;
      }

      const session = JSON.parse(storedData) as StoredSession;

      // Validate the stored data structure
      if (!session.sessionId || !Array.isArray(session.messages) || !session.createdAt) {
        console.warn('Invalid session data structure, clearing...');
        this.clearSession(flowId);
        return null;
      }

      return session;
    } catch (error) {
      console.warn('Failed to parse stored session data:', error);
      // Clear corrupted data
      this.clearSession(flowId);
      return null;
    }
  }

  /**
   * Save session data to localStorage
   */
  static saveSession(session: StoredSession): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      const storageKey = this.getStorageKey(session.flowId, session.domain);
      localStorage.setItem(storageKey, JSON.stringify(session));
      return true;
    } catch (error) {
      console.warn('Failed to save session to localStorage:', error);
      return false;
    }
  }

  /**
   * Update messages in stored session
   */
  static updateMessages(flowId: string, messages: ChatMessageType[]): boolean {
    const session = this.getStoredSession(flowId);
    if (!session) {
      return false;
    }

    session.messages = messages;
    session.lastActiveAt = Date.now();

    return this.saveSession(session);
  }

  /**
   * Update session ID (when server provides new one)
   */
  static updateSessionId(flowId: string, newSessionId: string): boolean {
    const session = this.getStoredSession(flowId);
    if (!session) {
      return false;
    }

    session.sessionId = newSessionId;
    session.lastActiveAt = Date.now();

    return this.saveSession(session);
  }

  /**
   * Check if session is expired
   */
  static isSessionExpired(session: StoredSession, config: SessionConfig = {}): boolean {
    const now = Date.now();
    const expiryHours = config.expiryHours || this.DEFAULT_EXPIRY_HOURS;
    const idleExpiryHours = config.idleExpiryHours || this.DEFAULT_IDLE_EXPIRY_HOURS;

    // Check absolute expiration
    const absoluteExpiry = session.expiresAt || (session.createdAt + (expiryHours * 60 * 60 * 1000));
    if (now > absoluteExpiry) {
      // console.log('Session expired by absolute expiry');
      return true;
    }

    // Check idle expiration
    const idleExpiry = session.lastActiveAt + (idleExpiryHours * 60 * 60 * 1000);
    if (now > idleExpiry) {
      // console.log('Session expired by idle expiry');
      return true;
    }

    return false;
  }

  /**
   * Create a new session
   */
  static createSession(
    flowId: string,
    providedSessionId?: string,
    config: SessionConfig = {}
  ): StoredSession {
    const now = Date.now();
    const expiryHours = config.expiryHours || this.DEFAULT_EXPIRY_HOURS;

    const session: StoredSession = {
      sessionId: providedSessionId || uuidv4(),
      messages: [],
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + (expiryHours * 60 * 60 * 1000),
      domain: window.location.hostname,
      flowId: flowId
    };

    this.saveSession(session);
    return session;
  }

  /**
   * Clear session from localStorage
   */
  static clearSession(flowId: string): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const storageKey = this.getStorageKey(flowId);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Failed to clear session from localStorage:', error);
    }
  }

  /**
   * Get or create session - main entry point
   */
  static getOrCreateSession(
    flowId: string,
    providedSessionId?: string,
    config: SessionConfig = {}
  ): { sessionId: string; messages: ChatMessageType[]; isNewSession: boolean } {

    // If session ID is explicitly provided, create new session with that ID
    if (providedSessionId) {
      const session = this.createSession(flowId, providedSessionId, config);
      return {
        sessionId: session.sessionId,
        messages: [],
        isNewSession: true
      };
    }

    // Try to get existing session
    const existingSession = this.getStoredSession(flowId);

    if (existingSession && !this.isSessionExpired(existingSession, config)) {
      // Update last active time
      existingSession.lastActiveAt = Date.now();
      this.saveSession(existingSession);

      return {
        sessionId: existingSession.sessionId,
        messages: existingSession.messages,
        isNewSession: false
      };
    }

    // Create new session (cleanup old one if it exists)
    if (existingSession) {
      this.clearSession(flowId);
    }

    const newSession = this.createSession(flowId, undefined, config);
    return {
      sessionId: newSession.sessionId,
      messages: [],
      isNewSession: true
    };
  }

  /**
   * Cleanup expired sessions (maintenance function)
   */
  static cleanupExpiredSessions(config: SessionConfig = {}): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            try {
              const session = JSON.parse(stored) as StoredSession;
              if (this.isSessionExpired(session, config)) {
                keysToRemove.push(key);
              }
            } catch {
              // Invalid data, mark for removal
              keysToRemove.push(key);
            }
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('Failed to cleanup expired sessions:', error);
    }
  }
}