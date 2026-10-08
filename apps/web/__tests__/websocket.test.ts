import { WhiteboardWsClient } from '../lib/websocket/client';
import { Stroke } from '@whiteboard/shared';

class MockWebSocket {
  public static OPEN = 1;
  public static CLOSED = 3;
  public readyState = MockWebSocket.OPEN;
  public url: string;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: (() => void) | null = null;
  public sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
    const parsed = JSON.parse(data);
    if (parsed.event === 'auth:authenticate') {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({
            data: JSON.stringify({
              event: 'auth:success',
              data: {
                authenticated: true,
                user: { id: 'user-1', email: 'test@example.com', displayName: 'Alice' },
              },
            }),
          });
        }
      }, 0);
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

(global as any).WebSocket = MockWebSocket;

describe('WhiteboardWsClient (Phase 6 Explicit Auth Handshake & Rooms)', () => {
  let client: WhiteboardWsClient;

  beforeEach(() => {
    client = new WhiteboardWsClient('ws://localhost:3001');
    client.setAuthToken('valid-mock-token');
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should initialize with client ID and default display name', () => {
    expect(client.getClientId()).toBeDefined();
    expect(client.getDisplayName()).toMatch(/^User-\d+/);
  });

  it('should send auth:authenticate on connect and send room:join after auth:success', (done) => {
    client.connect();

    setTimeout(() => {
      client.joinRoom('room-alpha', 'Alice');

      setTimeout(() => {
        const mockWs = (client as any).ws as MockWebSocket;
        expect(mockWs.sentMessages.length).toBeGreaterThan(0);
        const joinMsg = mockWs.sentMessages.map(m => JSON.parse(m)).find(m => m.event === 'room:join');

        expect(joinMsg).toBeDefined();
        expect(joinMsg.event).toBe('room:join');
        expect(joinMsg.data.roomId).toBe('room-alpha');
        expect(joinMsg.data.displayName).toBe('Alice');
        expect(client.getCurrentRoomId()).toBe('room-alpha');
        done();
      }, 20);
    }, 20);
  });

  it('should send cursor:move event after authentication', (done) => {
    client.connect();

    setTimeout(() => {
      client.joinRoom('room-alpha', 'Alice');

      setTimeout(() => {
        client.sendCursorMove('room-alpha', 150, 300);
        const mockWs = (client as any).ws as MockWebSocket;
        const lastMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);

        expect(lastMsg.event).toBe('cursor:move');
        expect(lastMsg.data.roomId).toBe('room-alpha');
        expect(lastMsg.data.x).toBe(150);
        expect(lastMsg.data.y).toBe(300);
        done();
      }, 20);
    }, 20);
  });

  it('should format and send room-aware stroke:add message after authentication', (done) => {
    client.connect();

    setTimeout(() => {
      client.joinRoom('room-alpha');

      setTimeout(() => {
        const testStroke: Stroke = {
          id: 'stroke-room-1',
          points: [{ x: 10, y: 10 }],
          color: '#10b981',
          width: 4,
          tool: 'pen',
        };

        client.sendStrokeAdd('room-alpha', testStroke);

        const mockWs = (client as any).ws as MockWebSocket;
        const lastMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);

        expect(lastMsg.event).toBe('stroke:add');
        expect(lastMsg.data.roomId).toBe('room-alpha');
        expect(lastMsg.data.stroke.id).toBe('stroke-room-1');
        done();
      }, 20);
    }, 20);
  });
});
