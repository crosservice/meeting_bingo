'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface SocketContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
  joinMeeting: (meetingId: string) => void;
  leaveMeeting: () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: 'disconnected',
  joinMeeting: () => {},
  leaveMeeting: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const meetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = io(API_URL, {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      // Rejoin meeting room on reconnect
      if (meetingIdRef.current) {
        socket.emit('join.meeting', { meeting_id: meetingIdRef.current });
      }
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinMeeting = useCallback((meetingId: string) => {
    meetingIdRef.current = meetingId;
    if (socketRef.current?.connected) {
      socketRef.current.emit('join.meeting', { meeting_id: meetingId });
    }
  }, []);

  const leaveMeeting = useCallback(() => {
    if (socketRef.current?.connected && meetingIdRef.current) {
      socketRef.current.emit('leave.meeting');
    }
    meetingIdRef.current = null;
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        status,
        joinMeeting,
        leaveMeeting,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Hook to listen for a specific socket event.
 */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    const listener = (data: T) => handlerRef.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
