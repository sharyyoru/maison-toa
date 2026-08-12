type LegacyNode = {
  type?: string;
  data?: {
    triggerType?: string;
    config?: Record<string, unknown>;
  };
};

export type LegacyWorkflowConfig = Record<string, unknown> & {
  nodes?: LegacyNode[];
};

/**
 * V2 stores trigger settings on the trigger node, while legacy executors read
 * them from workflow.config. Return one compatible view, preferring the v2
 * trigger node when both representations are present.
 */
export function resolveLegacyWorkflowConfig(
  config: LegacyWorkflowConfig | null | undefined,
  triggerType?: string,
): LegacyWorkflowConfig {
  const root = config || {};
  const trigger = Array.isArray(root.nodes)
    ? root.nodes.find((node) =>
        node.type === "trigger" &&
        (!triggerType || node.data?.triggerType === triggerType),
      )
    : undefined;

  return {
    ...root,
    ...(trigger?.data?.config || {}),
  };
}

export function configWithFlattenedTrigger(
  nodes: LegacyNode[],
  triggerType?: string,
): LegacyWorkflowConfig {
  return resolveLegacyWorkflowConfig({ nodes }, triggerType);
}
