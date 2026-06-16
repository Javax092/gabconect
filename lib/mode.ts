import type { CampaignAudienceFilter } from "@/lib/campaign-audience";
import type { CampaignMode } from "@/lib/validations/campaign";

function normalizeList(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function resolveAudienceFilterByMode(input: {
  mode: CampaignMode;
  selectedContactIds?: string[] | null;
  birthdayMonthDay?: string | null;
  tags?: string[] | null;
  groups?: string[] | null;
  priorities?: string[] | null;
  locations?: string[] | null;
  interests?: string[] | null;
  contactTypes?: string[] | null;
}): Required<CampaignAudienceFilter> {
  const emptyFilters = {
    tags: [],
    groups: [],
    priorities: [],
    locations: [],
    interests: [],
    contactTypes: [],
    selectedContactIds: []
  };

  if (input.mode === "TEST" || input.mode === "FIRST_CONTACT") {
    return {
      birthdayMonthDay: null,
      ...emptyFilters,
      selectedContactIds: normalizeList(input.selectedContactIds)
    };
  }

  if (input.mode === "BIRTHDAY") {
    return {
      birthdayMonthDay: input.birthdayMonthDay ?? null,
      ...emptyFilters
    };
  }

  return {
    birthdayMonthDay: null,
    tags: normalizeList(input.tags),
    groups: normalizeList(input.groups),
    priorities: normalizeList(input.priorities),
    locations: normalizeList(input.locations),
    interests: normalizeList(input.interests),
    contactTypes: normalizeList(input.contactTypes),
    selectedContactIds: []
  };
}
