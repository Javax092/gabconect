export const DEMAND_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
export const DEMAND_STATUS_VALUES = ["NEW", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
export const CONVERSATION_STATUS_VALUES = ["OPEN", "HUMAN", "CLOSED"] as const;

export type DemandPriorityValue = (typeof DEMAND_PRIORITY_VALUES)[number];
export type DemandStatusValue = (typeof DEMAND_STATUS_VALUES)[number];
export type ConversationStatusValue = (typeof CONVERSATION_STATUS_VALUES)[number];
