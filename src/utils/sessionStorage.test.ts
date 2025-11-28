import { SessionStorage, StoredSession, SessionConfig } from './sessionStorage';

// Mock uuid with CommonJS-compatible approach
jest.mock('uuid', () => {
  return {
    __esModule: true,
    v4: () => 'mock-uuid-1234',
    default: { v4: () => 'mock-uuid-1234' }
  };
});

describe('SessionStorage', () => {
  const flowId = 'test-flow-id';
  const domain = 'localhost';

  // Create a simple localStorage mock that just works
  let mockStorage: Record<string, string> = {};
  let removeItemSpy: jest.SpyInstance;

  beforeAll(() => {
    // Create a working localStorage implementation
    const localStorageImpl = {
      getItem(key: string): string | null {
        return mockStorage[key] ?? null;
      },
      setItem(key: string, value: string): void {
        mockStorage[key] = value;
      },
      removeItem(key: string): void {
        delete mockStorage[key];
      },
      clear(): void {
        mockStorage = {};
      },
      key(index: number): string | null {
        return Object.keys(mockStorage)[index] ?? null;
      },
      get length(): number {
        return Object.keys(mockStorage).length;
      }
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageImpl,
      writable: true
    });

    Object.defineProperty(window, 'location', {
      value: { hostname: domain },
      writable: true
    });
  });

  beforeEach(() => {
    // Clear storage before each test - must clear the same object, not reassign
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    // Reset spy if exists
    if (removeItemSpy) {
      removeItemSpy.mockRestore();
    }
    removeItemSpy = jest.spyOn(window.localStorage, 'removeItem');
  });

  afterEach(() => {
    if (removeItemSpy) {
      removeItemSpy.mockRestore();
    }
  });

  describe('isSessionExpired', () => {
    it('should return true when session is past absolute expiry', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now() - 86400000 * 2,
        lastActiveAt: Date.now(),
        expiresAt: Date.now() - 1000,
        domain: domain,
        flowId: flowId
      };

      expect(SessionStorage.isSessionExpired(mockSession)).toBe(true);
    });

    it('should return true when session is past idle expiry', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now() - 3600000,
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const config: SessionConfig = {
        idleExpiryHours: 0.5
      };

      expect(SessionStorage.isSessionExpired(mockSession, config)).toBe(true);
    });

    it('should return false when session is still valid', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      expect(SessionStorage.isSessionExpired(mockSession)).toBe(false);
    });

    it('should use default idle expiry when not specified', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now() - 2 * 60 * 60 * 1000,
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      expect(SessionStorage.isSessionExpired(mockSession)).toBe(true);
    });
  });

  describe('getStoredSession', () => {
    it('should return null when no session exists', () => {
      const result = SessionStorage.getStoredSession(flowId);
      expect(result).toBeNull();
    });

    it('should return stored session when it exists', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify(mockSession);

      const result = SessionStorage.getStoredSession(flowId);
      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('test-session-id');
    });

    it('should return null when session structure is invalid', () => {
      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify({
        sessionId: null,
        messages: [],
        createdAt: Date.now()
      });

      const result = SessionStorage.getStoredSession(flowId);
      expect(result).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('should save session to localStorage', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const result = SessionStorage.saveSession(mockSession);
      expect(result).toBe(true);

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      expect(mockStorage[storageKey]).toBeDefined();
    });
  });

  describe('updateMessages', () => {
    it('should update messages in stored session', () => {
      const mockSession: StoredSession = {
        sessionId: 'test-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify(mockSession);

      const newMessages = [{ message: 'Hello', isSend: true }];
      const result = SessionStorage.updateMessages(flowId, newMessages);

      expect(result).toBe(true);
    });

    it('should return false when no session exists', () => {
      const result = SessionStorage.updateMessages(flowId, []);
      expect(result).toBe(false);
    });
  });

  describe('updateSessionId', () => {
    it('should update session ID', () => {
      const mockSession: StoredSession = {
        sessionId: 'old-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify(mockSession);

      const result = SessionStorage.updateSessionId(flowId, 'new-session-id');
      expect(result).toBe(true);
    });

    it('should return false when no session exists', () => {
      const result = SessionStorage.updateSessionId(flowId, 'new-session-id');
      expect(result).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const session = SessionStorage.createSession(flowId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.flowId).toBe(flowId);
      expect(session.messages).toEqual([]);
      expect(session.domain).toBe(domain);
    });

    it('should create a new session with provided session ID', () => {
      const providedId = 'provided-session-id';
      const session = SessionStorage.createSession(flowId, providedId);

      expect(session.sessionId).toBe(providedId);
    });

    it('should use custom expiry hours from config', () => {
      const config: SessionConfig = { expiryHours: 48 };
      const now = Date.now();
      const session = SessionStorage.createSession(flowId, undefined, config);

      expect(session.expiresAt).toBeGreaterThan(now + 47 * 60 * 60 * 1000);
      expect(session.expiresAt).toBeLessThan(now + 49 * 60 * 60 * 1000);
    });
  });

  describe('clearSession', () => {
    it('should remove session from localStorage', () => {
      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify({ sessionId: 'test' });

      SessionStorage.clearSession(flowId);

      expect(mockStorage[storageKey]).toBeUndefined();
    });
  });

  describe('getOrCreateSession', () => {
    it('should create new session when none exists', () => {
      const result = SessionStorage.getOrCreateSession(flowId);

      expect(result.isNewSession).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.messages).toEqual([]);
    });

    it('should create new session when provided session ID is given', () => {
      const providedId = 'provided-session-id';
      const result = SessionStorage.getOrCreateSession(flowId, providedId);

      expect(result.isNewSession).toBe(true);
      expect(result.sessionId).toBe(providedId);
    });

    it('should return existing session when valid', () => {
      const mockSession: StoredSession = {
        sessionId: 'existing-session-id',
        messages: [{ message: 'Hello', isSend: true }],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: domain,
        flowId: flowId
      };

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify(mockSession);

      const result = SessionStorage.getOrCreateSession(flowId);

      expect(result.isNewSession).toBe(false);
      expect(result.sessionId).toBe('existing-session-id');
    });

    it('should create new session when existing session is expired', () => {
      const mockSession: StoredSession = {
        sessionId: 'expired-session-id',
        messages: [],
        createdAt: Date.now() - 86400000 * 2,
        lastActiveAt: Date.now() - 86400000 * 2,
        expiresAt: Date.now() - 1000,
        domain: domain,
        flowId: flowId
      };

      const storageKey = `punku-chat-session-${domain}-${flowId}`;
      mockStorage[storageKey] = JSON.stringify(mockSession);

      const result = SessionStorage.getOrCreateSession(flowId);

      expect(result.isNewSession).toBe(true);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', () => {
      const expiredSession: StoredSession = {
        sessionId: 'expired-session',
        messages: [],
        createdAt: Date.now() - 86400000 * 2,
        lastActiveAt: Date.now() - 86400000 * 2,
        expiresAt: Date.now() - 1000,
        domain: domain,
        flowId: 'expired-flow'
      };

      const storageKey = `punku-chat-session-${domain}-expired-flow`;
      mockStorage[storageKey] = JSON.stringify(expiredSession);

      SessionStorage.cleanupExpiredSessions();

      // After cleanup, the key should have been removed
      expect(removeItemSpy).toHaveBeenCalled();
    });
  });
});
