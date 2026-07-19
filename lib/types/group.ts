export type GroupMeetup = {
  id: string;
  title: string;
  description: string;
  city: string;
  district: string;
  hostLabel: string;
  meetType: string;
  maxMembers: number;
  memberCount: number;
  nextAt: string | null;
  tags: string[];
  createdAt: string;
};
