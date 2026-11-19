import {
  AnalyticsSection, FilesSection, HomeSection, LoginsSection, MeetingsSection,
  MessagesSection, ShootsSection, StrategySection, type PortalCtx, type Section,
} from "./sections";

const PAGES: Record<Section, (ctx: PortalCtx) => Promise<React.ReactNode>> = {
  home: HomeSection,
  // Tasks and Activity are on Home now; old links (emails, notifications) land there.
  tasks: HomeSection,
  messages: MessagesSection,
  activity: HomeSection,
  files: FilesSection,
  strategy: StrategySection,
  analytics: AnalyticsSection,
  meetings: MeetingsSection,
  logins: LoginsSection,
  shoots: ShootsSection,
};

export const renderSection = (name: Section, ctx: PortalCtx) => PAGES[name](ctx);
