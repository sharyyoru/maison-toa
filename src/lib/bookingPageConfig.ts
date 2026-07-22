import type { PageConfig } from "@/components/PageBuilder/types";

export function mergePageConfig(
  defaultConfig: PageConfig,
  savedConfig: Partial<PageConfig>
): PageConfig {
  return {
    ...defaultConfig,
    ...savedConfig,
    settings: {
      ...defaultConfig.settings,
      ...savedConfig.settings,
    },
  };
}
