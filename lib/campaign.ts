export type CampaignStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "FINISHED";

export type CampaignAudienceConfig = {
  birthdayMonthDay?: string;
  selectedContactIds?: string[];
};
