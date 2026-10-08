import { Whiteboard } from '../../../components/Whiteboard';

interface RoomPageProps {
  params: {
    roomId: string;
  };
}

export default function RoomPage({ params }: RoomPageProps) {
  return <Whiteboard roomId={params.roomId} />;
}
