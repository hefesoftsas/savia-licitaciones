import type { ChatCompletionRequest, JsonCompletionRequest } from '../types';

const getBridge = () => {
  if (!window.savia) {
    throw new Error('客户端桥接层未初始化');
  }

  return window.savia;
};

export const aiClient = {
  chat(request: ChatCompletionRequest): Promise<string> {
    return getBridge().ai.chat(request);
  },

  requestJson<TResult = unknown>(request: JsonCompletionRequest): Promise<TResult> {
    return getBridge().ai.requestJson<TResult>(request);
  },
};
