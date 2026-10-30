/**
 * Settings managed by the Super Admin. Defaults apply until a value is saved. Rules that still need
 * college confirmation are switches here rather than hard-coded behaviour.
 */
export const SETTING_GROUPS = {
  portal: "Switches",
  policy: "Recruitment rules",
} as const;

export const SETTINGS = {
  acceptRegistrations: {
    group: "portal",
    label: "Allow new candidate accounts",
    help: "Turn off to stop new registrations (existing candidates can still sign in).",
    default: true,
  },
  acceptSubmissions: {
    group: "portal",
    label: "Accept application submissions",
    help: "Turn off to pause all new and resubmitted applications, e.g. during verification. Drafts are kept.",
    default: true,
  },
  hodLoginOtp: {
    group: "policy",
    label: "Require an e-mail code when HODs sign in",
    help: "Admin and HR – N4 Section always need a code.",
    default: true,
  },
  hrCanApprovePositionChange: {
    group: "policy",
    label: "Allow HR – N4 Section to approve position changes",
    help: "By default only Admin (Dean / Principal) approves a HOD's recommendation.",
    default: false,
  },
  printEmployerEndorsement: {
    group: "policy",
    label: "Print the present-employer endorsement block on applications",
    help: "Kept from the official form unless the college approves its removal.",
    default: true,
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;
