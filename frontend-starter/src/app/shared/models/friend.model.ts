export type FriendKind = 'accepted' | 'incoming' | 'outgoing';
export interface FriendPerson { id: string; name: string; }
export interface Friendship { id: string; status: 'pending' | 'accepted'; createdAt: string; user: FriendPerson; }
export interface FriendLookup {
  user: FriendPerson;
  relation: { id: string; status: 'pending' | 'accepted'; direction: 'incoming' | 'outgoing' } | null;
}
