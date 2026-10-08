import { redirect } from 'next/navigation';

export default function WhiteboardLobbyPage() {
  const newRoomId = Math.random().toString(36).substring(2, 10);
  redirect(`/whiteboard/${newRoomId}`);
}
