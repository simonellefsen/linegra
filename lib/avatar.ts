import { Person } from '../types';

const DEFAULT_AVATARS: Record<Person['gender'], string> = {
  M: '/avatars/male.svg',
  F: '/avatars/female.svg',
  O: '/avatars/unknown.svg',
};

export const getDefaultAvatarByGender = (gender?: Person['gender']): string => {
  if (!gender) return DEFAULT_AVATARS.O;
  return DEFAULT_AVATARS[gender] ?? DEFAULT_AVATARS.O;
};

export const getAvatarForPerson = (person: Person): string => {
  return person.photoUrl || getDefaultAvatarByGender(person.gender);
};

export { DEFAULT_AVATARS };
