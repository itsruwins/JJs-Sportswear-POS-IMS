import type { NameParts } from "@/features/shared/names/model";

export type Props = {
    uid: string;
    username: string;
    initials: string;
    fullName: string | null;
    name: NameParts;
    phone: string | null;
    email: string | null;
    avatarUrl: string | null;
    joined: string;
  };