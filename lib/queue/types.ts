export type OutgoingMessageJobPayload = {
  queueRecordId: string;
  kind: "CONVERSATION" | "CAMPAIGN";
  messageId: string;
  conversationId: string;
  mandateId: string;
  phone: string;
  text: string;
  source: "AI" | "HUMAN" | "TEMPLATE";
  scheduledFor: string;
};
