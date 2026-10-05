import {
  ActivitySection, AnalyticsSection, FilesSection, HomeSection, LoginsSection, MeetingsSection,
  MessagesSection, StrategySection, TasksSection, type PortalCtx, type Section,
} from "./sections";

const PAGES: Record<Section, (ctx: PortalCtx) => Promise<React.ReactNode>> = {
  home: HomeSection,
  tasks: TasksSection,
  messages: MessagesSection,
  activity: ActivitySection,
  files: FilesSection,
  strategy: StrategySection,
  analytics: AnalyticsSection,
  meetings: MeetingsSection,
  logins: LoginsSection,
};

export const renderSection = (name: Section, ctx: PortalCtx) => PAGES[name](ctx);
