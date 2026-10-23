import { FriendPerson } from './friend.model';

export type JamKind = 'joined' | 'invitations';
export interface JamSummary {
  id: string;
  name: string;
  host: FriendPerson;
  createdAt: string;
  role: 'host' | 'participant' | 'invited';
}
export interface Jam extends JamSummary {
  participants: FriendPerson[];
  invitations: FriendPerson[];
}
