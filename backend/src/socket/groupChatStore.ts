import { randomUUID } from "crypto";

const MAX_MESSAGES = 200;
export const GROUP_CHAT_MAX_TEXT = 500;

export type GroupChatMessage = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  text: string;
  at: string;
};

const chats = new Map<string, GroupChatMessage[]>();

export function appendGroupChatMessage(
  groupId: string,
  partial: Omit<GroupChatMessage, "id" | "at"> & { at?: string },
): GroupChatMessage {
  const msg: GroupChatMessage = {
    id: randomUUID(),
    userId: partial.userId,
    firstName: partial.firstName,
    lastName: partial.lastName,
    text: partial.text,
    at: partial.at ?? new Date().toISOString(),
  };
  const arr = chats.get(groupId) ?? [];
  arr.push(msg);
  if (arr.length > MAX_MESSAGES) {
    arr.splice(0, arr.length - MAX_MESSAGES);
  }
  chats.set(groupId, arr);
  return msg;
}

export function getGroupChatHistory(groupId: string): GroupChatMessage[] {
  return [...(chats.get(groupId) ?? [])];
}

export function clearGroupChat(groupId: string): void {
  chats.delete(groupId);
}
