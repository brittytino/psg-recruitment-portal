/**
 * Admin-configurable settings. Defaults apply until an Admin saves a value. Rules that still need
 * college confirmation are switches here rather than hard-coded behaviour.
 */
export const SETTINGS = {
  hodLoginOtp: {
    label: "Require an e-mail code when HODs sign in",
    help: "Admin and HR – N4 Section always need a code.",
    default: true,
  },
  hrCanApprovePositionChange: {
    label: "Allow HR – N4 Section to approve position changes",
    help: "By default only Admin (Dean / Principal) approves a HOD's recommendation.",
    default: false,
  },
  printEmployerEndorsement: {
    label: "Print the present-employer endorsement block on applications",
    help: "Kept from the official form unless the college approves its removal.",
    default: true,
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;
