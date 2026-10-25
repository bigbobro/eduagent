import type { SettingsValues } from './types';

/** 当前渠道不能删;只剩一个时也不能删。 */
export function canDeleteChannel(
  values: Pick<SettingsValues, 'llmChannels' | 'activeLlmChannelId'>,
  id: string,
): boolean {
  return values.llmChannels.length > 1 && id !== values.activeLlmChannelId;
}
